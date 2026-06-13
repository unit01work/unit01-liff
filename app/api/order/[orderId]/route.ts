import { NextRequest, NextResponse } from "next/server";
import { getOrder, updateOrderShipping, updateOrderFull, setOrderSyncStatus } from "@/lib/sheets";
import { getLineClient } from "@/lib/line";
import { buildOrderFlex } from "@/lib/flex-order";
import { getOrderAmount, saveOrder } from "@/lib/order-store";
import { updateShopifyShippingAddress, getShopifyOrderSnapshot } from "@/lib/shopify";
import { alertOwnerEditFailed } from "@/lib/order-sync";
import { isEditLocked, buildLockedMessage } from "@/lib/edit-lock";

const LIFF_URL = "https://liff.line.me/2010192572-jfj8ev6c";
const BASE_URL = "https://unit01-liff.vercel.app";

// GET /api/order/[orderId] — fetch order from Sheets
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const order = await getOrder(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json(order);
  } catch (err) {
    console.error("GET order error:", err);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

// PUT /api/order/[orderId] — update order (reorder or edit shipping)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await request.json();

    const existingOrder = await getOrder(orderId);
    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const isPaid = (existingOrder["Status"] || "").toUpperCase() === "PAID";
    const isPending = (existingOrder["Status"] || "").toUpperCase() === "PENDING";

    // ── REORDER MODE (PENDING + has cart data) ──
    if (isPending && body.cart && Array.isArray(body.cart)) {
      const { cart, shipping } = body;
      if (!cart.length || !shipping?.firstName) {
        return NextResponse.json({ error: "Invalid reorder data" }, { status: 400 });
      }

      const sub = cart.reduce((s: number, c: { price: number; qty: number }) => s + c.price * c.qty, 0);
      const ship = parseInt(process.env.SHIPPING_FEE || "50", 10);
      const total = sub + ship;

      const itemsStr = cart
        .map((c: { name: string; size: string; qty: number }) => `${c.name} (${c.size}) x${c.qty}`)
        .join(", ");
      const variantIds = cart
        .filter((c: { shopifyVariantId?: string }) => c.shopifyVariantId)
        .map((c: { shopifyVariantId: string; qty: number }) => `${c.shopifyVariantId}:${c.qty}`)
        .join(",");

      const updated = await updateOrderFull(orderId, {
        items: itemsStr,
        subtotal: sub,
        shippingFee: ship,
        total,
        firstName: shipping.firstName,
        lastName: shipping.lastName,
        phone: shipping.phone,
        address: shipping.address,
        subDistrict: shipping.subDistrict,
        district: shipping.district,
        province: shipping.province,
        postalCode: shipping.postalCode,
        variantIds,
      });

      if (!updated) {
        return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
      }

      // Save updated amount for QR
      const orderIdClean = orderId.replace("#", "");
      saveOrder(orderIdClean, total);

      // Send new Flex Message
      if (existingOrder["LINE User ID"] && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
        try {
          const client = getLineClient();
          const host = request.headers.get("host") || "unit01-liff.vercel.app";
          const protocol = host.includes("localhost") ? "http" : "https";
          const qrUrl = `${protocol}://${host}/api/qr/${orderIdClean}?amount=${total}`;

          const flexMsg = buildOrderFlex({
            orderId: existingOrder["Order ID"],
            cart,
            shipping,
            total,
            ship,
            qrUrl,
            liffUrl: LIFF_URL,
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await client.pushMessage({ to: existingOrder["LINE User ID"], messages: [flexMsg as any] });

          // Send payment warning
          await client.pushMessage({
            to: existingOrder["LINE User ID"],
            messages: [{
              type: "text",
              text: "[ ! ] Pay within 10 minutes, or your order is cancelled.",
            }],
          });
        } catch (lineErr) {
          console.error("Reorder Flex failed:", lineErr);
        }
      }

      return NextResponse.json({ success: true, orderId: existingOrder["Order ID"], total });
    }

    // ── EDIT SHIPPING MODE (PAID order) ──
    if (!body.firstName || !body.lastName || !body.phone || !body.address || !body.postalCode) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Time-lock takes precedence over edit-once: past the 10:00 deadline the
    // order is being prepared for shipping and can no longer be edited. Server
    // gate so a customer who kept the LIFF form open past 10:00 is still blocked.
    if (isPaid && isEditLocked(existingOrder)) {
      return NextResponse.json({ error: buildLockedMessage(orderId) }, { status: 403 });
    }

    // Check address lock for PAID orders
    if (isPaid && existingOrder["Address Changed"] === "YES") {
      return NextResponse.json({ error: "Shipping address has already been edited once. No further changes allowed." }, { status: 403 });
    }

    // Update Google Sheets
    const updated = await updateOrderShipping(orderId, body);
    if (!updated) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Send confirmation
    const order = await getOrder(orderId);
    if (order && order["LINE User ID"] && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      try {
        const client = getLineClient();

        if (!isPaid) {
          // PENDING: Resend Flex + QR
          const total = order["Total"];
          const ship = order["Shipping Fee"];
          const cartSimple = [{ name: order["Items"], size: "", price: total - ship, qty: 1 }];
          const storedAmount = getOrderAmount(orderId) ?? total;
          const qrUrl = `${BASE_URL}/api/qr/${orderId}?amount=${storedAmount}`;

          const flexMsg = buildOrderFlex({
            orderId: order["Order ID"],
            cart: cartSimple,
            shipping: body,
            total,
            ship,
            qrUrl,
            liffUrl: LIFF_URL,
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await client.pushMessage({ to: order["LINE User ID"], messages: [flexMsg as any] });
        }

        // Confirmation text
        const confirmText = `SHIPPING ADDRESS UPDATED [ Confirmed ]\n#${orderId}\n\n${body.firstName} ${body.lastName}\n${body.address}\n${body.subDistrict} ${body.district}\n${body.province} ${body.postalCode}\nTel: ${body.phone}`;
        await client.pushMessage({
          to: order["LINE User ID"],
          messages: [{ type: "text", text: confirmText }],
        });

        // Update Shopify for PAID orders. The sheet is already updated — if
        // Shopify fails we must NOT stay silent (sheet/Shopify would diverge).
        console.log("[PUT] isPaid:", isPaid, "Shopify Order ID:", order["Shopify Order ID"] || "NONE");
        if (isPaid && order["Shopify Order ID"]) {
          let synced = false;
          let reason = "";
          try {
            synced = await updateShopifyShippingAddress(order["Shopify Order ID"], {
              firstName: body.firstName,
              lastName: body.lastName,
              address1: body.address,
              address2: body.subDistrict,
              city: body.district,
              province: body.province,
              zip: body.postalCode,
              phone: body.phone,
            });
            if (!synced) reason = "Shopify orderUpdate returned errors (see logs)";
          } catch (shopifyErr) {
            reason = shopifyErr instanceof Error ? shopifyErr.message : String(shopifyErr);
            console.error("Shopify shipping update failed:", reason);
          }
          // Read-back verify: re-read the order and confirm the address actually
          // landed on Shopify (address1/address2/zip), not just that the mutation
          // returned ok. Closes any "succeeded silently but didn't persist" gap.
          if (synced) {
            try {
              const snap = await getShopifyOrderSnapshot(order["Shopify Order ID"]);
              const norm = (s: string) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();
              if (!snap.found) {
                synced = false;
                reason = "read-back: order not found after update";
              } else if (
                norm(snap.shippingAddress1 || "") !== norm(body.address) ||
                norm(snap.shippingAddress2 || "") !== norm(body.subDistrict) ||
                norm(snap.shippingZip || "") !== norm(body.postalCode)
              ) {
                synced = false;
                reason =
                  `read-back mismatch — Shopify addr1:"${snap.shippingAddress1}" ` +
                  `addr2:"${snap.shippingAddress2}" zip:"${snap.shippingZip}"`;
              }
            } catch (vErr) {
              synced = false;
              reason = "read-back verify failed: " + (vErr instanceof Error ? vErr.message : String(vErr));
            }
          }
          if (synced) {
            await setOrderSyncStatus(orderId, "").catch(() => {});
          } else {
            console.error("[PUT] Shipping sync FAILED (not silent):", orderId, reason);
            await setOrderSyncStatus(orderId, `FAILED shipping→Shopify: ${reason}`).catch((e) =>
              console.error("[PUT] could not flag sync status:", e)
            );
            await alertOwnerEditFailed(orderId, order, "shipping", reason);
          }
        } else if (isPaid) {
          // Paid order with no Shopify Order ID — original sync never happened.
          console.error("[PUT] Shipping edit but no Shopify Order ID:", orderId);
          await setOrderSyncStatus(orderId, "FAILED shipping→Shopify: no Shopify Order ID").catch(() => {});
          await alertOwnerEditFailed(orderId, order, "shipping", "No Shopify Order ID on order row");
        }
      } catch (lineErr) {
        console.error("Reply failed:", lineErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT order error:", err);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}

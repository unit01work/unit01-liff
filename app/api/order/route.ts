import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { getLineClient } from "@/lib/line";
import { saveOrder } from "@/lib/order-store";
import { buildOrderFlex } from "@/lib/flex-order";
import { createOrderGuarded, type ReserveLineItem } from "@/lib/sheets";
import { alertOwnerNotifyFailed } from "@/lib/order-sync";
import { PRODUCTS_CACHE_TAG } from "@/lib/products";

interface CartItem {
  name: string;
  size: string;
  price: number;
  qty: number;
  shopifyVariantId?: string;
}

interface OrderBody {
  cart: CartItem[];
  shipping: {
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    postalCode: string;
    subDistrict: string;
    district: string;
    province: string;
  };
  lineUserId: string;
}

function generateOrderId(): string {
  return `#UT-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

const LIFF_URL = "https://liff.line.me/2010192572-jfj8ev6c";

export async function POST(request: NextRequest) {
  try {
    const body: OrderBody = await request.json();

    if (!body.cart?.length || !body.shipping?.firstName) {
      return NextResponse.json({ error: "Invalid order data" }, { status: 400 });
    }

    const orderId = generateOrderId();
    const { cart, shipping } = body;
    const sub = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const ship = parseInt(process.env.SHIPPING_FEE || "0", 10);
    const total = sub + ship;
    const orderIdClean = orderId.replace("#", "");

    // Build QR URL
    const host = request.headers.get("host") || "unit01-liff.vercel.app";
    const protocol = host.includes("localhost") ? "http" : "https";
    const qrUrl = `${protocol}://${host}/api/qr/${orderIdClean}?amount=${total}`;

    console.log("=== NEW ORDER ===");
    console.log("Order ID:", orderId);
    console.log("Total:", total);
    console.log("LINE User:", body.lineUserId);
    console.log("=================");

    // Build variant IDs string + line items for the stock guard.
    const variantIds = cart
      .filter((c) => c.shopifyVariantId)
      .map((c) => `${c.shopifyVariantId}:${c.qty}`)
      .join(",");
    const lineItems: ReserveLineItem[] = cart
      .filter((c) => c.shopifyVariantId)
      .map((c) => ({
        name: c.name,
        size: c.size,
        variantId: c.shopifyVariantId!,
        qty: c.qty,
      }));

    // 1. Guarded create — server-side stock check + append + RESERVED log, all
    //    inside one serialised (withLock) critical section. This prevents both
    //    oversell (two buyers for the last unit) and lost orders (concurrent
    //    addRow clobbering). On a stock-error/throw we DO NOT create the order.
    let guard;
    try {
      guard = await createOrderGuarded(
        {
          orderId,
          lineUserId: body.lineUserId,
          items: cart,
          sub,
          ship,
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
        },
        lineItems
      );
    } catch (sheetErr) {
      console.error(
        "❌ createOrderGuarded threw:",
        sheetErr instanceof Error ? sheetErr.message : String(sheetErr)
      );
      // Sheet error (e.g. quota) — ask the client to retry rather than risk a
      // half-saved order or an oversell from skipping the check.
      return NextResponse.json(
        { error: "order_busy", message: "ระบบกำลังประมวลผลออเดอร์ กรุณาลองใหม่อีกครั้ง" },
        { status: 503 }
      );
    }

    if (!guard.ok) {
      console.warn("⛔️ Order rejected (out of stock):", guard.reason);
      return NextResponse.json(
        { error: "out_of_stock", message: "สินค้าบางรายการหมด กรุณาตรวจสอบตะกร้าอีกครั้ง" },
        { status: 409 }
      );
    }
    console.log("✅ Saved to Google Sheets (guarded)");

    // 2. Save order amount for QR generation (in-memory) — only after the order
    //    row is actually persisted.
    saveOrder(orderIdClean, total);

    // These units are now reserved (PENDING). Purge the shop's availability
    // cache immediately so a size that just sold out shows as struck-through on
    // the next shop load instead of after the time-based cache expires.
    revalidateTag(PRODUCTS_CACHE_TAG, { expire: 0 });

    // 3. Notify the customer on LINE (Flex + QR + payment-timeout warning) AFTER
    //    the HTTP response is sent. The client only needs `orderId` to show the
    //    QR screen, so blocking the response on two LINE round-trips just made
    //    checkout feel slow. `after()` (next/server) runs this once the response
    //    has flushed; on Vercel it's kept alive via waitUntil.
    //
    //    never-silent: a failure here used to only console.error. Now that it
    //    runs post-response, that would vanish — so on failure we ALSO push an
    //    owner alert so a customer who didn't get their QR is never lost quietly.
    if (
      body.lineUserId &&
      process.env.LINE_CHANNEL_ACCESS_TOKEN &&
      process.env.LINE_CHANNEL_ACCESS_TOKEN !== "YOUR_CHANNEL_ACCESS_TOKEN_HERE"
    ) {
      after(async () => {
        try {
          const client = getLineClient();
          const flexMsg = buildOrderFlex({
            orderId,
            cart,
            shipping,
            total,
            ship,
            qrUrl,
            liffUrl: LIFF_URL,
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await client.pushMessage({ to: body.lineUserId, messages: [flexMsg as any] });
          // Payment timeout warning
          await client.pushMessage({
            to: body.lineUserId,
            messages: [{
              type: "text",
              text: "[ ! ] Pay within 10 minutes, or your order is cancelled.",
            }],
          });
          console.log("Flex Message sent (after response):", orderId);
        } catch (flexErr: unknown) {
          const reason =
            flexErr && typeof flexErr === "object" && "body" in flexErr
              ? String((flexErr as { body: unknown }).body)
              : String(flexErr);
          console.error("Flex message failed (deferred):", reason);
          // never-silent — alert the owner that the customer may not have the QR.
          await alertOwnerNotifyFailed(
            orderId,
            {
              customer: `${shipping.firstName} ${shipping.lastName}`.trim(),
              items: cart.map((c) => `${c.name} (${c.size}) x${c.qty}`).join(", "),
              total,
              phone: shipping.phone,
              lineUserId: body.lineUserId,
            },
            reason
          );
        }
      });
    }

    const orderText = `Order ${orderId} — Total ฿${total.toLocaleString("en-US")}`;
    return NextResponse.json({ orderId, orderText });
  } catch (err) {
    console.error("Order error:", err);
    return NextResponse.json({ error: "Failed to process order" }, { status: 500 });
  }
}

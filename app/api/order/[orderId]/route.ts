import { NextRequest, NextResponse } from "next/server";
import { getOrder, updateOrderShipping } from "@/lib/sheets";
import { getLineClient } from "@/lib/line";
import { buildOrderFlex } from "@/lib/flex-order";
import { getOrderAmount } from "@/lib/order-store";
import { updateShopifyShippingAddress } from "@/lib/shopify";

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

// PUT /api/order/[orderId] — update shipping info + resend Flex Message
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const body: {
      firstName: string;
      lastName: string;
      phone: string;
      address: string;
      subDistrict: string;
      district: string;
      province: string;
      postalCode: string;
    } = await request.json();

    if (!body.firstName || !body.lastName || !body.phone || !body.address || !body.postalCode) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Update Google Sheets
    const updated = await updateOrderShipping(orderId, body);
    if (!updated) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Fetch updated order to resend Flex Message
    const order = await getOrder(orderId);
    if (order && order["LINE User ID"] && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      try {
        const client = getLineClient();
        const total = order["Total"];
        const ship = order["Shipping Fee"];

        // Rebuild cart-like structure from stored items string
        const cartSimple = [{ name: order["Items"], size: "", price: total - ship, qty: 1 }];

        // Try to get QR amount from memory, fallback to stored total
        const storedAmount = getOrderAmount(orderId) ?? total;
        const qrUrl = `${BASE_URL}/api/qr/${orderId}?amount=${storedAmount}`;

        const shippingInfo = {
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone,
          address: body.address,
          subDistrict: body.subDistrict,
          district: body.district,
          province: body.province,
          postalCode: body.postalCode,
        };

        const flexMsg = buildOrderFlex({
          orderId: order["Order ID"],
          cart: cartSimple,
          shipping: shippingInfo,
          total,
          ship,
          qrUrl,
          liffUrl: LIFF_URL,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await client.pushMessage({ to: order["LINE User ID"], messages: [flexMsg as any] });
        console.log("Resent Flex Message after edit");

        // Send address update confirmation
        const confirmText = `SHIPPING ADDRESS UPDATED [ Confirmed ]\n#${orderId}\n\n${body.firstName} ${body.lastName}\n${body.address}\n${body.subDistrict} ${body.district}\n${body.province} ${body.postalCode}\nTel: ${body.phone}`;
        await client.pushMessage({
          to: order["LINE User ID"],
          messages: [{ type: "text", text: confirmText }],
        });

        // Update Shopify order shipping if exists
        if (order["Shopify Order ID"]) {
          try {
            await updateShopifyShippingAddress(order["Shopify Order ID"], {
              firstName: body.firstName,
              lastName: body.lastName,
              address1: body.address,
              address2: body.subDistrict,
              city: body.district,
              province: body.province,
              zip: body.postalCode,
              phone: body.phone,
            });
            console.log("Shopify shipping updated for order:", orderId);
          } catch (shopifyErr) {
            console.error("Shopify shipping update failed:", shopifyErr);
          }
        }
      } catch (lineErr) {
        console.error("Resend Flex failed:", lineErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT order error:", err);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}

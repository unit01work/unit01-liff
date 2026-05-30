import { NextRequest, NextResponse } from "next/server";
import { getLineClient } from "@/lib/line";
import { saveOrder } from "@/lib/order-store";
import { buildOrderFlex } from "@/lib/flex-order";
import { appendOrder } from "@/lib/sheets";

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
    const ship = 50;
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

    // 1. Save order amount for QR generation (in-memory)
    saveOrder(orderIdClean, total);

    // 2. Save to Google Sheets
    try {
      // Build variant IDs string: "shopifyVariantId:qty,shopifyVariantId:qty"
      const variantIds = cart
        .filter((c) => c.shopifyVariantId)
        .map((c) => `${c.shopifyVariantId}:${c.qty}`)
        .join(",");

      await appendOrder({
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
      });
      console.log("✅ Saved to Google Sheets");
    } catch (sheetErr) {
      console.error("❌ Google Sheets save failed:", sheetErr instanceof Error ? sheetErr.message : String(sheetErr));
      // Don't block the order if Sheets fails
    }

    // 3. Send Flex Message
    if (
      body.lineUserId &&
      process.env.LINE_CHANNEL_ACCESS_TOKEN &&
      process.env.LINE_CHANNEL_ACCESS_TOKEN !== "YOUR_CHANNEL_ACCESS_TOKEN_HERE"
    ) {
      const client = getLineClient();
      try {
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
        console.log("Flex Message sent");
      } catch (flexErr: unknown) {
        if (flexErr && typeof flexErr === "object" && "body" in flexErr) {
          console.error("LINE API error:", String((flexErr as { body: unknown }).body));
        } else {
          console.error("Flex message failed:", String(flexErr));
        }
      }
    }

    const orderText = `Order ${orderId} — Total ฿${total.toLocaleString("en-US")}`;
    return NextResponse.json({ orderId, orderText });
  } catch (err) {
    console.error("Order error:", err);
    return NextResponse.json({ error: "Failed to process order" }, { status: 500 });
  }
}

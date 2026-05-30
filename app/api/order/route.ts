import { NextRequest, NextResponse } from "next/server";
import { getLineClient } from "@/lib/line";
import { saveOrder } from "@/lib/order-store";
import { buildOrderFlex } from "@/lib/flex-order";
import { fmt } from "@/lib/tokens";

interface CartItem {
  name: string;
  size: string;
  price: number;
  qty: number;
}

interface OrderBody {
  cart: CartItem[];
  shipping: {
    name: string;
    phone: string;
    address: string;
    city: string;
    zip: string;
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

    if (!body.cart?.length || !body.shipping?.name) {
      return NextResponse.json({ error: "Invalid order data" }, { status: 400 });
    }

    const orderId = generateOrderId();
    const { cart, shipping } = body;
    const sub = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const ship = 50;
    const total = sub + ship;

    // Save order amount for QR generation
    const orderIdClean = orderId.replace("#", "");
    saveOrder(orderIdClean, total);

    // Build QR URL
    const host = request.headers.get("host") || "unit01-liff.vercel.app";
    const protocol = host.includes("localhost") ? "http" : "https";
    const qrUrl = `${protocol}://${host}/api/qr/${orderIdClean}?amount=${total}`;

    // Build order text for fallback
    const items = cart
      .map(
        (c) =>
          `• ${c.name} (${c.size}) ×${c.qty} — ฿${(c.price * c.qty).toLocaleString("en-US")}`
      )
      .join("\n");

    const orderText = `🛒 Order ${orderId}\n${items}\nTotal: ฿${total.toLocaleString("en-US")}`;

    console.log("=== NEW ORDER ===");
    console.log("Order ID:", orderId);
    console.log("Total:", total);
    console.log("LINE User:", body.lineUserId);
    console.log("Items:", JSON.stringify(body.cart, null, 2));
    console.log("Shipping:", JSON.stringify(body.shipping, null, 2));
    console.log("QR URL:", qrUrl);
    console.log("=================");

    // Send Flex Message via push
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

        await client.pushMessage({
          to: body.lineUserId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages: [flexMsg as any],
        });
        console.log("LINE Flex Message sent");
      } catch (flexErr: unknown) {
        // Log full LINE API error body for debugging
        if (flexErr && typeof flexErr === "object" && "response" in flexErr) {
          const r = flexErr.response as { status?: number; data?: unknown };
          console.error("LINE API error status:", r.status);
          console.error("LINE API error body:", JSON.stringify(r.data));
        } else {
          console.error("Flex message failed:", String(flexErr));
        }
        console.error("Flex message failed, sending text fallback:", flexErr);
        // Fallback to plain text
        try {
          await client.pushMessage({
            to: body.lineUserId,
            messages: [
              { type: "text", text: orderText },
              { type: "text", text: `💳 สแกนจ่าย PromptPay ${fmt(total)}\nกรุณาชำระภายใน 24 ชม.\nแล้วส่งสลิปมาที่แชทนี้` },
            ],
          });
          console.log("Fallback text message sent");
        } catch (textErr) {
          console.error("Text fallback also failed:", textErr);
        }
      }
    }

    return NextResponse.json({ orderId, orderText });
  } catch (err) {
    console.error("Order error:", err);
    return NextResponse.json({ error: "Failed to process order" }, { status: 500 });
  }
}

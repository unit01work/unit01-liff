import { NextRequest, NextResponse } from "next/server";

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

function buildOrderText(orderId: string, body: OrderBody): string {
  const { cart, shipping } = body;
  const sub = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const ship = 50;
  const total = sub + ship;

  const items = cart
    .map(
      (c) =>
        `• ${c.name} (${c.size}) ×${c.qty} — ฿${(c.price * c.qty).toLocaleString("en-US")}`
    )
    .join("\n");

  return `🛒 คำสั่งซื้อ UNIT-01

Order: ${orderId}
━━━━━━━━━━━━━━
${items}
━━━━━━━━━━━━━━
รวม: ฿${sub.toLocaleString("en-US")}
ค่าส่ง: ฿${ship}
ยอดชำระ: ฿${total.toLocaleString("en-US")}

📦 จัดส่งถึง:
${shipping.name}
${shipping.address}, ${shipping.city} ${shipping.zip}
โทร: ${shipping.phone}

💳 กรุณาชำระเงินผ่าน PromptPay
แล้วส่งสลิปมาที่แชทนี้`;
}

export async function POST(request: NextRequest) {
  try {
    const body: OrderBody = await request.json();

    if (!body.cart?.length || !body.shipping?.name) {
      return NextResponse.json({ error: "Invalid order data" }, { status: 400 });
    }

    const orderId = generateOrderId();
    const orderText = buildOrderText(orderId, body);

    console.log("=== NEW ORDER ===");
    console.log("Order ID:", orderId);
    console.log("LINE User:", body.lineUserId);
    console.log("Items:", JSON.stringify(body.cart, null, 2));
    console.log("Shipping:", JSON.stringify(body.shipping, null, 2));
    console.log("=================");

    // Order text is returned to the client — liff.sendMessages() handles sending
    // Push message removed to prevent duplicate messages in LINE Chat
    return NextResponse.json({ orderId, orderText });
  } catch (err) {
    console.error("Order error:", err);
    return NextResponse.json({ error: "Failed to process order" }, { status: 500 });
  }
}

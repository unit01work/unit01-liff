import { NextRequest, NextResponse } from "next/server";
import { validateSignature } from "@line/bot-sdk";
import { getLineClient } from "@/lib/line";
import { downloadLineImage, verifySlip } from "@/lib/slipok";
import {
  findPendingOrder,
  checkDuplicateTransRef,
  updateOrderStatus,
  getOrder,
  updateShopifyOrderId,
} from "@/lib/sheets";
import { createShopifyDraftOrder } from "@/lib/shopify";

const LIFF_URL = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}`;

/* ── keyword maps ── */
const SHOP_KEYWORDS = ["สั่งซื้อ", "shop", "ซื้อ", "สินค้า", "ร้าน", "เปิดร้าน", "order"];
const STATUS_KEYWORDS = ["สถานะ", "status", "ออเดอร์", "คำสั่งซื้อ"];
const HELP_KEYWORDS = ["help", "ช่วย", "วิธี", "menu", "เมนู"];

function matchKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase().trim();
  return keywords.some((k) => lower.includes(k));
}

/* ── reply builders ── */
function shopReply() {
  return [
    {
      type: "text" as const,
      text: `🛍️ UNIT-01 Shop\n\nกดลิงก์ด้านล่างเพื่อเปิดร้านค้าและสั่งซื้อสินค้าได้เลยครับ\n\n👉 ${LIFF_URL}`,
    },
  ];
}

function statusReply() {
  return [
    {
      type: "text" as const,
      text: `📦 ตรวจสอบสถานะ\n\nหากต้องการเช็คสถานะออเดอร์ กรุณาแจ้งหมายเลขออเดอร์ (เช่น #UT-XXXXXX) มาได้เลยครับ\n\nหรือหากส่งสลิปแล้ว รอทีมงานตรวจสอบภายใน 24 ชม. ครับ`,
    },
  ];
}

function helpReply() {
  return [
    {
      type: "text" as const,
      text: `📋 UNIT-01 Menu\n\n🛍️ พิมพ์ "สั่งซื้อ" — เปิดร้านค้า\n📦 พิมพ์ "สถานะ" — เช็คสถานะออเดอร์\n🖼️ ส่งรูปสลิป — แจ้งชำระเงิน\n\nหรือกดลิงก์เปิดร้าน:\n👉 ${LIFF_URL}`,
    },
  ];
}

function defaultReply() {
  return [
    {
      type: "text" as const,
      text: `สวัสดีครับ ยินดีต้อนรับสู่ UNIT-01 🖤\n\nพิมพ์ "สั่งซื้อ" เพื่อเปิดร้านค้า\nพิมพ์ "สถานะ" เพื่อเช็คออเดอร์\nหรือพิมพ์ "เมนู" เพื่อดูคำสั่งทั้งหมด`,
    },
  ];
}

/* ── Slip verification reply messages ── */
function replyConfirmPayment(orderId: string, amount: number) {
  const id = orderId.startsWith("#") ? orderId : `#${orderId}`;
  return [
    {
      type: "text" as const,
      text: `ORDER CONFIRMED\n${id} · ฿${amount.toLocaleString()}\n\nPREPARING FOR DISPATCH.\nYOUR FIRST UNIT. USE IT WELL.`,
    },
  ];
}

function replyNoMatchingOrder(amount: number) {
  return [
    {
      type: "text" as const,
      text: `⚠️ ไม่พบออเดอร์ที่ตรงกับยอดโอน ฿${amount.toLocaleString()}\n\nกรุณาตรวจสอบยอดเงินอีกครั้ง\nหรือติดต่อร้านค้าเพื่อตรวจสอบ`,
    },
  ];
}

function replyInvalidSlip() {
  return [
    {
      type: "text" as const,
      text: `❌ ไม่สามารถตรวจสอบสลิปได้\n\nกรุณาส่งรูปสลิปที่ชัดเจน\nโดยต้องเห็น QR Code บนสลิปครบถ้วน`,
    },
  ];
}

function replyDuplicateSlip() {
  return [
    {
      type: "text" as const,
      text: `⚠️ สลิปนี้เคยใช้ยืนยันแล้ว\n\nกรุณาส่งสลิปใบใหม่`,
    },
  ];
}

/* ── Handle image (slip) message ── */
async function handleSlipImage(
  messageId: string,
  userId: string
): Promise<{ type: "text"; text: string }[]> {
  try {
    // 1. Download image from LINE
    console.log("[slip] Downloading image:", messageId);
    const imageBuffer = await downloadLineImage(messageId);
    console.log("[slip] Image size:", imageBuffer.length);

    // 2. Verify with SlipOK
    console.log("[slip] Sending to SlipOK...");
    const slipResult = await verifySlip(imageBuffer);
    console.log("[slip] SlipOK result:", JSON.stringify(slipResult));

    // 3. Check if slip is valid
    if (!slipResult.success || !slipResult.data?.success) {
      console.log("[slip] Invalid slip");
      return replyInvalidSlip();
    }

    const amount = slipResult.data.amount;
    const transRef = slipResult.data.transRef;
    console.log("[slip] Amount:", amount, "TransRef:", transRef);

    // 4. Check for duplicate transRef
    const isDuplicate = await checkDuplicateTransRef(transRef);
    if (isDuplicate) {
      console.log("[slip] Duplicate transRef:", transRef);
      return replyDuplicateSlip();
    }

    // 5. Find matching PENDING order
    const order = await findPendingOrder(userId, amount);
    if (!order) {
      console.log("[slip] No matching order for userId:", userId, "amount:", amount);
      return replyNoMatchingOrder(amount);
    }

    // 6. Update order status to PAID
    const orderId = order["Order ID"];
    console.log("[slip] Updating order:", orderId);
    await updateOrderStatus(orderId, "PAID", transRef);

    // 7. Create Shopify Draft Order
    try {
      const freshOrder = await getOrder(orderId);
      if (freshOrder && freshOrder["Variant IDs"]) {
        const shopifyOrder = await createShopifyDraftOrder(freshOrder);
        await updateShopifyOrderId(orderId, String(shopifyOrder.id));
        console.log("[slip] Shopify Draft Order created:", shopifyOrder.id);
      } else {
        console.log("[slip] No variant IDs, skipping Shopify Draft Order");
      }
    } catch (shopifyErr) {
      console.error("[slip] Shopify Draft Order failed:", shopifyErr);
      // Don't block payment confirmation if Shopify fails
    }

    // 8. Return confirmation
    return replyConfirmPayment(orderId, amount);
  } catch (err) {
    console.error("[slip] Error processing slip:", err);
    return replyInvalidSlip();
  }
}

/* ── webhook handler ── */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Verify LINE signature
    const signature = request.headers.get("x-line-signature");
    const secret = process.env.LINE_CHANNEL_SECRET;

    if (signature && secret) {
      const isValid = validateSignature(rawBody, secret, signature);
      if (!isValid) {
        console.error("Invalid webhook signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }

    const body = JSON.parse(rawBody);
    const events = body.events || [];

    // No token = can't reply
    if (
      !process.env.LINE_CHANNEL_ACCESS_TOKEN ||
      process.env.LINE_CHANNEL_ACCESS_TOKEN === "YOUR_CHANNEL_ACCESS_TOKEN_HERE"
    ) {
      console.log("Webhook received but no access token configured");
      return NextResponse.json({ status: "ok" });
    }

    const client = getLineClient();

    for (const event of events) {
      if (event.type !== "message" || !event.replyToken) continue;

      const replyToken: string = event.replyToken;
      let messages;

      if (event.message.type === "text") {
        const text: string = event.message.text;

        if (matchKeyword(text, SHOP_KEYWORDS)) {
          messages = shopReply();
        } else if (matchKeyword(text, STATUS_KEYWORDS)) {
          messages = statusReply();
        } else if (matchKeyword(text, HELP_KEYWORDS)) {
          messages = helpReply();
        } else {
          messages = defaultReply();
        }
      } else if (event.message.type === "image") {
        // Customer sent an image — verify as payment slip
        const userId = event.source?.userId || "";
        const messageId = event.message.id;
        messages = await handleSlipImage(messageId, userId);
      } else {
        // Sticker, video, audio, etc.
        messages = defaultReply();
      }

      try {
        await client.replyMessage({ replyToken, messages });
        console.log(`Replied to event: ${event.message.type}`);
      } catch (replyErr) {
        console.error("Reply failed:", replyErr);
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ status: "ok" });
  }
}

// LINE Developers Console sends GET to verify webhook URL
export async function GET() {
  return NextResponse.json({ status: "ok" });
}

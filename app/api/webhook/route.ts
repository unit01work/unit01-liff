import { NextRequest, NextResponse } from "next/server";
import { validateSignature } from "@line/bot-sdk";
import { getLineClient } from "@/lib/line";

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

function slipReply() {
  return [
    {
      type: "text" as const,
      text: `✅ ได้รับสลิปเรียบร้อยแล้วครับ\n\nทีมงานจะตรวจสอบและยืนยันออเดอร์ภายใน 24 ชม.\nขอบคุณที่สั่งซื้อกับ UNIT-01 🙏`,
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
        // Customer sent an image (likely a payment slip)
        messages = slipReply();
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

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
  updateOrderSize,
  findLatestOrderByUser,
} from "@/lib/sheets";
import {
  createShopifyDraftOrder,
  getShopifyOrderStatus,
  getProductVariants,
  getProductSizeChart,
} from "@/lib/shopify";
import { buildContactFlex, buildChangeSizeFlex } from "@/lib/flex-messages";

const LIFF_URL = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}`;

/* ── keyword maps ── */
const SHOP_KEYWORDS = ["สั่งซื้อ", "shop", "ซื้อ", "สินค้า", "ร้าน", "เปิดร้าน", "order"];
const STATUS_KEYWORDS = ["สถานะ", "status", "ออเดอร์", "คำสั่งซื้อ"];
const CONTACT_KEYWORDS = ["contact", "ติดต่อ", "contact us"];
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

/* ── Postback handlers ── */

async function handleContact(orderId: string) {
  return [buildContactFlex(orderId)];
}

async function handleChangeSize(orderId: string) {
  const order = await getOrder(orderId);
  if (!order) return [{ type: "text" as const, text: "Order not found." }];

  // Check if already changed
  if (order["Size Changed"] === "YES") {
    return [{
      type: "text" as const,
      text: "You've already changed size once.\nPlease chat with our team for further changes.",
    }];
  }

  // Parse current item info from Items field: "Product Name (Size) x1"
  const itemsStr = order["Items"] || "";
  const itemMatch = itemsStr.match(/^(.+?)\s*\((\w+)\)\s*x(\d+)/);
  if (!itemMatch) {
    return [{ type: "text" as const, text: "Unable to determine current size." }];
  }
  const productName = itemMatch[1].trim();
  const currentSize = itemMatch[2];

  // Get variant IDs to find the product
  const variantIds = order["Variant IDs"] || "";
  const currentVariantId = variantIds.split(":")[0];
  if (!currentVariantId) {
    return [{ type: "text" as const, text: "No variant information found." }];
  }

  // Find the product ID from Shopify using the variant
  // We need to search products to find which product has this variant
  const productsRes = await fetch(
    `https://${process.env.SHOPIFY_STORE}/admin/api/2026-04/products.json?status=active&fields=id,title,variants`,
    {
      headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN! },
    }
  );
  if (!productsRes.ok) {
    return [{ type: "text" as const, text: "Unable to check available sizes." }];
  }
  const productsData = await productsRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const product = productsData.products?.find((p: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p.variants?.some((v: any) => String(v.id) === currentVariantId)
  );
  if (!product) {
    return [{ type: "text" as const, text: "Product not found in store." }];
  }

  // Get available sizes (in stock, not current size)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const availableSizes = product.variants
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((v: any) => v.inventory_quantity > 0 && v.title.toUpperCase() !== currentSize.toUpperCase())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((v: any) => ({ size: v.title, variantId: String(v.id) }));

  if (availableSizes.length === 0) {
    return [{
      type: "text" as const,
      text: `No other sizes available for ${productName}.\nPlease chat with our team.`,
    }];
  }

  // Build messages: 1) Size info text, 2) Size guide image (if exists), 3) Flex to select
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [];

  // Text message with current info
  const availSizeList = availableSizes.map((s: { size: string }) => `[ ${s.size} ]`).join(" ");
  messages.push({
    type: "text",
    text: `CHANGE SIZE\n#${orderId.replace("#", "")}\n${productName}\nCurrent: Size ${currentSize}\nAvailable: ${availSizeList}`,
  });

  // Size guide from metafield
  try {
    const sizeChartUrl = await getProductSizeChart(String(product.id));
    if (sizeChartUrl) {
      messages.push({
        type: "image",
        originalContentUrl: sizeChartUrl,
        previewImageUrl: sizeChartUrl,
      });
    }
  } catch (e) {
    console.log("[webhook] Size chart not available:", e);
  }

  // Flex message to select size
  messages.push(buildChangeSizeFlex({
    orderId,
    productName,
    currentSize,
    availableSizes,
  }));

  return messages;
}

async function handleSelectSize(orderId: string, newSize: string, newVariantId: string) {
  const order = await getOrder(orderId);
  if (!order) return [{ type: "text" as const, text: "Order not found." }];

  // Check if already changed
  if (order["Size Changed"] === "YES") {
    return [{
      type: "text" as const,
      text: "You've already changed size once.\nPlease chat with our team for further changes.",
    }];
  }

  // Check stock for the new variant
  const productsRes = await fetch(
    `https://${process.env.SHOPIFY_STORE}/admin/api/2026-04/products.json?status=active&fields=id,variants`,
    {
      headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN! },
    }
  );
  if (productsRes.ok) {
    const productsData = await productsRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let targetVariant: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of productsData.products || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = p.variants?.find((v: any) => String(v.id) === newVariantId);
      if (v) { targetVariant = v; break; }
    }
    if (targetVariant && targetVariant.inventory_quantity <= 0) {
      return [{
        type: "text" as const,
        text: `Size ${newSize} is currently out of stock.\nPlease select another size or chat with our team.`,
      }];
    }
  }

  // Parse current size from Items
  const itemsStr = order["Items"] || "";
  const itemMatch = itemsStr.match(/^(.+?)\s*\((\w+)\)\s*x(\d+)/);
  const productName = itemMatch ? itemMatch[1].trim() : "Product";
  const oldSize = itemMatch ? itemMatch[2] : "?";

  // Update Google Sheets
  await updateOrderSize(orderId, oldSize, newSize, newVariantId);

  // TODO: Update Shopify order line item if needed (requires order edit API)

  console.log(`[webhook] Size changed: ${orderId} ${oldSize} → ${newSize}`);

  return [{
    type: "text" as const,
    text: `SIZE UPDATED [ Confirmed ]\n#${orderId.replace("#", "")}\n\n${productName}\nSize changed: ${oldSize} → ${newSize}`,
  }];
}

async function handleTrackOrder(orderId: string) {
  const order = await getOrder(orderId);
  if (!order) return [{ type: "text" as const, text: "Order not found." }];

  const displayId = `#${orderId.replace("#", "")}`;
  const items = order["Items"] || "";
  const total = Number(order["Total"]) || 0;
  const status = (order["Status"] || "").toUpperCase();

  // Status 1: Not paid yet
  if (status === "PENDING") {
    return [{
      type: "text" as const,
      text: `ORDER STATUS [ Awaiting Payment ]\n${displayId}\n\n${items}\nTotal: ฿${total.toLocaleString()}\n\nPlease complete payment and\nsend transfer slip to this chat.`,
    }];
  }

  // Check Shopify for fulfillment info
  const shopifyOrderId = order["Shopify Order ID"];
  if (shopifyOrderId) {
    try {
      const shopifyOrder = await getShopifyOrderStatus(shopifyOrderId);
      if (shopifyOrder) {
        const fulfillment = shopifyOrder.fulfillments?.[0];

        // Status 3: Shipped with tracking
        if (fulfillment && fulfillment.tracking_number) {
          const carrier = fulfillment.tracking_company || "Carrier";
          const tracking = fulfillment.tracking_number;
          const trackUrl = fulfillment.tracking_url || "";

          let text = `ORDER STATUS [ Shipped ]\n${displayId}\n\n${items}\n\nCarrier: ${carrier}\nTracking: ${tracking}`;
          if (trackUrl) text += `\n\nTrack here:\n${trackUrl}`;
          return [{ type: "text" as const, text }];
        }

        // Status 4: Shipped without tracking
        if (shopifyOrder.fulfillment_status === "fulfilled") {
          return [{
            type: "text" as const,
            text: `ORDER STATUS [ Shipped ]\n${displayId}\n\n${items}\n\nYour order has been shipped.\nTracking number will be updated soon.`,
          }];
        }
      }
    } catch (e) {
      console.error("[webhook] Track order Shopify error:", e);
    }
  }

  // Status 2: Paid, not shipped yet
  return [{
    type: "text" as const,
    text: `ORDER STATUS [ Processing ]\n${displayId}\n\n${items}\nTotal: ฿${total.toLocaleString()}\n\nYour order is being prepared.\nEstimated dispatch: 1-3 business days.`,
  }];
}

function handleChatTeam() {
  return [{
    type: "text" as const,
    text: "Please type your message.\nOur team will reply shortly.",
  }];
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
      if (!event.replyToken) continue;
      const replyToken: string = event.replyToken;
      let messages;

      // ── Postback events ──
      if (event.type === "postback") {
        const params = new URLSearchParams(event.postback.data);
        const action = params.get("action");
        const postbackOrderId = params.get("orderId") || "";

        switch (action) {
          case "contact":
            messages = await handleContact(postbackOrderId);
            break;
          case "change_size":
            messages = await handleChangeSize(postbackOrderId);
            break;
          case "track":
            messages = await handleTrackOrder(postbackOrderId);
            break;
          case "chat_team":
            messages = handleChatTeam();
            break;
          case "select_size": {
            const size = params.get("size") || "";
            const variantId = params.get("variantId") || "";
            messages = await handleSelectSize(postbackOrderId, size, variantId);
            break;
          }
          default:
            messages = [{ type: "text" as const, text: "Unknown action." }];
        }

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await client.replyMessage({ replyToken, messages: messages as any });
          console.log(`Replied to postback: ${action}`);
        } catch (replyErr) {
          console.error("Postback reply failed:", replyErr);
        }
        continue;
      }

      // ── Message events ──
      if (event.type !== "message") continue;

      if (event.message.type === "text") {
        const text: string = event.message.text;

        if (matchKeyword(text, SHOP_KEYWORDS)) {
          messages = shopReply();
        } else if (matchKeyword(text, CONTACT_KEYWORDS)) {
          // Find latest order for this user → show Contact menu
          const userId = event.source?.userId || "";
          if (userId) {
            const latestOrder = await findLatestOrderByUser(userId);
            if (latestOrder) {
              messages = await handleContact(latestOrder["Order ID"]);
            } else {
              messages = [{ type: "text" as const, text: "No orders found.\nPlease place an order first." }];
            }
          } else {
            messages = [{ type: "text" as const, text: "Unable to identify user." }];
          }
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await client.replyMessage({ replyToken, messages: messages as any });
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

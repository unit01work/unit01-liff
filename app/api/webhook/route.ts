import { NextRequest, NextResponse } from "next/server";
import { validateSignature } from "@line/bot-sdk";
import { getLineClient } from "@/lib/line";
import { downloadLineImage, verifySlip } from "@/lib/slipok";
import {
  claimPaymentForUser,
  updateOrderStatus,
  getOrder,
  setOrderSyncStatus,
  updateOrderSize,
  findLatestOrderByUser,
  findActiveOrders,
  findExpiredOrders,
  logOrderStockMovement,
} from "@/lib/sheets";
import {
  getShopifyOrderStatus,
  getProductVariants,
  getProductSizeChart,
  isOrderUnfulfilled,
  updateShopifyOrderVariant,
  getShopifyOrderSnapshot,
} from "@/lib/shopify";
import {
  syncPaidOrderToShopify,
  alertOwnerOrderFailed,
  alertOwnerEditFailed,
  alertOwnerOrphanPayment,
} from "@/lib/order-sync";
import {
  buildContactFlex,
  buildChangeSizeFlex,
  buildContactMenuNoOrder,
  buildSelectOrderFlex,
} from "@/lib/flex-messages";
import {
  computeEditDeadline,
  formatDeadline,
  isEditLocked,
  buildLockedMessage,
  nowBKK,
} from "@/lib/edit-lock";
import {
  enterChatSession,
  getActiveChatSession,
  touchChatSession,
  endChatSession,
  notifyAdminNewChat,
} from "@/lib/chat-session";

const LIFF_URL = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}`;

/* ── keyword maps ── */
// Catalog / Contact Us keyword auto-replies are configured separately in the
// LINE Official Account console (owner-managed) — not handled here. We keep the
// Contact menu trigger so "contact us" still opens the in-chat support menu.
const CONTACT_KEYWORDS = ["contact", "ติดต่อ", "contact us"];

// Typing any of these while in chat-with-team mode breaks out of the handoff
// (session ends) and the message is handled normally — "return to the shop".
// The customer-facing handoff reply tells them to type MENU for exactly this.
const CHAT_BREAKOUT_KEYWORDS = [
  "menu", "เมนู", "catalog",
  "shop", "สั่งซื้อ", "สินค้า", "ร้าน",
  "status", "สถานะ", "ออเดอร์",
  "contact", "ติดต่อ",
];

function matchKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase().trim();
  return keywords.some((k) => lower.includes(k));
}

// Customer-facing reply when entering chat-with-team mode. A Flex card with a
// "Back to shop" button (postback action=exit_chat) so the customer can leave
// the handoff with one tap — keyword breakout still works as a backup. No time
// promise (so it's not a lie).
function chatEnterReply() {
  return [
    {
      type: "flex",
      altText: "You're now chatting with our team",
      contents: {
        type: "bubble",
        size: "kilo",
        body: {
          type: "box",
          layout: "vertical",
          paddingAll: "lg",
          spacing: "sm",
          contents: [
            { type: "text", text: "LIVE CHAT", size: "xxs", color: "#C47237", weight: "bold" },
            { type: "text", text: "Our team will reply here.", size: "sm", color: "#1A1A1A", weight: "bold", wrap: true },
            { type: "text", text: "Just send your message.", size: "xxs", color: "#999999", wrap: true },
            // Gradient "Back to shop" button (box-as-button so it can carry the
            // SUNRISE linearGradient — Flex button color only takes a solid hex).
            {
              type: "box",
              layout: "vertical",
              margin: "md",
              paddingAll: "md",
              cornerRadius: "md",
              background: {
                type: "linearGradient",
                angle: "90deg",
                startColor: "#0E0B08",
                centerColor: "#A8551F",
                endColor: "#ECB45A",
              },
              action: { type: "postback", label: "Back to shop", data: "action=exit_chat", displayText: "Menu" },
              contents: [
                { type: "text", text: "Back to shop", size: "sm", color: "#FFFFFF", weight: "bold", align: "center" },
              ],
            },
          ],
        },
      },
    },
  ];
}

/* ── reply builders ── */
// Single fallback for any inbound text/sticker that matches no configured
// keyword. Sent as a LINE Flex menu (per LINE message spec §3): three tappable
// rows — How to order (opens the LIFF shop), View products (sends "CATALOG"),
// Contact us (sends "contact us", which CONTACT_KEYWORDS picks up). Each row's
// whole box carries the action so the entire row is tappable.
function fallbackReply() {
  return [
    {
      type: "flex",
      altText: "UNIT-01 — How can we help?",
      contents: {
        type: "bubble",
        size: "kilo",
        body: {
          type: "box",
          layout: "vertical",
          paddingAll: "none",
          contents: [
            // Header
            {
              type: "box",
              layout: "vertical",
              background: {
                type: "linearGradient",
                angle: "90deg",
                startColor: "#0E0B08",
                centerColor: "#A8551F",
                endColor: "#ECB45A",
              },
              paddingAll: "lg",
              contents: [
                { type: "text", text: "UNIT-01", size: "xxs", color: "#FFFFFF", weight: "bold" },
              ],
            },
            // Body
            {
              type: "box",
              layout: "vertical",
              paddingAll: "lg",
              contents: [
                { type: "text", text: "Looking for something?", size: "sm", color: "#1A1A1A", weight: "bold" },
                { type: "text", text: "Choose an option below", size: "xxs", color: "#999999", margin: "xs" },
              ],
            },
            { type: "separator", color: "#EBE7E4" },
            // Option 1: How to order → open shop (LIFF)
            {
              type: "box",
              layout: "horizontal",
              paddingAll: "lg",
              action: { type: "uri", label: "How to order", uri: "https://liff.line.me/2010192572-jfj8ev6c" },
              contents: [
                { type: "text", text: "[ 1 ]", size: "xs", color: "#1A1A1A", weight: "bold", flex: 0 },
                { type: "text", text: "How to order", size: "xs", color: "#1A1A1A", weight: "bold", margin: "lg", flex: 1 },
                { type: "text", text: "›", size: "sm", color: "#C4BFBB", flex: 0, align: "end" },
              ],
            },
            { type: "separator", color: "#EBE7E4" },
            // Option 2: View products → CATALOG
            {
              type: "box",
              layout: "horizontal",
              paddingAll: "lg",
              action: { type: "message", label: "View products", text: "CATALOG" },
              contents: [
                { type: "text", text: "[ 2 ]", size: "xs", color: "#1A1A1A", weight: "bold", flex: 0 },
                { type: "text", text: "View products", size: "xs", color: "#1A1A1A", weight: "bold", margin: "lg", flex: 1 },
                { type: "text", text: "›", size: "sm", color: "#C4BFBB", flex: 0, align: "end" },
              ],
            },
            { type: "separator", color: "#EBE7E4" },
            // Option 3: Contact us
            {
              type: "box",
              layout: "horizontal",
              paddingAll: "lg",
              action: { type: "message", label: "Contact us", text: "contact us" },
              contents: [
                { type: "text", text: "[ 3 ]", size: "xs", color: "#1A1A1A", weight: "bold", flex: 0 },
                { type: "text", text: "Contact us", size: "xs", color: "#1A1A1A", weight: "bold", margin: "lg", flex: 1 },
                { type: "text", text: "›", size: "sm", color: "#C4BFBB", flex: 0, align: "end" },
              ],
            },
            { type: "separator", color: "#EBE7E4" },
            // Footer
            {
              type: "box",
              layout: "horizontal",
              paddingAll: "lg",
              contents: [
                { type: "text", text: "UNIT-01 — OFFICIAL", size: "xxs", color: "#AEA9A1", flex: 1 },
                { type: "text", text: "22-05-1-A", size: "xxs", color: "#C4BFB7", align: "end" },
              ],
            },
          ],
        },
      },
    },
  ];
}

/* ── Slip verification reply messages ── */
// Post-payment (CF) confirmation — sent as TWO separate messages:
//   msg1 = order-number confirmation + brand line
//   msg2 = per-order edit deadline + "edit once" rule
function replyConfirmPayment(orderId: string, amount: number, paidAt: string) {
  const id = orderId.startsWith("#") ? orderId : `#${orderId}`;
  const deadline = formatDeadline(computeEditDeadline(paidAt));
  // msg1 = Flex card (green text only, no top bar, no button); msg2 = edit
  // deadline (kept as a SEPARATE plain-text message — owned by edit-lock).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    {
      type: "flex",
      altText: `ORDER CONFIRMED [ Paid ] — ${id}`,
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          paddingAll: "lg",
          spacing: "sm",
          contents: [
            { type: "text", text: "ORDER CONFIRMED   [ Paid ]", size: "xs", color: "#5B805E", weight: "bold" },
            { type: "text", text: `${id} · ฿${amount}`, size: "sm", color: "#444444" },
            { type: "text", text: "YOUR FIRST UNIT. USE IT WELL.", size: "sm", color: "#1A1714", weight: "bold", wrap: true, margin: "md" },
          ],
        },
      },
    },
  ];
  // Only attach the deadline block if we could compute one (always, for a
  // freshly-paid order — paidAt is "now"). Fail-safe: skip if missing.
  if (deadline) {
    messages.push({
      type: "text" as const,
      text:
        `You can still edit your shipping address or size until:\n\n` +
        `${deadline}\n\n` +
        `Each order can be edited once only.\n` +
        `After this time, your order is locked for shipping.`,
    });
  }
  return messages;
}

function replyNoMatchingOrder(amount: number) {
  return [
    {
      type: "text" as const,
      text: `[ ! ] NO MATCHING ORDER\n฿${amount}\n\nNo order matches this transfer.\nVerify the amount, or type [ Contact Us ] to reach us.`,
    },
  ];
}

function replyInvalidSlip() {
  // Red text-only Flex (no top bar) + a small gray "Still stuck? Contact us"
  // button. The button reuses the EXISTING Contact flow: action message
  // "contact us" → CONTACT_KEYWORDS → buildContactMenuNoOrder (ORDER SUPPORT
  // menu). No new contact card / handler is created.
  return [
    {
      type: "flex",
      altText: "[ x ] SLIP NOT VERIFIED",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          paddingAll: "lg",
          spacing: "sm",
          contents: [
            { type: "text", text: "[ x ]  SLIP NOT VERIFIED", size: "xs", color: "#874545", weight: "bold" },
            { type: "text", text: "We couldn't read your slip — please send it again.", size: "sm", color: "#1A1714", wrap: true, margin: "sm" },
            {
              type: "box",
              layout: "vertical",
              backgroundColor: "#3A3A3A",
              cornerRadius: "md",
              paddingAll: "sm",
              margin: "lg",
              action: { type: "message", label: "Contact us", text: "contact us" },
              contents: [
                { type: "text", text: "Still stuck? Contact us", size: "xs", color: "#FFFFFF", weight: "bold", align: "center" },
              ],
            },
          ],
        },
      },
    },
  ];
}

function replyDuplicateSlip() {
  return [
    {
      type: "text" as const,
      text: `[ ! ] SLIP ALREADY USED\n\nThis slip has already been used to confirm a payment.\nPlease send a new slip, or type [ Contact Us ] if you believe this is an error.`,
    },
  ];
}

/* ── Handle image (slip) message ── */
// Returns LINE messages (text and/or Flex) — widened to any[] because the
// confirm / invalid-slip replies are now Flex while the others stay text.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSlipImage(
  messageId: string,
  userId: string
): Promise<any[]> {
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

    // 4-6. Atomically: reject duplicate slips, find the NEWEST matching PENDING
    //      order (user + exact amount), and mark it PAID — all inside ONE locked
    //      critical section (claimPaymentForUser → withLock). This closes two
    //      races at once: the same transRef delivered twice, AND two distinct
    //      payments for the same user+amount both claiming the same row.
    const claim = await claimPaymentForUser(userId, amount, transRef);
    if (!claim.ok) {
      if (claim.reason === "duplicate") {
        console.log("[slip] Duplicate transRef:", transRef);
        return replyDuplicateSlip();
      }
      // SlipOK already verified this is a REAL payment (we're past the validity
      // check above), but no PENDING order matched — money is in with no order
      // (likely expired before the slip arrived, or amount mismatch). Don't let it
      // vanish silently: alert the owner with everything needed to reconcile.
      console.log("[slip] No matching order for userId:", userId, "amount:", amount);
      await alertOwnerOrphanPayment({ amount, transRef, userId, when: nowBKK() });
      return replyNoMatchingOrder(amount);
    }
    const order = claim.order!;
    const orderId = order["Order ID"];
    console.log("[slip] Claimed + marked PAID:", orderId);

    // Stock Log: SOLD (reserved stock is now a confirmed sale — no extra deduction)
    await logOrderStockMovement(order, "SOLD", 0, "จ่ายเงินแล้ว ขายสำเร็จ");

    // 7. Create Shopify Order (with retry + owner alert on failure).
    //    Runs after the order is persisted PAID so payment is never blocked, but
    //    a failure is no longer silent — see syncPaidOrderToShopify. The claimed
    //    order row already carries the live Variant IDs, so no extra read needed.
    if (order["Variant IDs"]) {
      await syncPaidOrderToShopify(orderId, order);
    } else {
      console.error("[slip] No variant IDs — cannot create Shopify order:", orderId);
      await alertOwnerOrderFailed(
        orderId,
        order,
        "No variant IDs on order row"
      );
    }

    // 8. Return confirmation (deadline computed from the just-set Paid At;
    //    fall back to "now" so the deadline block is always present)
    return replyConfirmPayment(orderId, amount, order["Paid At"] || nowBKK());
  } catch (err) {
    console.error("[slip] Error processing slip:", err);
    return replyInvalidSlip();
  }
}

/* ── Postback handlers ── */

async function handleContact(orderId: string) {
  const order = await getOrder(orderId);
  const addressLocked = order?.["Address Changed"] === "YES";
  const sizeLocked = order?.["Size Changed"] === "YES";
  return [buildContactFlex(orderId, { addressLocked, sizeLocked })];
}

async function handleChangeSize(orderId: string) {
  const order = await getOrder(orderId);
  if (!order) return [{ type: "text" as const, text: "Order not found." }];

  // Time-lock takes precedence: past 10:00 deadline → no edits at all.
  if (isEditLocked(order)) {
    return [{ type: "text" as const, text: buildLockedMessage(orderId) }];
  }

  // Check if already changed
  if (order["Size Changed"] === "YES") {
    const displayId = `#${orderId.replace("#", "")}`;
    return [{
      type: "text" as const,
      text: `Size for order ${displayId} has already been changed.\nType [ Contact Us ] for further changes.`,
    }];
  }

  // Parse current item info from Items field: "Product Name (Size) x1"
  const itemsStr = order["Items"] || "";
  const itemMatch = itemsStr.match(/^(.+?)\s*\((\w+)\)\s*x(\d+)/);
  if (!itemMatch) {
    return [{ type: "text" as const, text: "[ x ] Unable to read current size.\nType [ Contact Us ]." }];
  }
  const productName = itemMatch[1].trim();
  const currentSize = itemMatch[2];

  // Get variant IDs to find the product
  const variantIds = order["Variant IDs"] || "";
  const currentVariantId = variantIds.split(":")[0];
  if (!currentVariantId) {
    return [{ type: "text" as const, text: "[ x ] Size information unavailable.\nType [ Contact Us ]." }];
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
    return [{ type: "text" as const, text: "[ x ] Unable to check available sizes.\nType [ Contact Us ]." }];
  }
  const productsData = await productsRes.json();
  // Stable order: sort by product id ascending (consistency with LIFF + Stock tab).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortedProducts = (productsData.products || []).sort(
    (a: any, b: any) => Number(a.id) - Number(b.id)
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const product = sortedProducts.find((p: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p.variants?.some((v: any) => String(v.id) === currentVariantId)
  );
  if (!product) {
    return [{ type: "text" as const, text: "[ x ] Product not found.\nType [ Contact Us ]." }];
  }

  // Get available sizes (in stock, not current size)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const availableSizes = product.variants
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((v: any) => v.inventory_quantity > 0 && v.title.toUpperCase() !== currentSize.toUpperCase())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((v: any) => ({ size: v.title, variantId: String(v.id), stock: v.inventory_quantity }));

  if (availableSizes.length === 0) {
    return [{
      type: "text" as const,
      text: `No other sizes available for ${productName}.\nType [ Contact Us ].`,
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
    if (sizeChartUrl && sizeChartUrl.startsWith("https://")) {
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

  // Time-lock takes precedence: re-check at commit time (defense in depth — the
  // customer may have crossed 10:00 between opening the size picker and tapping).
  if (isEditLocked(order)) {
    return [{ type: "text" as const, text: buildLockedMessage(orderId) }];
  }

  // Check if already changed
  if (order["Size Changed"] === "YES") {
    const displayId = `#${orderId.replace("#", "")}`;
    return [{
      type: "text" as const,
      text: `Size for order ${displayId} has already been changed.\nType [ Contact Us ] for further changes.`,
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
    // Stable order: sort by product id ascending (consistency with LIFF + Stock tab).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortedProducts = (productsData.products || []).sort(
      (a: any, b: any) => Number(a.id) - Number(b.id)
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let targetVariant: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of sortedProducts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = p.variants?.find((v: any) => String(v.id) === newVariantId);
      if (v) { targetVariant = v; break; }
    }
    if (targetVariant && targetVariant.inventory_quantity <= 0) {
      return [{
        type: "text" as const,
        text: `Size ${newSize} is currently out of stock.\nSelect another size, or type [ Contact Us ].`,
      }];
    }
  }

  // Parse current size from Items
  const itemsStr = order["Items"] || "";
  const itemMatch = itemsStr.match(/^(.+?)\s*\((\w+)\)\s*x(\d+)/);
  const productName = itemMatch ? itemMatch[1].trim() : "Product";
  const oldSize = itemMatch ? itemMatch[2] : "?";

  // Get old variant ID before updating sheets
  const oldVariantId = (order["Variant IDs"] || "").split(":")[0];

  // Update Google Sheets
  await updateOrderSize(orderId, oldSize, newSize, newVariantId);

  // Update Shopify Order line item variant.
  // The sheet is already updated above — if Shopify fails we must NOT stay
  // silent (sheet/Shopify would diverge). Alert the owner + flag the row.
  if (order["Shopify Order ID"] && oldVariantId) {
    let synced = false;
    let reason = "";
    try {
      synced = await updateShopifyOrderVariant(order["Shopify Order ID"], oldVariantId, newVariantId);
      if (!synced) reason = "Shopify orderEdit returned errors (see logs)";
    } catch (shopifyErr) {
      reason = shopifyErr instanceof Error ? shopifyErr.message : String(shopifyErr);
      console.error("[webhook] Shopify variant update failed:", reason);
    }
    // Read-back verify: don't trust the mutation's "ok" — re-read the order and
    // confirm the NEW variant is actually active and the OLD one is gone. This
    // closes any "succeeded silently but didn't land" gap.
    if (synced) {
      try {
        const snap = await getShopifyOrderSnapshot(order["Shopify Order ID"]);
        if (!snap.found) {
          synced = false;
          reason = "read-back: order not found after edit";
        } else {
          const active = snap.activeVariantIds.map(String);
          if (!active.includes(String(newVariantId))) {
            synced = false;
            reason = `read-back mismatch — new variant ${newVariantId} not active (Shopify active: [${active.join(", ")}])`;
          } else if (active.includes(String(oldVariantId))) {
            synced = false;
            reason = `read-back mismatch — old variant ${oldVariantId} still active (Shopify active: [${active.join(", ")}])`;
          }
        }
      } catch (vErr) {
        synced = false;
        reason = "read-back verify failed: " + (vErr instanceof Error ? vErr.message : String(vErr));
      }
    }
    if (synced) {
      console.log("[webhook] Shopify order variant updated:", orderId);
      await setOrderSyncStatus(orderId, "").catch(() => {});
    } else {
      console.error("[webhook] Size sync FAILED (not silent):", orderId, reason);
      await setOrderSyncStatus(orderId, `FAILED size→Shopify: ${reason}`).catch((e) =>
        console.error("[webhook] could not flag sync status:", e)
      );
      await alertOwnerEditFailed(orderId, order, "size", reason);
    }
  } else if (oldVariantId) {
    // Paid order with no Shopify Order ID — the original sync never happened.
    console.error("[webhook] Size change but no Shopify Order ID:", orderId);
    await setOrderSyncStatus(orderId, "FAILED size→Shopify: no Shopify Order ID").catch(() => {});
    await alertOwnerEditFailed(orderId, order, "size", "No Shopify Order ID on order row");
  }

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

/**
 * Get unfulfilled (not yet shipped) PAID orders for a user.
 * Checks Shopify fulfillment status for each order.
 * Optional filter: "address" or "size" to exclude already-changed orders.
 */
async function getUnfulfilledOrders(userId: string, filter?: "address" | "size") {
  const paidOrders = await findActiveOrders(userId, filter);
  if (paidOrders.length === 0) return [];

  // Filter by Shopify fulfillment status
  const results = [];
  for (const order of paidOrders) {
    const shopifyId = order["Shopify Order ID"];
    if (shopifyId) {
      const unfulfilled = await isOrderUnfulfilled(shopifyId);
      if (unfulfilled) results.push(order);
    } else {
      // No Shopify order = hasn't been sent to Shopify yet, include it
      results.push(order);
    }
  }
  return results;
}

/**
 * Get ALL PAID orders for a user (including fulfilled).
 * Used for Track my order — no lock, no fulfillment filter.
 */
async function getAllPaidOrders(userId: string) {
  return await findActiveOrders(userId);
}

/**
 * Map menu action (e.g. "edit_address_menu") to the nextAction key for select_order
 */
function menuActionToNextAction(action: string): string {
  switch (action) {
    case "edit_address_menu": return "edit_address";
    case "change_size_menu": return "change_size";
    case "track_menu": return "track";
    default: return action;
  }
}

/**
 * Handle menu postback actions that don't have an orderId.
 * Checks how many active orders the user has and routes accordingly.
 * Each action has its own filter:
 *   edit_address_menu → PAID + unfulfilled + Address Changed=NO
 *   change_size_menu  → PAID + unfulfilled + Size Changed=NO
 *   track_menu        → ALL PAID (no lock, no fulfillment filter)
 */
async function handleMenuAction(action: string, userId: string) {
  let orders;

  if (action === "track_menu") {
    // Track shows ALL paid orders including fulfilled
    orders = await getAllPaidOrders(userId);
  } else {
    // Edit address / Change size → filter by lock + unfulfilled
    const filter = action === "edit_address_menu" ? "address" : "size";
    orders = await getUnfulfilledOrders(userId, filter);
  }

  if (orders.length === 0) {
    return [{ type: "text" as const, text: "No paid orders found." }];
  }

  // Always show SELECT ORDER — even if only 1 order
  const nextAction = menuActionToNextAction(action);
  const orderList = orders.map((o) => ({
    orderId: o["Order ID"],
    items: o["Items"],
    total: o["Total"],
  }));
  return [buildSelectOrderFlex(orderList, nextAction)];
}

/**
 * Handle select_order postback — user picked an order from the picker.
 */
async function handleSelectOrder(orderId: string, nextAction: string) {
  switch (nextAction) {
    case "edit_address": {
      // Check lock
      const order = await getOrder(orderId);
      const displayId = `#${orderId.replace("#", "")}`;
      // Time-lock takes precedence: past 10:00 deadline the order is being
      // prepared for shipping and cannot be edited at all.
      if (order && isEditLocked(order)) {
        return [{ type: "text" as const, text: buildLockedMessage(orderId) }];
      }
      if (order?.["Address Changed"] === "YES") {
        return [{
          type: "text" as const,
          text: `Shipping address for order ${displayId} has already been edited.\nType [ Contact Us ] for further changes.`,
        }];
      }
      const cleanId = orderId.replace("#", "");
      const editUri = `${LIFF_URL}?page=edit&order=${cleanId}`;
      return [
        {
          type: "text" as const,
          text: `[ ! ] EDIT SHIPPING ADDRESS — ONCE ONLY\n${displayId}\n\nThis is your only edit. It cannot be changed again.\nCheck every detail before you confirm.`,
        },
        {
          type: "text" as const,
          text: editUri,
        },
      ];
    }
    case "change_size":
      return await handleChangeSize(orderId);
    case "track":
      return await handleTrackOrder(orderId);
    default:
      return [{ type: "text" as const, text: "Unknown action." }];
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

    // Piggyback: check and expire old PENDING orders on every webhook call
    try {
      const expired = await findExpiredOrders(5);
      for (const eo of expired) {
        await updateOrderStatus(eo["Order ID"], "EXPIRED", "");
        console.log(`[webhook] Auto-expired: ${eo["Order ID"]}`);
        if (eo["LINE User ID"] && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
          const cl = getLineClient();
          const did = eo["Order ID"].startsWith("#") ? eo["Order ID"] : `#${eo["Order ID"]}`;
          await cl.pushMessage({
            to: eo["LINE User ID"],
            messages: [{ type: "text", text: `[ x ] ORDER CANCELLED\n${did}\n\nPayment timed out. Please place a new order.` }],
          }).catch(() => {});
        }
      }
    } catch (expErr) {
      console.error("[webhook] Expiry check failed:", expErr);
    }

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
          case "chat_team": {
            // Enter human-handoff mode: bot goes silent on free text until the
            // owner ends it / customer breaks out / 60-min timeout.
            const chatUserId = event.source?.userId || "";
            await enterChatSession(chatUserId);
            // Push the admin card (name + photo + จบแชท button) — fire-and-forget.
            await notifyAdminNewChat(chatUserId, "(เปิดแชทกับทีม)");
            messages = chatEnterReply();
            break;
          }
          case "end_chat": {
            // Owner tapped "จบแชท" on the admin card → resume bot for that user.
            const uid = params.get("uid") || "";
            await endChatSession(uid);
            messages = [{ type: "text" as const, text: "บอทกลับมาทำงานกับลูกค้าแล้ว" }];
            break;
          }
          case "exit_chat": {
            // Customer tapped "Back to shop" on the live-chat card → leave the
            // handoff and show the shop menu (same as a keyword breakout).
            const exitUid = event.source?.userId || "";
            await endChatSession(exitUid);
            messages = fallbackReply();
            break;
          }
          case "select_size": {
            const size = params.get("size") || "";
            const variantId = params.get("variantId") || "";
            messages = await handleSelectSize(postbackOrderId, size, variantId);
            break;
          }
          // Rich Menu menu actions (no orderId)
          case "edit_address_menu":
          case "change_size_menu":
          case "track_menu": {
            const menuUserId = event.source?.userId || "";
            messages = await handleMenuAction(action!, menuUserId);
            break;
          }
          case "select_order": {
            const nextAction = params.get("nextAction") || "";
            messages = await handleSelectOrder(postbackOrderId, nextAction);
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

      // ── Chat-with-team handoff gate ──
      // If this user is in an active handoff session, the bot stays SILENT on
      // free text only. Slips (images) and breakout keywords still work; the
      // 60-min timeout is enforced lazily inside getActiveChatSession.
      const sessionUserId = event.source?.userId || "";
      const activeSession = await getActiveChatSession(sessionUserId);
      if (activeSession) {
        if (event.message.type === "text") {
          const t: string = event.message.text;
          if (matchKeyword(t, CHAT_BREAKOUT_KEYWORDS)) {
            // Customer typed a command keyword → leave handoff, handle normally.
            await endChatSession(sessionUserId);
          } else {
            // Free text → keep session alive and stay silent (owner replies via OA).
            await touchChatSession(sessionUserId);
            continue;
          }
        } else if (event.message.type === "image") {
          // Slip / photo → never silence; fall through to normal slip handling.
        } else {
          // Sticker / other → keep session alive, stay silent.
          await touchChatSession(sessionUserId);
          continue;
        }
      }

      if (event.message.type === "text") {
        const text: string = event.message.text;

        if (matchKeyword(text, CONTACT_KEYWORDS)) {
          // From Rich Menu — send Contact menu without order ID
          messages = [buildContactMenuNoOrder()];
        } else {
          // No configured keyword matched → single fallback
          messages = fallbackReply();
        }
      } else if (event.message.type === "image") {
        // Customer sent an image — verify as payment slip
        const userId = event.source?.userId || "";
        const messageId = event.message.id;
        messages = await handleSlipImage(messageId, userId);
      } else {
        // Sticker, video, audio, etc.
        messages = fallbackReply();
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

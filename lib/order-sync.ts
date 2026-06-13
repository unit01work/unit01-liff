import { getLineClient } from "./line";
import { createShopifyDraftOrder } from "./shopify";
import { updateShopifyOrderId, type OrderRow } from "./sheets";

// Shop owner's LINE userId — receives an alert if a paid order fails to sync
// to Shopify. Overridable via env; falls back to the known owner account.
export const OWNER_LINE_USER_ID =
  process.env.OWNER_LINE_USER_ID || "U7f329a9ce9a351a1bebc77646e20b2e1";

/**
 * Create the Shopify order for a paid order, with retries. On final failure it
 * does NOT stay silent: it writes "FAILED: <reason>" into the Shopify Order ID
 * column and pushes a LINE alert to the shop owner so the order is never lost.
 */
export async function syncPaidOrderToShopify(
  orderId: string,
  freshOrder: OrderRow
): Promise<void> {
  const MAX_ATTEMPTS = 3;
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const shopifyOrder = await createShopifyDraftOrder(freshOrder);
      const realOrderId = shopifyOrder.order_id || shopifyOrder.id;
      await updateShopifyOrderId(orderId, String(realOrderId));
      console.log(
        `[order-sync] Shopify Order created (attempt ${attempt}):`,
        realOrderId
      );
      return; // success
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      console.error(
        `[order-sync] attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
        lastErr
      );
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 600));
    }
  }

  // All attempts failed — mark the row and alert the owner. Never silent.
  console.error("[order-sync] FAILED after retries:", orderId, lastErr);
  try {
    await updateShopifyOrderId(orderId, `FAILED: ${lastErr}`.slice(0, 250));
  } catch (e) {
    console.error("[order-sync] Could not write FAILED status to sheet:", e);
  }
  await alertOwnerOrderFailed(orderId, freshOrder, lastErr);
}

/**
 * Push an arbitrary text alert to the shop owner. Returns false if LINE isn't
 * configured. Used by health-check / reconciliation crons.
 */
export async function pushOwner(text: string): Promise<boolean> {
  if (
    !OWNER_LINE_USER_ID ||
    !process.env.LINE_CHANNEL_ACCESS_TOKEN ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN === "YOUR_CHANNEL_ACCESS_TOKEN_HERE"
  ) {
    console.error("[order-sync] pushOwner — missing LINE token / owner id");
    return false;
  }
  try {
    const cl = getLineClient();
    await cl.pushMessage({
      to: OWNER_LINE_USER_ID,
      messages: [{ type: "text", text: text.slice(0, 4900) }],
    });
    return true;
  } catch (e) {
    console.error("[order-sync] pushOwner failed:", e);
    return false;
  }
}

/**
 * Push a LINE alert to the shop owner when SlipOK verified a real payment but no
 * matching PENDING order was found (e.g. the order already expired before the
 * slip arrived, or the amount didn't match). Money is in but no order — the owner
 * must reconcile by hand. Never silent.
 */
export async function alertOwnerOrphanPayment(args: {
  amount: number;
  transRef: string;
  userId: string;
  when: string;
}): Promise<void> {
  const { amount, transRef, userId, when } = args;
  const text =
    `⚠️ เงินเข้าแต่ไม่พบออเดอร์ที่รอชำระ\n` +
    `(SlipOK ตรวจสลิปผ่านแล้ว แต่ระบบจับคู่ออเดอร์ PENDING ไม่ได้)\n\n` +
    `ยอดเงิน: ฿${amount}\n` +
    `เวลา: ${when}\n` +
    `Ref สลิป: ${transRef || "-"}\n` +
    `LINE userId ลูกค้า: ${userId}\n\n` +
    `⛔️ อาจเป็นออเดอร์ที่หมดอายุไปแล้ว หรือยอดไม่ตรง — ` +
    `ตรวจสอบและติดต่อลูกค้า/คืนเงินด้วยตนเอง`;
  const sent = await pushOwner(text);
  if (sent) console.log("[order-sync] Owner alerted about orphan payment:", transRef, "฿" + amount);
  else console.error("[order-sync] Could not alert owner about orphan payment:", transRef);
}

/**
 * Push a LINE alert to the shop owner when a POST-PAYMENT EDIT (change size /
 * edit shipping address) was saved to the sheet but failed to sync to Shopify.
 * The Shopify order still exists with stale data, so the owner must fix it by
 * hand. Never silent.
 */
export async function alertOwnerEditFailed(
  orderId: string,
  order: Partial<OrderRow>,
  kind: "size" | "shipping",
  reason: string
): Promise<void> {
  if (
    !OWNER_LINE_USER_ID ||
    !process.env.LINE_CHANNEL_ACCESS_TOKEN ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN === "YOUR_CHANNEL_ACCESS_TOKEN_HERE"
  ) {
    console.error("[order-sync] Cannot alert owner (edit) — missing LINE token / owner id");
    return;
  }
  const customer = `${order?.["First Name"] || ""} ${order?.["Last Name"] || ""}`.trim();
  const what = kind === "size" ? "เปลี่ยนไซส์" : "แก้ที่อยู่จัดส่ง";
  const text =
    `⚠️ ${what}สำเร็จใน Sheet แต่ Shopify ไม่อัพเดท\n\n` +
    `Order: ${orderId}\n` +
    `Shopify Order ID: ${order?.["Shopify Order ID"] || "-"}\n` +
    `ลูกค้า: ${customer || "-"}\n` +
    `สินค้า: ${order?.["Items"] || "-"}\n` +
    `สาเหตุ: ${reason}\n\n` +
    `⛔️ ต้องแก้ใน Shopify ด้วยตนเอง (Sheet กับ Shopify ไม่ตรงกัน)`;
  try {
    const cl = getLineClient();
    await cl.pushMessage({
      to: OWNER_LINE_USER_ID,
      messages: [{ type: "text", text }],
    });
    console.log("[order-sync] Owner alerted about failed edit sync:", orderId, kind);
  } catch (e) {
    console.error("[order-sync] Failed to push owner edit alert:", e);
  }
}

/** Push a LINE alert to the shop owner about a failed Shopify order sync. */
export async function alertOwnerOrderFailed(
  orderId: string,
  order: Partial<OrderRow>,
  reason: string
): Promise<void> {
  if (
    !OWNER_LINE_USER_ID ||
    !process.env.LINE_CHANNEL_ACCESS_TOKEN ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN === "YOUR_CHANNEL_ACCESS_TOKEN_HERE"
  ) {
    console.error("[order-sync] Cannot alert owner — missing LINE token / owner id");
    return;
  }
  const customer = `${order?.["First Name"] || ""} ${order?.["Last Name"] || ""}`.trim();
  const text =
    `⚠️ สร้าง Shopify Order ไม่สำเร็จ (จ่ายเงินแล้ว)\n\n` +
    `Order: ${orderId}\n` +
    `ลูกค้า: ${customer || "-"}\n` +
    `สินค้า: ${order?.["Items"] || "-"}\n` +
    `ยอดรวม: ฿${order?.["Total"] ?? "-"}\n` +
    `เบอร์: ${order?.["Phone"] || "-"}\n` +
    `สาเหตุ: ${reason}\n\n` +
    `⛔️ ต้องสร้างออเดอร์ใน Shopify ด้วยตนเอง (ระบบ retry แล้วยังพัง)`;
  try {
    const cl = getLineClient();
    await cl.pushMessage({
      to: OWNER_LINE_USER_ID,
      messages: [{ type: "text", text }],
    });
    console.log("[order-sync] Owner alerted about failed order:", orderId);
  } catch (e) {
    console.error("[order-sync] Failed to push owner alert:", e);
  }
}

/**
 * never-silent: the order is created, but pushing the Flex/QR + payment-timeout
 * messages to the CUSTOMER failed. Since this now runs after the HTTP response
 * (via `after()`), a failure here would otherwise vanish into the logs — so we
 * alert the owner that a customer may not have received their QR.
 */
export async function alertOwnerNotifyFailed(
  orderId: string,
  info: { customer?: string; items?: string; total?: number; phone?: string; lineUserId?: string },
  reason: string
): Promise<void> {
  if (
    !OWNER_LINE_USER_ID ||
    !process.env.LINE_CHANNEL_ACCESS_TOKEN ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN === "YOUR_CHANNEL_ACCESS_TOKEN_HERE"
  ) {
    console.error("[order-sync] Cannot alert owner (notify) — missing LINE token / owner id");
    return;
  }
  const text =
    `⚠️ ส่ง QR/รายละเอียดออเดอร์ให้ลูกค้าไม่สำเร็จ (ออเดอร์สร้างแล้ว)\n\n` +
    `Order: ${orderId}\n` +
    `ลูกค้า: ${info.customer || "-"}\n` +
    `สินค้า: ${info.items || "-"}\n` +
    `ยอดรวม: ฿${info.total ?? "-"}\n` +
    `เบอร์: ${info.phone || "-"}\n` +
    `LINE: ${info.lineUserId || "-"}\n\n` +
    `⛔️ ลูกค้าอาจยังไม่ได้รับ QR — ติดต่อลูกค้า/ส่ง QR ซ้ำด้วยตนเอง`;
  try {
    const cl = getLineClient();
    await cl.pushMessage({
      to: OWNER_LINE_USER_ID,
      messages: [{ type: "text", text }],
    });
    console.log("[order-sync] Owner alerted about failed customer notify:", orderId);
  } catch (e) {
    console.error("[order-sync] Failed to push owner notify alert:", e);
  }
}

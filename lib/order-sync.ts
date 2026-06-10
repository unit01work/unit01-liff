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

import { getLineClient } from "./line";
import { createShopifyDraftOrder } from "./shopify";
import { updateShopifyOrderId, type OrderRow } from "./sheets";
import { buildOrphanPaymentFlex } from "./flex-messages";

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
 * Push a LINE alert to the shop owner when a slip could NOT be processed by the
 * system (not the customer's fault). Two stages:
 *   "verify"  — SlipOK/LINE download failed after retries. The customer may well
 *               have paid; we just couldn't confirm. Owner must check by hand.
 *   "process" — slip verified fine, but persisting / creating the order threw.
 *               Money is in but the order didn't complete. Owner must reconcile.
 * Never silent: the whole point is that a transient failure no longer ends with
 * the customer told "couldn't read your slip" and the owner never alerted (root
 * cause of the 2026-06-25 missed-slip incident).
 */
export async function alertOwnerSlipFailure(args: {
  userId: string;
  when: string;
  stage: "verify" | "process";
  amount?: number;
  transRef?: string;
}): Promise<void> {
  let customerName = "";
  try {
    const p = await getLineClient().getProfile(args.userId);
    customerName = p?.displayName || "";
  } catch {
    // profile lookup is best-effort — never block the alert on it
  }
  const lines = [
    "[เตือน] ตรวจสลิปไม่สำเร็จจากระบบ",
    args.stage === "verify"
      ? "ระบบยืนยันสลิปไม่ได้ชั่วคราว (ไม่ใช่ความผิดลูกค้า) — ลูกค้าอาจจ่ายเงินแล้ว"
      : "สลิปตรวจผ่านแล้วแต่บันทึก/สร้างออเดอร์พลาด — เงินเข้าระบบแล้ว ต้องเช็กด่วน",
    `ลูกค้า LINE: ${args.userId}`,
    customerName ? `ชื่อ: ${customerName}` : "",
    args.amount ? `ยอด: ฿${args.amount}` : "",
    args.transRef ? `Ref: ${args.transRef}` : "",
    `เวลา: ${args.when}`,
    "กรุณาเช็ก/ติดต่อลูกค้าด่วน",
  ].filter(Boolean);
  await pushOwner(lines.join("\n"));
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
  senderName?: string;
  sendingBank?: string;
  slipDateTime?: string;
  /** Customer's LINE display name (fetched from the LINE profile) — for findability. */
  customerName?: string;
}): Promise<void> {
  const { amount, transRef, userId, when, senderName, sendingBank, slipDateTime, customerName } = args;
  if (
    !OWNER_LINE_USER_ID ||
    !process.env.LINE_CHANNEL_ACCESS_TOKEN ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN === "YOUR_CHANNEL_ACCESS_TOKEN_HERE"
  ) {
    console.error("[order-sync] Cannot alert owner (orphan) — missing LINE token / owner id");
    return;
  }
  const flex = buildOrphanPaymentFlex({
    amount,
    transRef,
    userId,
    receivedAt: when,
    slipDateTime,
    senderName,
    sendingBank,
    customerName,
  });
  try {
    const cl = getLineClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await cl.pushMessage({ to: OWNER_LINE_USER_ID, messages: [flex as any] });
    console.log("[order-sync] Owner alerted about orphan payment:", transRef, "฿" + amount);
  } catch (e) {
    console.error("[order-sync] Could not alert owner about orphan payment:", transRef, e);
  }
}

/**
 * Push a LINE alert to the shop owner when an order is AUTO-CANCELLED for payment
 * timeout. This is the guaranteed backstop against silently-lost payments: the
 * real-time slip path (LINE webhook → SlipOK) can miss a slip for reasons outside
 * our control — most importantly LINE's native manual chat, which delivers the
 * slip image as a `standby` event that can be dropped or fail to verify silently.
 * When that happens the customer HAS paid but the order just expires with no trace.
 *
 * By alerting the owner at the exact moment of cancellation, a genuine payment is
 * never lost without anyone noticing: the owner opens the chat, sees the slip, and
 * confirms by hand. Includes the order, amount and customer so it's actionable.
 * Never throws (expiry must not be blocked by a push failure).
 */
export async function alertOwnerOrderExpired(args: {
  orderId: string;
  amount: string | number;
  userId: string;
  when: string;
}): Promise<void> {
  if (
    !OWNER_LINE_USER_ID ||
    !process.env.LINE_CHANNEL_ACCESS_TOKEN ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN === "YOUR_CHANNEL_ACCESS_TOKEN_HERE"
  ) {
    console.error("[order-sync] Cannot alert owner (expired) — missing LINE token / owner id");
    return;
  }
  let customerName = "";
  try {
    if (args.userId) {
      const p = await getLineClient().getProfile(args.userId);
      customerName = p?.displayName || "";
    }
  } catch {
    // profile lookup is best-effort — never block the alert on it
  }
  const displayId = args.orderId.startsWith("#") ? args.orderId : `#${args.orderId}`;
  // The button carries the order id back as a postback; encode so a "#" survives.
  const recoverData = `action=recover_order&orderId=${encodeURIComponent(args.orderId)}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyContents: any[] = [
    { type: "text", text: "[เตือน] ออเดอร์หมดเวลา ถูกยกเลิกอัตโนมัติ", size: "sm", weight: "bold", color: "#C44A3A", wrap: true },
    { type: "text", text: `${displayId} · ฿${args.amount}`, size: "sm", color: "#16171C", margin: "sm" },
  ];
  if (customerName) {
    bodyContents.push({ type: "text", text: `ลูกค้า: ${customerName}`, size: "xs", color: "#444444", wrap: true });
  }
  bodyContents.push(
    { type: "text", text: `LINE: ${args.userId}`, size: "xxs", color: "#AAAAAA", wrap: true },
    { type: "text", text: "ถ้าลูกค้าส่งสลิปมาแล้ว (เช่นตอนแชทแมนนวลของ LINE) = จ่ายจริงแต่บอทไม่ได้ตรวจ กดปุ่มด้านล่างเพื่อกู้ออเดอร์ (มาร์ค PAID + สร้าง Shopify + แจ้งลูกค้า)", size: "xxs", color: "#888888", wrap: true, margin: "md" },
    {
      type: "button",
      style: "primary",
      color: "#5B805E",
      height: "sm",
      margin: "md",
      action: {
        type: "postback",
        label: "✅ ลูกค้าจ่ายแล้ว — กู้ออเดอร์",
        data: recoverData,
        displayText: `กู้ออเดอร์ ${displayId}`,
      },
    }
  );

  const flex = {
    type: "flex" as const,
    altText: `ออเดอร์หมดเวลา ${displayId} — กดกู้ถ้าลูกค้าจ่ายแล้ว`,
    contents: {
      type: "bubble" as const,
      size: "kilo" as const,
      body: {
        type: "box" as const,
        layout: "vertical" as const,
        paddingAll: "lg" as const,
        spacing: "sm" as const,
        contents: bodyContents,
      },
    },
  };

  try {
    const cl = getLineClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await cl.pushMessage({ to: OWNER_LINE_USER_ID, messages: [flex as any] });
    console.log("[order-sync] Owner alerted about expired order:", displayId);
  } catch (e) {
    console.error("[order-sync] Could not alert owner about expired order:", displayId, e);
  }
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

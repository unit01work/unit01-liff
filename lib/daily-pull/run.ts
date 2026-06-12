// Orchestrator: pull -> write -> reconcile (+auto-fix) -> tag -> carry-over,
// reporting each step in Thai over LINE. Kept separate from the route so it can
// be unit-tested and reused by manual re-runs.

import { resolveWindow, isInWindow, isCarryOver, ictParts } from "./window";
import { pullPaidUnfulfilledOrders, tagWorklisted } from "./shopify";
import { toWorklistRow } from "./worklist";
import { writeWorklistTab, readWorklistTab, type WriteResult } from "./sheets";
import { reconcile, type Mismatch } from "./reconcile";
import { pushAdmin } from "./notify";
import type { PulledOrder } from "./types";

export interface RunOptions {
  dateParam?: string | null;
  dry?: boolean; // skip tagging real orders (local testing)
  silent?: boolean; // don't push LINE, just collect the messages
}

export interface RunResult {
  dateLabel: string;
  regen: boolean;
  counts: { inWindow: number; carryOver: number };
  sheet: WriteResult | null;
  reconciled: boolean; // true = data matched (after auto-fix if needed)
  remainingMismatches: Mismatch[];
  carryOver: { orderName: string; paidAt: string }[];
  tagFailed: number;
  messages: string[]; // every LINE line, in order (also returned when silent)
}

const bullets = (ms: Mismatch[]) => ms.map((m) => `- ${m.detail}`).join("\n");

export async function runDailyPull(opts: RunOptions): Promise<RunResult> {
  const { dateParam, dry = false, silent = false } = opts;
  const messages: string[] = [];
  const say = async (text: string) => {
    messages.push(text);
    if (!silent) await pushAdmin(text);
  };

  const w = resolveWindow(dateParam);
  const isRegen = Boolean(dateParam);

  await say(`[ ${ictParts(new Date()).time} ] เริ่มดึงออเดอร์จาก Shopify`);

  const inWindowOf = (orders: PulledOrder[]) =>
    orders.filter((o) => isInWindow(new Date(o.paidAt), w));

  const pulled = await pullPaidUnfulfilledOrders({
    rangeStartUtc: w.startUtc,
    rangeEndUtc: w.endUtc,
    excludeWorklisted: !isRegen,
  });
  let inWindow = inWindowOf(pulled);
  const carryOver = pulled.filter((o) => isCarryOver(new Date(o.paidAt), w));

  let rows = inWindow.map(toWorklistRow);
  await say(`ดึงเสร็จ ${inWindow.length} ออเดอร์ กำลังตรวจทานกับ Shopify`);

  let written = await writeWorklistTab(w.dateLabel, rows);

  // Reconcile via an independent re-pull of the same window vs the sheet.
  const verify = async () => {
    const fresh = await pullPaidUnfulfilledOrders({
      rangeStartUtc: w.startUtc,
      rangeEndUtc: w.endUtc,
      excludeWorklisted: false,
    });
    const freshInWindow = inWindowOf(fresh);
    const sheetRows = await readWorklistTab(w.dateLabel);
    return {
      mismatches: reconcile(freshInWindow.map(toWorklistRow), sheetRows),
      freshInWindow,
    };
  };

  let { mismatches, freshInWindow } = await verify();

  if (mismatches.length > 0) {
    await say(`พบ ${mismatches.length} ออเดอร์ไม่ตรง กำลังแก้\n${bullets(mismatches)}`);
    // Auto-fix: rebuild the tab from the fresh pull, then re-verify once.
    inWindow = freshInWindow;
    rows = inWindow.map(toWorklistRow);
    written = await writeWorklistTab(w.dateLabel, rows);
    const second = await verify();
    mismatches = second.mismatches;
    if (mismatches.length === 0) {
      await say("แก้ไขเสร็จ ข้อมูลตรงแล้ว");
    } else {
      await say(`แก้อัตโนมัติไม่ได้ ต้องตรวจเอง:\n${bullets(mismatches)}`);
    }
  }

  // Idempotency: tag so these orders are never pulled into a later day.
  let tagFailed = 0;
  if (!dry && inWindow.length > 0) {
    const t = await tagWorklisted(inWindow.map((o) => o.shopifyOrderGid));
    tagFailed = t.failed.length;
    if (!t.ok) {
      await say(`เตือน: ติด tag worklisted ไม่สำเร็จ ${tagFailed} ออเดอร์ อาจถูกดึงซ้ำ ตรวจสอบ`);
    }
  }

  // Carry-over: report separately, never mix into today's sheet.
  if (carryOver.length > 0) {
    const lines = carryOver
      .map((o) => `- ${o.name} (จ่าย ${ictParts(new Date(o.paidAt)).dateLabel}) ยังไม่ fulfilled`)
      .join("\n");
    await say(
      `[ แจ้งเตือน ] มีออเดอร์ค้างจากรอบก่อนยังไม่ได้ส่ง ${carryOver.length} ออเดอร์\n${lines}\nออเดอร์เหล่านี้ไม่อยู่ใน worklist วันนี้ จัดการแยกได้เลย`
    );
  }

  if (mismatches.length === 0) {
    await say(`อัปเดตเรียบร้อย worklist วันนี้พร้อม ${rows.length} ออเดอร์\nลิงก์: ${written.link}`);
  }

  return {
    dateLabel: w.dateLabel,
    regen: isRegen,
    counts: { inWindow: inWindow.length, carryOver: carryOver.length },
    sheet: written,
    reconciled: mismatches.length === 0,
    remainingMismatches: mismatches,
    carryOver: carryOver.map((o) => ({ orderName: o.name, paidAt: o.paidAt })),
    tagFailed,
    messages,
  };
}

/**
 * EDIT-LOCK — per-order edit deadline (Asia/Bangkok).
 *
 * Rule: a customer may edit shipping address / size until 10:00 ICT of the
 * "cutoff day", computed from when the order was paid:
 *   cutoffToday = <paid date> 10:00
 *   paid <= cutoffToday  → deadline = cutoffToday          (paid before 10:00)
 *   paid >  cutoffToday  → deadline = cutoffToday + 1 day  (paid after 10:00)
 *
 * Timestamps are stored as fixed-width Bangkok-local "YYYY-MM-DD HH:MM" strings
 * (see nowBKK in lib/sheets). Fixed-width strings sort chronologically, so we
 * compare lexicographically and never touch UTC — avoiding off-by-one bugs.
 *
 * This is a check-on-press lock (like a coupon expiry): the deadline is
 * recomputed every time the customer tries to edit. No cron, no background job.
 */

// Type-only import (erased at compile time — no runtime dependency on sheets).
import type { OrderRow } from "./sheets";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Current Bangkok-local timestamp as "YYYY-MM-DD HH:MM" (mirrors nowBKK). */
export function nowBKK(): string {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Bangkok", hour12: false })
    .replace("T", " ")
    .slice(0, 16);
}

/**
 * Zero-pad a single-digit hour so the timestamp is fixed-width and therefore
 * sorts chronologically under lexicographic (<=, >=) comparison.
 *
 * Google Sheets coerces our stored "YYYY-MM-DD HH:MM" into a date serial and
 * reformats it with the pattern `yyyy-mm-dd h:mm` — a SINGLE `h` — so any order
 * paid in hours 00–09 reads back as e.g. "2026-06-14 2:57", not "02:57". Without
 * padding, "2:57" > "10:00" lexically ('2' > '1'), so computeEditDeadline thinks
 * an early-morning order was paid AFTER 10:00 and rolls the deadline to the next
 * day — leaving the order editable long past its real cutoff. (Same root cause
 * parseSheetTimestamp guards in lib/sheets.) Pads only the hour; minutes are
 * always two digits.
 */
export function normalizeStamp(stamp: string): string {
  return (stamp || "").replace(/^(\d{4}-\d{2}-\d{2}) (\d):/, "$1 0$2:");
}

/**
 * Compute the edit deadline ("YYYY-MM-DD HH:MM") from a paid timestamp.
 * Returns "" if paidAt is missing/malformed (caller treats that as "no lock").
 */
export function computeEditDeadline(paidAtRaw: string): string {
  // Normalise first: the comparison below is lexicographic and only correct on
  // fixed-width strings, but Sheets may emit a single-digit hour (see above).
  const paidAt = normalizeStamp(paidAtRaw);
  const m = paidAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const [, y, mo, d] = m;
  const cutoffToday = `${y}-${mo}-${d} 10:00`;
  // Paid at or before 10:00 on the paid date → deadline is that day's 10:00.
  if (paidAt <= cutoffToday) return cutoffToday;
  // Paid after 10:00 → deadline rolls to the next calendar day's 10:00.
  // Use UTC date math purely to advance the calendar date (no tz involved).
  const next = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d) + 1));
  const ny = next.getUTCFullYear();
  const nmo = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(next.getUTCDate()).padStart(2, "0");
  return `${ny}-${nmo}-${nd} 10:00`;
}

/**
 * Human-readable deadline for customer messages.
 * "2026-06-19 10:00" → "19 Jun 2026 · 10:00 (GMT+7)"
 */
export function formatDeadline(deadline: string): string {
  const m = (deadline || "").match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return "";
  const [, y, mo, d, hh, mm] = m;
  const day = String(Number(d)); // strip leading zero: "19", not "09"→"9"
  const month = MONTHS[Number(mo) - 1] || mo;
  return `${day} ${month} ${y} · ${hh}:${mm} (GMT+7)`;
}

/** Get the paid timestamp from an order row, with sensible fallbacks. */
function paidAtOf(order: OrderRow): string {
  return order["Paid At"] || order["Updated At"] || order["Date"] || "";
}

/**
 * Is editing this order locked right now (i.e. past its deadline)?
 * Locked when current Bangkok time has reached the deadline (>= 10:00 ICT).
 * If we can't determine a paid time we DON'T lock (fail-open: never block a
 * legitimate edit due to a missing timestamp; edit-once still guards abuse).
 */
export function isEditLocked(order: OrderRow): boolean {
  const deadline = computeEditDeadline(paidAtOf(order));
  if (!deadline) return false;
  return nowBKK() >= deadline;
}

/** The deadline string ("YYYY-MM-DD HH:MM") for an order, or "" if unknown. */
export function orderDeadline(order: OrderRow): string {
  return computeEditDeadline(paidAtOf(order));
}

/**
 * Option-2 locked message (English). Shown when a customer presses edit after
 * the deadline. Keeps the order number visible. Deliberately avoids the word
 * "shipped" — at 10:00 the goods are being prepared, not actually shipped yet.
 */
export function buildLockedMessage(orderId: string): string {
  const id = `#${orderId.replace("#", "")}`;
  return (
    `${id}\n\n` +
    `Your order is being prepared for shipping and can no longer be edited.\n\n` +
    `To change size, please wait until your order arrives,\n` +
    `then request a size change.`
  );
}

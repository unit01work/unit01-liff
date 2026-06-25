// Window / cutoff logic. The hard rule from the spec:
//   "today's round" = yesterday CUTOFF ICT -> today CUTOFF ICT (24h),
//   sliced by the order's *paid* time vs the CUTOFF exactly (not when cron runs).
// CUTOFF is CUTOFF_HOUR:CUTOFF_MINUTE ICT (see lib/config). All comparisons are
// done in Asia/Bangkok (+7), so a paid time one minute before the cutoff lands
// in today and one minute after rolls to tomorrow, regardless of cron drift.

import { CUTOFF_HOUR, CUTOFF_MINUTE } from "../config";

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface PullWindow {
  // The round's date label (the ICT calendar date of the closing 10:00). This
  // is what names the worklist tab, e.g. "2026-06-12".
  dateLabel: string;
  startUtc: Date; // inclusive — yesterday 10:00 ICT
  endUtc: Date; // exclusive — today 10:00 ICT
}

// ICT wall-clock parts of a UTC instant.
export function ictParts(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dateLabel: string;
  time: string;
} {
  const shifted = new Date(d.getTime() + ICT_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const p2 = (n: number) => String(n).padStart(2, "0");
  return {
    year,
    month,
    day,
    hour,
    minute,
    dateLabel: `${year}-${p2(month)}-${p2(day)}`,
    time: `${p2(hour)}:${p2(minute)}`,
  };
}

// The UTC instant of the cutoff (CUTOFF_HOUR:CUTOFF_MINUTE) ICT on a given day.
function ictCutoffUtc(year: number, month: number, day: number): Date {
  // CUTOFF_HOUR ICT == (CUTOFF_HOUR - 7) UTC the same calendar day.
  return new Date(
    Date.UTC(year, month - 1, day, CUTOFF_HOUR, CUTOFF_MINUTE, 0) - ICT_OFFSET_MS
  );
}

// Resolve the window. `dateParam` (YYYY-MM-DD) forces a specific round for
// manual re-runs; otherwise we use "now" in ICT to pick the current round.
export function resolveWindow(dateParam?: string | null, now: Date = new Date()): PullWindow {
  let endParts: { year: number; month: number; day: number };

  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const [y, m, d] = dateParam.split("-").map(Number);
    endParts = { year: y, month: m, day: d };
  } else {
    // The round that closes at the next 10:00 ICT boundary <= now's day.
    // If it's already past 10:00 ICT today, the closing boundary is today 10:00;
    // before 10:00 ICT, the current open round still closes today 10:00.
    const p = ictParts(now);
    endParts = { year: p.year, month: p.month, day: p.day };
  }

  const endUtc = ictCutoffUtc(endParts.year, endParts.month, endParts.day);
  // start = 24h earlier (yesterday 10:00 ICT)
  const startUtc = new Date(endUtc.getTime() - 24 * 60 * 60 * 1000);
  return { dateLabel: ictParts(endUtc).dateLabel, startUtc, endUtc };
}

export function isInWindow(paidAtUtc: Date, w: PullWindow): boolean {
  const t = paidAtUtc.getTime();
  return t >= w.startUtc.getTime() && t < w.endUtc.getTime();
}

// Older than this round's start = a straggler from a previous round.
export function isCarryOver(paidAtUtc: Date, w: PullWindow): boolean {
  return paidAtUtc.getTime() < w.startUtc.getTime();
}

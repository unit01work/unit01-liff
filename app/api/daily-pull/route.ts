import { NextRequest, NextResponse } from "next/server";
import { resolveWindow, isInWindow, isCarryOver } from "@/lib/daily-pull/window";
import { pullPaidUnfulfilledOrders } from "@/lib/daily-pull/shopify";
import { toWorklistRow } from "@/lib/daily-pull/worklist";
import { writeWorklistTab } from "@/lib/daily-pull/sheets";

/**
 * UNIT-01 daily-pull worklist — STEP 2.
 *
 * Pulls every PAID + UNFULFILLED Shopify order in the current 10:00-ICT window
 * and writes it as the 11-column worklist into a per-day tab (WL-YYYY-MM-DD).
 * Carry-over stragglers are detected and returned separately (never in the tab).
 * Does NOT yet tag `worklisted` or push LINE — that lands in steps 4/5.
 *
 *   POST /api/daily-pull            (Bearer CRON_SECRET)  -> pulls + writes tab
 *   GET  /api/daily-pull?key=...&date=YYYY-MM-DD&dry=1     -> pull only, no write
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const keyParam = request.nextUrl.searchParams.get("key") || "";
  const provided = bearer || keyParam;
  return Boolean(secret) && provided === secret;
}

async function handle(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const isRegen = Boolean(dateParam);
  const w = resolveWindow(dateParam);

  const pulled = await pullPaidUnfulfilledOrders({
    rangeStartUtc: w.startUtc,
    rangeEndUtc: w.endUtc,
    excludeWorklisted: !isRegen,
  });

  const inWindow = pulled.filter((o) => isInWindow(new Date(o.paidAt), w));
  const carryOver = pulled.filter((o) => isCarryOver(new Date(o.paidAt), w));

  const rows = inWindow.map(toWorklistRow);

  const written = dry ? null : await writeWorklistTab(w.dateLabel, rows);

  return NextResponse.json({
    step: dry ? "2-dry-run" : "2-write",
    window: {
      dateLabel: w.dateLabel,
      startUtc: w.startUtc.toISOString(),
      endUtc: w.endUtc.toISOString(),
      regen: isRegen,
    },
    counts: {
      pulled: pulled.length,
      inWindow: inWindow.length,
      carryOver: carryOver.length,
    },
    sheet: written,
    worklist: rows,
    carryOver: carryOver.map((o) => ({
      orderName: o.name,
      paidAt: o.paidAt,
      customer: o.customerName,
    })),
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

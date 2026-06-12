import { NextRequest, NextResponse } from "next/server";
import { resolveWindow, isInWindow, isCarryOver } from "@/lib/daily-pull/window";
import { pullPaidUnfulfilledOrders } from "@/lib/daily-pull/shopify";
import { toWorklistRow } from "@/lib/daily-pull/worklist";

/**
 * UNIT-01 daily-pull worklist — STEP 1 (dry-run).
 *
 * Pulls every PAID + UNFULFILLED Shopify order in the current 10:00-ICT window
 * and returns it as the 11-column worklist, plus any carry-over stragglers.
 * Does NOT write the sheet, tag `worklisted`, or push LINE yet — that lands in
 * later steps. Safe to run repeatedly.
 *
 *   POST /api/daily-pull            (Bearer CRON_SECRET)
 *   GET  /api/daily-pull?key=...&date=YYYY-MM-DD
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

  return NextResponse.json({
    step: "1-dry-run",
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

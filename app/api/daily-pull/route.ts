import { NextRequest, NextResponse } from "next/server";
import { runDailyPull } from "@/lib/daily-pull/run";

/**
 * UNIT-01 daily-pull worklist (full flow).
 *
 * 10:00 ICT cron -> pull every PAID + UNFULFILLED Shopify order in the window ->
 * write the per-day worklist tab (WL-YYYY-MM-DD) -> reconcile against a fresh
 * Shopify re-pull (auto-fix once, else flag) -> tag `worklisted` for idempotency
 * -> alert carry-over stragglers separately -> report every step in Thai on LINE.
 *
 *   POST /api/daily-pull               (Bearer CRON_SECRET)  full run
 *   GET  /api/daily-pull?key=...
 *     &date=YYYY-MM-DD   manual re-run for a specific round (regenerates the tab)
 *     &dry=1             skip tagging real orders (testing)
 *     &silent=1          collect LINE messages in the response, don't push them
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
  const sp = request.nextUrl.searchParams;
  try {
    const result = await runDailyPull({
      dateParam: sp.get("date"),
      dry: sp.get("dry") === "1",
      silent: sp.get("silent") === "1",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[daily-pull] run failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

import { NextRequest, NextResponse } from "next/server";
import { resolveWindow } from "@/lib/daily-pull/window";
import { worklistTabStatus } from "@/lib/daily-pull/sheets";
import { pushAdmin } from "@/lib/daily-pull/notify";
import { CUTOFF_TIME } from "@/lib/config";

/**
 * Heartbeat for the daily-pull worklist (never-silent guard).
 *
 * Runs at 10:30 ICT, 30 min after the pull. If today's worklist tab is missing,
 * the 10:00 run didn't happen -> alert LINE. An empty tab (0 orders) still
 * counts as "ran", so a genuinely quiet day doesn't false-alarm.
 *
 *   GET /api/daily-pull-heartbeat?key=...   (or Bearer CRON_SECRET)
 *     &silent=1   check only, don't push LINE
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const keyParam = request.nextUrl.searchParams.get("key") || "";
  const provided = bearer || keyParam;
  return Boolean(secret) && provided === secret;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const silent = request.nextUrl.searchParams.get("silent") === "1";
  try {
    const w = resolveWindow(null);
    const status = await worklistTabStatus(w.dateLabel);

    if (!status.exists) {
      const msg = `ระบบดึงออเดอร์ ${CUTOFF_TIME} ไม่ทำงาน ตรวจด่วน (worklist วันที่ ${w.dateLabel} ยังไม่ถูกสร้าง)`;
      if (!silent) await pushAdmin(msg);
      return NextResponse.json({
        ok: false,
        ran: false,
        dateLabel: w.dateLabel,
        alerted: !silent,
        message: msg,
      });
    }

    return NextResponse.json({
      ok: true,
      ran: true,
      dateLabel: w.dateLabel,
      rowCount: status.rowCount,
    });
  } catch (e) {
    console.error("[daily-pull-heartbeat] failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

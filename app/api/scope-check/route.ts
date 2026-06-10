import { NextRequest, NextResponse } from "next/server";
import { checkRequiredScopes, REQUIRED_SHOPIFY_SCOPES } from "@/lib/shopify";
import { pushOwner } from "@/lib/order-sync";

/**
 * Layer 3 — Shopify scope health check.
 *
 * Verifies the Admin API token still holds every scope the order flow needs
 * (esp. write_order_edits, which silently broke change-size when missing).
 * Run it on deploy and/or daily via cron. If a scope is missing it pushes a
 * LINE alert to the owner so the gap is caught BEFORE a customer hits it.
 *
 *   GET /api/scope-check            (Bearer CRON_SECRET)
 *   GET /api/scope-check?key=...    (CRON_SECRET as query param)
 */
export async function GET(request: NextRequest) {
  // ── SECURITY: require CRON_SECRET ──
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const keyParam = request.nextUrl.searchParams.get("key") || "";
  const provided = bearer || keyParam;
  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { ok, missing, granted } = await checkRequiredScopes();

    if (!ok) {
      await pushOwner(
        `🚨 Shopify scope หาย!\n\n` +
          `ขาด: ${missing.join(", ")}\n\n` +
          `ผลกระทบ: ฟีเจอร์ที่ต้องใช้ scope นี้จะพังเงียบ ` +
          `(เช่น write_order_edits = เปลี่ยน size ไม่ได้)\n\n` +
          `⛔️ ต้องเพิ่ม scope ในแอป Shopify แล้ว Release + อนุมัติสิทธิ์ใหม่`
      );
    }

    return NextResponse.json({
      ok,
      required: REQUIRED_SHOPIFY_SCOPES,
      missing,
      granted,
    });
  } catch (err) {
    console.error("[scope-check] Error:", err);
    return NextResponse.json({ error: "scope-check failed" }, { status: 500 });
  }
}

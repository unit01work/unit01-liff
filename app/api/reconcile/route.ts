import { NextRequest, NextResponse } from "next/server";
import { findRecentPaidOrders } from "@/lib/sheets";
import {
  checkRequiredScopes,
  getShopifyOrderSnapshot,
} from "@/lib/shopify";
import { pushOwner } from "@/lib/order-sync";

/**
 * Layer 2 — daily Sheet ↔ Shopify reconciliation.
 *
 * The last safety net: even if a sync silently slips through, this catches the
 * divergence within a day. For every recently-PAID order it checks:
 *   1. It has a real Shopify Order ID (not empty, not "FAILED…").
 *   2. The Shopify order still exists / is readable.
 *   3. The active variants on Shopify match the sheet (catches size drift).
 *   4. No leftover "Sync Status" = FAILED… marker.
 * It also reports any missing Shopify scopes. A summary is pushed to the owner
 * on LINE every run (incl. "all clear") so the watchdog is provably alive.
 *
 *   GET /api/reconcile             (Bearer CRON_SECRET)
 *   GET /api/reconcile?key=...&hours=72
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
    const hours = Number(request.nextUrl.searchParams.get("hours")) || 72;
    const silent = request.nextUrl.searchParams.get("silent") === "1";

    const issues: { orderId: string; problem: string }[] = [];

    // 1. Scope check (layer 3 folded in)
    const scope = await checkRequiredScopes();
    if (!scope.ok) {
      issues.push({
        orderId: "—",
        problem: `Shopify scope หาย: ${scope.missing.join(", ")}`,
      });
    }

    // 2. Per-order Sheet ↔ Shopify reconciliation
    const orders = await findRecentPaidOrders(hours);
    for (const o of orders) {
      const orderId = o["Order ID"];
      const shopifyId = o["Shopify Order ID"] || "";
      const syncStatus = o["Sync Status"] || "";

      if (syncStatus.toUpperCase().includes("FAIL")) {
        issues.push({ orderId, problem: `Sync Status: ${syncStatus}` });
      }

      if (!shopifyId || !/^\d+$/.test(shopifyId)) {
        issues.push({
          orderId,
          problem: shopifyId
            ? `Shopify Order ID ไม่ถูกต้อง: "${shopifyId}"`
            : "ไม่มี Shopify Order ID (จ่ายแล้วแต่ไม่ได้สร้างใน Shopify)",
        });
        continue;
      }

      const snap = await getShopifyOrderSnapshot(shopifyId);
      if (!snap.found) {
        issues.push({ orderId, problem: `Shopify order ${shopifyId} อ่านไม่ได้/หาย` });
        continue;
      }

      // Compare variant sets (catches size drift).
      const sheetVariants = (o["Variant IDs"] || "")
        .split(",")
        .map((p) => p.split(":")[0].trim())
        .filter(Boolean)
        .sort();
      const shopifyVariants = [...snap.activeVariantIds].sort();
      if (
        sheetVariants.length > 0 &&
        sheetVariants.join("|") !== shopifyVariants.join("|")
      ) {
        issues.push({
          orderId,
          problem: `สินค้า/ไซส์ไม่ตรง — Sheet: [${sheetVariants.join(", ")}] / Shopify: [${shopifyVariants.join(", ")}]`,
        });
      }
    }

    // 3. Build + push summary
    const checked = orders.length;
    let message: string;
    if (issues.length === 0) {
      message =
        `✅ Reconciliation OK\n` +
        `ตรวจ ${checked} ออเดอร์ (${hours} ชม.ล่าสุด)\n` +
        `Sheet ↔ Shopify ตรงกันทั้งหมด · scope ครบ`;
    } else {
      const lines = issues
        .slice(0, 20)
        .map((i) => `• ${i.orderId}: ${i.problem}`)
        .join("\n");
      const more = issues.length > 20 ? `\n…และอีก ${issues.length - 20} รายการ` : "";
      message =
        `⚠️ Reconciliation พบปัญหา ${issues.length} จุด\n` +
        `(ตรวจ ${checked} ออเดอร์ / ${hours} ชม.ล่าสุด)\n\n` +
        lines +
        more +
        `\n\n⛔️ ตรวจ/แก้ใน Shopify ด้วยตนเอง`;
    }

    if (!silent) await pushOwner(message);

    return NextResponse.json({
      ok: issues.length === 0,
      checked,
      hours,
      scopeOk: scope.ok,
      scopeMissing: scope.missing,
      issues,
    });
  } catch (err) {
    console.error("[reconcile] Error:", err);
    return NextResponse.json({ error: "reconcile failed" }, { status: 500 });
  }
}

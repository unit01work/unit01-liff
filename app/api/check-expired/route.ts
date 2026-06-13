import { NextRequest, NextResponse } from "next/server";
import {
  getOrder,
  findExpiredOrders,
  expireOrderIfPending,
  logOrderStockMovement,
  refreshStockTab,
  parseSheetTimestamp,
  type OrderRow,
} from "@/lib/sheets";
import { getLineClient } from "@/lib/line";

const EXPIRE_MINUTES = 10;

/**
 * Check and expire PENDING orders older than 10 minutes.
 * Can be called:
 * - GET /api/check-expired — check all expired orders
 * - GET /api/check-expired?orderId=xxx — check specific order
 */
export async function GET(request: NextRequest) {
  try {
    // ── SECURITY: require CRON_SECRET (header Bearer or ?key=) ──
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const keyParam = request.nextUrl.searchParams.get("key") || "";
    const provided = bearer || keyParam;
    if (!cronSecret || provided !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const specificOrderId = request.nextUrl.searchParams.get("orderId");

    const client =
      process.env.LINE_CHANNEL_ACCESS_TOKEN &&
      process.env.LINE_CHANNEL_ACCESS_TOKEN !== "YOUR_CHANNEL_ACCESS_TOKEN_HERE"
        ? getLineClient()
        : null;

    // If checking a specific order
    if (specificOrderId) {
      const order = await getOrder(specificOrderId);
      if (!order || (order["Status"] || "").toUpperCase() !== "PENDING") {
        return NextResponse.json({ expired: 0, reason: "not pending" });
      }

      const dateStr = order["Date"] || "";
      if (!dateStr) return NextResponse.json({ expired: 0 });

      const orderMs = parseSheetTimestamp(dateStr);
      if (Number.isNaN(orderMs)) return NextResponse.json({ expired: 0 });
      const diffMin = (Date.now() - orderMs) / (1000 * 60);

      if (diffMin < EXPIRE_MINUTES) {
        return NextResponse.json({ expired: 0, reason: "not yet expired", minutesLeft: Math.ceil(EXPIRE_MINUTES - diffMin) });
      }

      const didExpire = await expireOrder(order, client);
      await refreshStockTab();
      return NextResponse.json({ expired: didExpire ? 1 : 0 });
    }

    // Check all expired orders
    const expiredOrders = await findExpiredOrders(EXPIRE_MINUTES);

    let count = 0;
    for (const order of expiredOrders) {
      if (await expireOrder(order, client)) count++;
    }

    // Keep the Stock overview tab live on every cron tick (even if nothing expired)
    await refreshStockTab();

    return NextResponse.json({ expired: count });
  } catch (err) {
    console.error("[check-expired] Error:", err);
    return NextResponse.json({ error: "Failed to check expired orders" }, { status: 500 });
  }
}

async function expireOrder(order: OrderRow, client: unknown): Promise<boolean> {
  const orderId = order["Order ID"];
  const lineUserId = order["LINE User ID"];
  const displayId = orderId.startsWith("#") ? orderId : `#${orderId}`;

  // Atomically flip to EXPIRED only if STILL pending (under the payment lock) —
  // a slip that lands in the same instant must never be cancelled. If it's no
  // longer pending (e.g. just paid), skip everything below.
  const didExpire = await expireOrderIfPending(orderId);
  if (!didExpire) {
    console.log(`[check-expired] Skip (no longer PENDING): ${orderId}`);
    return false;
  }
  console.log(`[check-expired] Expired order: ${orderId}`);

  // Stock Log: RETURNED (release the soft-reserve back to available)
  await logOrderStockMovement(order, "RETURNED", +1, "ออเดอร์หมดอายุ คืนสต็อก");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineClient = client as any;
  if (lineClient && lineUserId) {
    try {
      await lineClient.pushMessage({
        to: lineUserId,
        messages: [{
          type: "text",
          text: `Your order ${displayId} has been cancelled\ndue to payment timeout.\n\nPlease place a new order if you'd like to purchase.`,
        }],
      });
    } catch (lineErr) {
      console.error("[check-expired] LINE push failed:", lineErr);
    }
  }
  return true;
}

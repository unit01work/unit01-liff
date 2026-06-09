import { NextRequest, NextResponse } from "next/server";
import { getOrder, findExpiredOrders, updateOrderStatus } from "@/lib/sheets";
import { getLineClient } from "@/lib/line";

// auto-deploy test: GitHub push -> Vercel (2026-06-10)
const EXPIRE_MINUTES = 5;

/**
 * Check and expire PENDING orders older than 5 minutes.
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

      const orderDate = new Date(dateStr.replace(" ", "T") + "+07:00");
      const diffMin = (Date.now() - orderDate.getTime()) / (1000 * 60);

      if (diffMin < EXPIRE_MINUTES) {
        return NextResponse.json({ expired: 0, reason: "not yet expired", minutesLeft: Math.ceil(EXPIRE_MINUTES - diffMin) });
      }

      await expireOrder(order["Order ID"], order["LINE User ID"], client);
      return NextResponse.json({ expired: 1 });
    }

    // Check all expired orders
    const expiredOrders = await findExpiredOrders(EXPIRE_MINUTES);
    if (expiredOrders.length === 0) {
      return NextResponse.json({ expired: 0 });
    }

    let count = 0;
    for (const order of expiredOrders) {
      await expireOrder(order["Order ID"], order["LINE User ID"], client);
      count++;
    }

    return NextResponse.json({ expired: count });
  } catch (err) {
    console.error("[check-expired] Error:", err);
    return NextResponse.json({ error: "Failed to check expired orders" }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function expireOrder(orderId: string, lineUserId: string, client: any) {
  const displayId = orderId.startsWith("#") ? orderId : `#${orderId}`;

  await updateOrderStatus(orderId, "EXPIRED", "");
  console.log(`[check-expired] Expired order: ${orderId}`);

  if (client && lineUserId) {
    try {
      await client.pushMessage({
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
}

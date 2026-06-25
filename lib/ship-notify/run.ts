// Orchestrator for ship-notify. Three entry points used by the webhook:
//   listDaysWithCounts()  → day picker data
//   buildPlanForTab(tab)  → resolved per-order plan + counts (read-only preview)
//   sendPlanForTab(tab)   → actually notify (LINE now; email flagged for Phase 2b)
//
// SAFETY: sendPlanForTab is only ever reached after the owner taps the confirm
// button in the Flex card. It pushes the customer card over LINE for `line`
// recipients and records them in the resend-guard. `email` recipients are NOT
// auto-fulfilled yet (that Shopify write lands in a later phase) — they are
// returned so the owner can be told to handle them.

import { listCarrierDays, readShipments } from "./carrier-sheet";
import { loadShopifyIdToLineUser, resolveShipment, type ResolvedShipment } from "./join";
import { loadNotified, markNotified } from "./state";
import { buildCustomerShippedCard } from "./customer-card";
import { fulfillWithTracking } from "./fulfill";
import type { Channel } from "./config";
import type { DayOption } from "./confirm-card";

function emptyCounts(): Record<Channel, number> {
  return { line: 0, email: 0, owner: 0, done: 0, manual: 0 };
}

// ── day picker data ──────────────────────────────────────────────────────────
export async function listDaysWithCounts(maxDays = 7): Promise<DayOption[]> {
  const [days, notified] = await Promise.all([listCarrierDays(), loadNotified()]);
  const recent = days.slice(0, maxDays);
  const out: DayOption[] = [];
  for (const d of recent) {
    let shipments;
    try {
      shipments = await readShipments(d.tabTitle);
    } catch {
      continue;
    }
    const total = shipments.length;
    const pending = shipments.filter((s) => !notified.has(s.orderName)).length;
    out.push({ tabTitle: d.tabTitle, dateLabel: d.dateLabel, pending, total });
  }
  return out;
}

// ── plan (read-only) ─────────────────────────────────────────────────────────
export interface Plan {
  tabTitle: string;
  dateLabel: string;
  shipments: ResolvedShipment[]; // every real-order shipment in the tab
  counts: Record<Channel, number>;
}

export async function buildPlanForTab(tabTitle: string): Promise<Plan> {
  const days = await listCarrierDays();
  const day = days.find((d) => d.tabTitle === tabTitle);
  const dateLabel = day?.dateLabel || tabTitle;

  const [shipmentsRaw, idToUser, notified] = await Promise.all([
    readShipments(tabTitle),
    loadShopifyIdToLineUser(),
    loadNotified(),
  ]);

  const counts = emptyCounts();
  const shipments: ResolvedShipment[] = [];
  for (const s of shipmentsRaw) {
    if (notified.has(s.orderName)) {
      shipments.push({
        orderName: s.orderName,
        trackingNumbers: s.trackingNumbers,
        carrier: s.carrier,
        customer: s.customer,
        channel: "done",
        reason: "แจ้งไปแล้วก่อนหน้านี้",
      });
      counts.done++;
      continue;
    }
    const r = await resolveShipment(s, idToUser);
    shipments.push(r);
    counts[r.channel]++;
  }

  return { tabTitle, dateLabel, shipments, counts };
}

// ── send (post-confirm) ──────────────────────────────────────────────────────
async function pushLine(to: string, message: unknown): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [message] }),
    });
    if (!res.ok) {
      console.error("[ship-notify] LINE push failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[ship-notify] LINE push error", e);
    return false;
  }
}

export interface SendResult {
  dateLabel: string;
  sentLine: string[]; // order names successfully pushed over LINE
  failedLine: string[]; // order names whose LINE push failed
  sentEmail: string[]; // order names fulfilled → Shopify emailed the customer
  failedEmail: string[]; // email orders whose fulfillment errored (retry next run)
  skippedEmail: string[]; // email orders Shopify already fulfilled / nothing to do
  skipped: string[]; // owner / manual / already-done
  dryRun: boolean;
}

// SAFETY: only reached after the owner taps confirm. dryRun=true runs every
// check + reports what WOULD happen, but pushes nothing and writes nothing.
export async function sendPlanForTab(
  tabTitle: string,
  opts: { dryRun?: boolean } = {}
): Promise<SendResult> {
  const dryRun = opts.dryRun ?? false;
  const plan = await buildPlanForTab(tabTitle);
  const sentLine: string[] = [];
  const failedLine: string[] = [];
  const sentEmail: string[] = [];
  const failedEmail: string[] = [];
  const skippedEmail: string[] = [];
  const skipped: string[] = [];
  const toMark: {
    orderName: string;
    tracking: string;
    channel: Channel;
    lineUserId?: string;
    dateTab: string;
  }[] = [];

  for (const s of plan.shipments) {
    if (s.channel === "line" && s.lineUserId) {
      if (dryRun) {
        sentLine.push(s.orderName);
        continue;
      }
      const card = buildCustomerShippedCard({
        orderNumber: s.orderName,
        productName: s.productSummary || "",
        carrier: s.carrier,
        trackingNumbers: s.trackingNumbers,
      });
      const ok = await pushLine(s.lineUserId, card);
      if (ok) {
        sentLine.push(s.orderName);
        toMark.push({
          orderName: s.orderName,
          tracking: s.trackingNumbers.join(", "),
          channel: "line",
          lineUserId: s.lineUserId,
          dateTab: tabTitle,
        });
      } else {
        failedLine.push(s.orderName);
      }
    } else if (s.channel === "email") {
      const r = await fulfillWithTracking({
        orderName: s.orderName,
        trackingNumbers: s.trackingNumbers,
        carrier: s.carrier,
        dryRun,
      });
      if (dryRun) {
        // In dry run, fulfill reports "skipped" with a [DRY] reason — surface it.
        skippedEmail.push(`${s.orderName} ${r.reason}`);
      } else if (r.outcome === "fulfilled") {
        sentEmail.push(s.orderName);
        toMark.push({
          orderName: s.orderName,
          tracking: s.trackingNumbers.join(", "),
          channel: "email",
          dateTab: tabTitle,
        });
      } else if (r.outcome === "skipped") {
        // Already fulfilled / nothing to do → record so we don't re-check forever.
        skippedEmail.push(`${s.orderName} (${r.reason})`);
        toMark.push({
          orderName: s.orderName,
          tracking: s.trackingNumbers.join(", "),
          channel: "email",
          dateTab: tabTitle,
        });
      } else {
        failedEmail.push(`${s.orderName} (${r.reason})`);
      }
    } else {
      skipped.push(s.orderName);
    }
  }

  // Only record what we actually sent/handled, so a failure is retried next run.
  if (!dryRun) await markNotified(toMark);

  return {
    dateLabel: plan.dateLabel,
    sentLine,
    failedLine,
    sentEmail,
    failedEmail,
    skippedEmail,
    skipped,
    dryRun,
  };
}

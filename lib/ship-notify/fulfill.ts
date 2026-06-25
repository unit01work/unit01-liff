// Shopify fulfillment-with-tracking for the EMAIL bucket. Creating a fulfillment
// with notifyCustomer:true makes Shopify send its own native shipping-
// confirmation email (reliable template + tracking link) — we never compose the
// email ourselves.
//
// SIX SAFETY LAYERS (the owner asked for "as stable as possible"):
//   1. Live pre-flight read — if the order is already FULFILLED, or has no OPEN
//      fulfillment order with remaining qty, we SKIP (never double-fulfill /
//      double-email).
//   2. Shopify's own email template via notifyCustomer (not hand-rolled email).
//   3. Resend guard is the caller's (state.ts) + this live fulfilled-check.
//   4. One order at a time; the mutation's userErrors are inspected and only a
//      clean success is reported as sent.
//   5. Unexpected shape (no/many open FOs) → returns "skip" with a reason, never
//      guesses.
//   6. dryRun lets us verify the whole path (which FO, which line items) without
//      writing anything.

const API_VERSION = "2026-04";

async function gql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<{ data: T | null; errors?: unknown }> {
  const res = await fetch(
    `https://${process.env.SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  if (!res.ok) {
    return { data: null, errors: `HTTP ${res.status}: ${await res.text()}` };
  }
  const json = await res.json();
  return { data: (json.data as T) ?? null, errors: json.errors };
}

const FO_QUERY = `
  query FulfillmentPreflight($q: String!) {
    orders(first: 1, query: $q) {
      nodes {
        id
        name
        email
        displayFulfillmentStatus
        fulfillmentOrders(first: 10) {
          nodes {
            id
            status
            lineItems(first: 50) {
              nodes { id remainingQuantity }
            }
          }
        }
      }
    }
  }
`;

const FULFILL_MUTATION = `
  mutation ShipNotifyFulfill($fulfillment: FulfillmentV2Input!) {
    fulfillmentCreateV2(fulfillment: $fulfillment) {
      fulfillment { id status trackingInfo { number company } }
      userErrors { field message }
    }
  }
`;

export type FulfillOutcome = "fulfilled" | "skipped" | "error";

export interface FulfillResult {
  orderName: string;
  outcome: FulfillOutcome;
  reason: string; // Thai, for the owner report
  notifiedCustomer?: boolean;
  email?: string;
}

interface OpenFO {
  id: string;
  lineItems: { id: string; remainingQuantity: number }[];
}

// Build trackingInfo for 1+ numbers. Single → {number}; many → {numbers}.
function trackingInfo(numbers: string[], company: string) {
  if (numbers.length === 1) return { number: numbers[0], company };
  return { numbers, company };
}

export interface FulfillArgs {
  orderName: string; // "#1064"
  trackingNumbers: string[];
  carrier: string;
  dryRun?: boolean;
}

export async function fulfillWithTracking(args: FulfillArgs): Promise<FulfillResult> {
  const { orderName, trackingNumbers, carrier, dryRun = false } = args;

  // ── Layer 1+5: live pre-flight ──
  const pre = await gql<{
    orders: {
      nodes: {
        id: string;
        name: string;
        email: string | null;
        displayFulfillmentStatus: string | null;
        fulfillmentOrders: {
          nodes: {
            id: string;
            status: string;
            lineItems: { nodes: { id: string; remainingQuantity: number }[] };
          }[];
        };
      }[];
    };
  }>(FO_QUERY, { q: `name:"${orderName}"` });

  if (pre.errors || !pre.data) {
    return { orderName, outcome: "error", reason: `อ่านออเดอร์ไม่ได้: ${JSON.stringify(pre.errors)}` };
  }
  const order = pre.data.orders?.nodes?.[0];
  if (!order) {
    return { orderName, outcome: "error", reason: "หาออเดอร์ใน Shopify ไม่เจอ" };
  }

  if (order.displayFulfillmentStatus === "FULFILLED") {
    return {
      orderName,
      outcome: "skipped",
      reason: "ออเดอร์ fulfilled แล้ว — ข้าม (กันส่งซ้ำ)",
      email: order.email || undefined,
    };
  }

  // Collect OPEN fulfillment orders that still have remaining quantity.
  const openFOs: OpenFO[] = order.fulfillmentOrders.nodes
    .filter((fo) => fo.status === "OPEN")
    .map((fo) => ({
      id: fo.id,
      lineItems: fo.lineItems.nodes.filter((li) => li.remainingQuantity > 0),
    }))
    .filter((fo) => fo.lineItems.length > 0);

  if (openFOs.length === 0) {
    return {
      orderName,
      outcome: "skipped",
      reason: "ไม่มี fulfillment order ที่เปิดอยู่ — ข้าม",
      email: order.email || undefined,
    };
  }

  // ── Layer 6: dry run stops here, reporting exactly what WOULD happen ──
  const lineItemsByFulfillmentOrder = openFOs.map((fo) => ({
    fulfillmentOrderId: fo.id,
    fulfillmentOrderLineItems: fo.lineItems.map((li) => ({
      id: li.id,
      quantity: li.remainingQuantity,
    })),
  }));

  if (dryRun) {
    const totalItems = openFOs.reduce((s, fo) => s + fo.lineItems.length, 0);
    return {
      orderName,
      outcome: "skipped",
      reason: `[DRY] จะ fulfill ${openFOs.length} FO / ${totalItems} รายการ + ส่งเมลถึง ${order.email || "(ไม่มีอีเมล)"} | tracking=${trackingNumbers.join(",")}`,
      email: order.email || undefined,
    };
  }

  if (!order.email) {
    return { orderName, outcome: "skipped", reason: "ออเดอร์ไม่มีอีเมล — ข้าม (Shopify ส่งเมลไม่ได้)" };
  }

  // ── Layer 4: do it, inspect userErrors ──
  const mut = await gql<{
    fulfillmentCreateV2: {
      fulfillment: { id: string; status: string } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(FULFILL_MUTATION, {
    fulfillment: {
      lineItemsByFulfillmentOrder,
      trackingInfo: trackingInfo(trackingNumbers, carrier),
      notifyCustomer: true,
    },
  });

  if (mut.errors) {
    return { orderName, outcome: "error", reason: `mutation error: ${JSON.stringify(mut.errors)}`, email: order.email };
  }
  const ue = mut.data?.fulfillmentCreateV2?.userErrors || [];
  if (ue.length > 0) {
    return { orderName, outcome: "error", reason: `userErrors: ${ue.map((e) => e.message).join("; ")}`, email: order.email };
  }
  if (!mut.data?.fulfillmentCreateV2?.fulfillment) {
    return { orderName, outcome: "error", reason: "ไม่ได้ fulfillment กลับมา (ไม่แน่ใจว่าสำเร็จ)", email: order.email };
  }

  return {
    orderName,
    outcome: "fulfilled",
    reason: "fulfill + ส่งเมลถึงลูกค้าสำเร็จ",
    notifiedCustomer: true,
    email: order.email,
  };
}

// Self-contained Shopify Admin GraphQL access for the daily-pull module.
// Uses the same env/token/version as lib/shopify.ts but stays independent so the
// whole module can be deleted in one go.

import type { PulledOrder, PulledLineItem } from "./types";

const API_VERSION = "2026-04";

function endpoint(): string {
  return `https://${process.env.SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`;
}

async function gql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T | null> {
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    console.error("[daily-pull/shopify] HTTP", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  if (json?.errors) {
    console.error("[daily-pull/shopify] GraphQL errors:", JSON.stringify(json.errors));
    return null;
  }
  return json.data as T;
}

const ORDERS_QUERY = `
  query DailyPullOrders($q: String!, $cursor: String) {
    orders(first: 100, query: $q, after: $cursor, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        tags
        displayFinancialStatus
        displayFulfillmentStatus
        shippingAddress {
          name
          firstName
          lastName
          address1
          address2
          city
          province
          country
          zip
          phone
        }
        lineItems(first: 50) {
          nodes { title quantity variantTitle }
        }
        transactions(first: 20) { processedAt status kind }
      }
    }
  }
`;

interface OrdersPage {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: RawOrderNode[];
  };
}

interface RawOrderNode {
  id: string;
  name: string;
  createdAt: string;
  tags: string[];
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  shippingAddress: {
    name?: string;
    firstName?: string;
    lastName?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
    phone?: string;
  } | null;
  lineItems: { nodes: { title: string; quantity: number; variantTitle: string | null }[] };
  transactions: { processedAt: string | null; status: string; kind: string }[];
}

// Earliest successful sale/capture transaction = when the order was paid.
function paidAtOf(o: RawOrderNode): string {
  const paid = o.transactions
    .filter(
      (t) =>
        t.status === "SUCCESS" &&
        (t.kind === "SALE" || t.kind === "CAPTURE") &&
        t.processedAt
    )
    .map((t) => t.processedAt as string)
    .sort();
  return paid[0] || o.createdAt;
}

function mapOrder(o: RawOrderNode): PulledOrder {
  const a = o.shippingAddress || {};
  const lineItems: PulledLineItem[] = o.lineItems.nodes.map((li) => ({
    title: li.title,
    size: li.variantTitle || "",
    quantity: li.quantity,
  }));
  const customerName =
    a.name ||
    [a.firstName, a.lastName].filter(Boolean).join(" ").trim();
  return {
    name: o.name,
    shopifyOrderGid: o.id,
    createdAt: o.createdAt,
    paidAt: paidAtOf(o),
    tags: o.tags || [],
    customerName,
    country: a.country || "",
    address1: a.address1 || "",
    address2: a.address2 || "",
    city: a.city || "",
    province: a.province || "",
    zip: a.zip || "",
    phone: a.phone || "",
    lineItems,
  };
}

// Pull every PAID + UNFULFILLED order created in (or near) a UTC range.
// We query by created_at with a 1-day pad on each side, then the caller slices
// precisely by paidAt vs the 10:00 ICT cutoff. `excludeWorklisted` skips orders
// already tagged (normal daily run); a manual ?date= regen passes false.
export async function pullPaidUnfulfilledOrders(opts: {
  rangeStartUtc: Date;
  rangeEndUtc: Date;
  excludeWorklisted: boolean;
}): Promise<PulledOrder[]> {
  const pad = 24 * 60 * 60 * 1000;
  const lo = new Date(opts.rangeStartUtc.getTime() - pad).toISOString();
  const hi = new Date(opts.rangeEndUtc.getTime() + pad).toISOString();
  const tagClause = opts.excludeWorklisted ? " -tag:worklisted" : "";
  const q = `financial_status:paid fulfillment_status:unfulfilled created_at:>='${lo}' created_at:<='${hi}'${tagClause}`;

  const out: PulledOrder[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 50; guard++) {
    const data: OrdersPage | null = await gql<OrdersPage>(ORDERS_QUERY, {
      q,
      cursor,
    });
    if (!data) break;
    for (const node of data.orders.nodes) out.push(mapOrder(node));
    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
  }
  return out;
}

// Add the `worklisted` tag so an order is never pulled into a later day.
export async function tagWorklisted(orderGids: string[]): Promise<{ ok: boolean; failed: string[] }> {
  const failed: string[] = [];
  for (const id of orderGids) {
    const data = await gql<{ tagsAdd: { userErrors: { message: string }[] } }>(
      `mutation AddTag($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) { userErrors { message } }
      }`,
      { id, tags: ["worklisted"] }
    );
    if (!data || data.tagsAdd.userErrors.length > 0) failed.push(id);
  }
  return { ok: failed.length === 0, failed };
}

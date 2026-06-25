// Join a carrier shipment (order name + tracking) to a notification recipient
// and channel. The hard-won lookup chain (verified against real data):
//
//   carrier "#1058"
//     → Shopify GraphQL  orders(query:"name:#1058")  → { gid, legacyResourceId,
//                                                         tags, email, items }
//     → our Orders tab   row where "Shopify Order ID" == legacyResourceId
//                                                       → "LINE User ID"
//
// Matching by the carrier order number against our internal "Order ID" FAILS
// (different id space); the legacyResourceId is the only reliable join key.

import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { OWNER_LINE_USER_ID, type Channel } from "./config";
import type { CarrierShipment } from "./carrier-sheet";

const API_VERSION = "2026-04";

// ── Shopify lookup ──────────────────────────────────────────────────────────

interface ShopifyOrderInfo {
  gid: string;
  legacyId: string; // numeric legacyResourceId as string
  name: string;
  tags: string[];
  email: string;
  fulfillmentStatus: string | null;
  productSummary: string; // for the customer card ITEM line
}

async function shopifyGql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T | null> {
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
    console.error("[ship-notify/join] Shopify HTTP", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  if (json?.errors) {
    console.error("[ship-notify/join] GraphQL errors:", JSON.stringify(json.errors));
    return null;
  }
  return json.data as T;
}

const ORDER_BY_NAME = `
  query OrderByName($q: String!) {
    orders(first: 1, query: $q) {
      nodes {
        id
        legacyResourceId
        name
        email
        tags
        displayFulfillmentStatus
        lineItems(first: 20) {
          nodes { title quantity variantTitle }
        }
      }
    }
  }
`;

function summariseItems(
  nodes: { title: string; quantity: number; variantTitle: string | null }[]
): string {
  return nodes
    .map((li) => {
      const size = li.variantTitle && li.variantTitle !== "Default Title" ? ` (${li.variantTitle})` : "";
      return `${li.title}${size} x${li.quantity}`;
    })
    .join(", ");
}

export async function lookupShopifyOrder(
  orderName: string
): Promise<ShopifyOrderInfo | null> {
  // name:#1058 — quote so the "#" isn't treated as a comment in the search DSL.
  const data = await shopifyGql<{
    orders: {
      nodes: {
        id: string;
        legacyResourceId: string;
        name: string;
        email: string | null;
        tags: string[];
        displayFulfillmentStatus: string | null;
        lineItems: { nodes: { title: string; quantity: number; variantTitle: string | null }[] };
      }[];
    };
  }>(ORDER_BY_NAME, { q: `name:"${orderName}"` });

  const node = data?.orders?.nodes?.[0];
  if (!node) return null;
  return {
    gid: node.id,
    legacyId: node.legacyResourceId,
    name: node.name,
    tags: node.tags || [],
    email: node.email || "",
    fulfillmentStatus: node.displayFulfillmentStatus || null,
    productSummary: summariseItems(node.lineItems?.nodes || []),
  };
}

// ── our Orders tab: legacyResourceId → LINE User ID ─────────────────────────

function ourKey(): string {
  const b64 = process.env.GOOGLE_PRIVATE_KEY_BASE64 || "";
  if (b64) {
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    return decoded.includes("\\n") ? decoded.split("\\n").join("\n") : decoded;
  }
  const key = process.env.GOOGLE_PRIVATE_KEY || "";
  return key.includes("\\n") ? key.split("\\n").join("\n") : key;
}

// Build a map { shopifyOrderId(legacyId) → lineUserId } from our Orders tab.
// Read once per plan build (not per shipment) to keep Sheets calls down.
export async function loadShopifyIdToLineUser(): Promise<Map<string, string>> {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: ourKey(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID!, auth);
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Orders"];
  const map = new Map<string, string>();
  if (!sheet) return map;
  const rows = await sheet.getRows();
  for (const r of rows) {
    const shopId = (r.get("Shopify Order ID") || "").trim();
    const lineUser = (r.get("LINE User ID") || "").trim();
    if (shopId && lineUser) map.set(shopId, lineUser);
  }
  return map;
}

// ── resolution ──────────────────────────────────────────────────────────────

export interface ResolvedShipment {
  orderName: string;
  trackingNumbers: string[];
  carrier: string;
  customer: string; // carrier display name
  channel: Channel;
  lineUserId?: string;
  email?: string;
  productSummary?: string;
  reason: string; // short Thai reason, for the confirm card / logs
}

export async function resolveShipment(
  s: CarrierShipment,
  idToUser: Map<string, string>
): Promise<ResolvedShipment> {
  const base = {
    orderName: s.orderName,
    trackingNumbers: s.trackingNumbers,
    carrier: s.carrier,
    customer: s.customer,
  };

  const order = await lookupShopifyOrder(s.orderName);
  if (!order) {
    return { ...base, channel: "manual", reason: "หาออเดอร์ใน Shopify ไม่เจอ" };
  }

  const isLiff = order.tags.includes("liff-order");
  const lineUserId = idToUser.get(order.legacyId) || "";

  if (lineUserId && lineUserId === OWNER_LINE_USER_ID) {
    return {
      ...base,
      channel: "owner",
      lineUserId,
      productSummary: order.productSummary,
      reason: "ออเดอร์ที่สั่งแทน (LINE เป็นของร้าน) — แจ้งเอง",
    };
  }

  if (isLiff) {
    if (lineUserId) {
      return {
        ...base,
        channel: "line",
        lineUserId,
        productSummary: order.productSummary,
        reason: "ลูกค้า LINE — ส่งการ์ดแจ้งพัสดุ",
      };
    }
    // liff-order but we have no stored LINE id → can't push.
    return {
      ...base,
      channel: "manual",
      productSummary: order.productSummary,
      reason: "ออเดอร์ LINE แต่ไม่พบ LINE User ID ในชีต Orders",
    };
  }

  // Not a liff-order → Shopify-direct customer.
  if (order.email) {
    return {
      ...base,
      channel: "email",
      email: order.email,
      productSummary: order.productSummary,
      reason: "ลูกค้า Shopify — Shopify ส่งอีเมลแจ้งพัสดุ",
    };
  }

  return {
    ...base,
    channel: "manual",
    productSummary: order.productSummary,
    reason: "ไม่มีทั้ง LINE และอีเมล — แจ้งเอง",
  };
}

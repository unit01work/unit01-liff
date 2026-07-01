// Self-contained types for the daily-pull worklist module.
// This module is intentionally decoupled from the core sales loop so it can be
// switched off (remove the 2 crons) without touching anything else.

export interface PulledLineItem {
  title: string;
  size: string; // variantTitle (e.g. "S", "M", "L")
  quantity: number;
}

export interface PulledOrder {
  name: string; // e.g. "#1019"
  shopifyOrderGid: string; // GraphQL id, used to add the `worklisted` tag
  createdAt: string; // ISO UTC
  paidAt: string; // ISO UTC — payment processedAt (fallback createdAt)
  tags: string[];
  customerName: string;
  country: string; // display name, e.g. "Mexico"
  countryCode: string; // ISO 3166-1 alpha-2, e.g. "MX" — used to pick dial code
  address1: string;
  address2: string;
  city: string;
  province: string;
  zip: string;
  phone: string; // E.164 as Shopify stores it — NOT converted
  lineItems: PulledLineItem[];
}

// One worklist row = one order, 11 columns (see DAILY-PULL spec).
export interface WorklistRow {
  orderName: string; // 1
  date: string; // 2  YYYY-MM-DD (ICT)
  time: string; // 3  HH:MM (ICT)
  country: string; // 4
  customer: string; // 5
  address: string; // 6  address1 address2 city province (no zip)
  zip: string; // 7
  phone: string; // 8  E.164
  products: string; // 9  titles joined by " ; "
  qty: number; // 10 total quantity
  sizes: string; // 11 e.g. "S x1 / L x1"
}

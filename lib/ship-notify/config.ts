// Central config for the ship-notify ("order shipped") feature.
// Self-contained like lib/daily-pull/* so the whole feature can be removed in
// one go without touching the sales loop.

// Shop owner / admin LINE userId. ONLY this user can trigger ship-notify, and
// orders whose stored LINE User ID equals this id are treated as "owner-placed"
// (placed on a friend's behalf) → never auto-notified.
export const OWNER_LINE_USER_ID =
  process.env.OWNER_LINE_USER_ID ||
  process.env.ADMIN_LINE_USER_ID ||
  "U7f329a9ce9a351a1bebc77646e20b2e1";

// Secret trigger phrase. The owner types EXACTLY this (case-sensitive, trimmed)
// from their own LINE to open the ship-notify day picker. A plain word is
// avoided so normal chat with customers can never accidentally trigger it; the
// userId check above is the real gate, this is the second layer.
export const SHIP_NOTIFY_CODE = process.env.SHIP_NOTIFY_CODE || "neosneo2375";

// The carrier's shared Google Sheet ("ส่งเสื้อลูกค้า Unit-01"). The carrier
// (Flash Express) fills one dated tab per round with tracking numbers. The
// service account already has read access.
export const CARRIER_SHEETS_ID =
  process.env.CARRIER_SHEETS_ID || "1YPgyYDRX_8w-4ntv3vziDlmQhe0P9HVQJzV0h64my98";

// Column names in the carrier sheet (Thai). Stable across tabs.
export const CARRIER_COL = {
  orderName: "เลขคำสั่งซื้อ",
  customer: "ลูกค้า",
  tracking: "Tracking Number",
  carrier: "ขนส่ง",
} as const;

// Where ship-notify state lives — OUR own workbook (GOOGLE_SHEETS_ID), a
// dedicated tab. We never write back into the carrier's sheet (owner's choice).
export const NOTIFIED_TAB = "Ship Notified";
export const NOTIFIED_HEADERS = [
  "Order Name", // e.g. #1058
  "Tracking", // joined tracking number(s)
  "Channel", // line | email
  "LINE User ID", // recipient (if line)
  "Notified At", // YYYY-MM-DD HH:MM (Bangkok)
  "Date Tab", // carrier tab title this came from
] as const;

// Routing buckets for one shipment.
export type Channel =
  | "line" // real LINE customer → push the Flex card
  | "email" // Shopify-direct customer → fulfill w/ tracking → Shopify emails
  | "owner" // owner-placed (LINE id == owner) → skip, owner tells them himself
  | "done" // already notified in a previous run
  | "manual"; // no usable channel found → owner handles manually

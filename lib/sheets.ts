import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { getAllVariantsWithStock } from "./shopify";

export interface OrderRow {
  "Order ID": string;
  "Date": string;
  "LINE User ID": string;
  "Status": string;
  "Items": string;
  "Subtotal": number;
  "Shipping Fee": number;
  "Total": number;
  "First Name": string;
  "Last Name": string;
  "Phone": string;
  "Address": string;
  "Sub-district": string;
  "District": string;
  "Province": string;
  "Postal Code": string;
  "Updated At": string;
  "Transaction Ref": string;
  "Paid At": string;
  "Variant IDs": string;
  "Shopify Order ID": string;
  "Size Changed": string;
  "Address Changed": string;
}

function getPrivateKey(): string {
  // Priority 1: Base64-encoded key (most reliable for Vercel)
  const b64 = process.env.GOOGLE_PRIVATE_KEY_BASE64 || "";
  if (b64) {
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    // The base64 value wraps the original .env.local value which has literal \n
    if (decoded.includes("\\n")) {
      return decoded.split("\\n").join("\n");
    }
    return decoded;
  }

  // Priority 2: Plain key (works locally)
  const raw = process.env.GOOGLE_PRIVATE_KEY || "";
  if (raw.includes("\\n")) {
    return raw.split("\\n").join("\n");
  }
  return raw;
}

function getDoc() {
  const key = getPrivateKey();
  console.log("[sheets] key starts with:", key.slice(0, 40));
  console.log("[sheets] key has real newlines:", key.includes("\n"));
  const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID!, serviceAccountAuth);
}

function nowBKK(): string {
  return new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  }).replace("T", " ").slice(0, 16);
}

const HEADERS = [
  "Order ID", "Date", "LINE User ID", "Status",
  "Items", "Subtotal", "Shipping Fee", "Total",
  "First Name", "Last Name", "Phone", "Address",
  "Sub-district", "District", "Province", "Postal Code",
  "Updated At", "Transaction Ref", "Paid At",
  "Variant IDs", "Shopify Order ID", "Size Changed", "Address Changed",
];

async function getOrCreateSheet(doc: GoogleSpreadsheet) {
  let sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) {
    console.log("Creating 'Orders' sheet...");
    sheet = await doc.addSheet({ title: "Orders", headerValues: HEADERS });
  } else {
    // Ensure headers exist (sheet might be empty)
    try {
      await sheet.loadHeaderRow();
      // Auto-migrate: check if all required headers exist
      const existingHeaders = sheet.headerValues || [];
      const missingHeaders = HEADERS.filter((h) => !existingHeaders.includes(h));
      if (missingHeaders.length > 0) {
        console.log("Adding missing headers:", missingHeaders);
        await sheet.setHeaderRow([...existingHeaders, ...missingHeaders]);
      }
    } catch {
      console.log("Setting header row...");
      await sheet.setHeaderRow(HEADERS);
    }
  }
  return sheet;
}

export async function appendOrder(data: {
  orderId: string;
  lineUserId: string;
  items: { name: string; size: string; price: number; qty: number }[];
  sub: number;
  ship: number;
  total: number;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  subDistrict: string;
  district: string;
  province: string;
  postalCode: string;
  variantIds?: string;
}) {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = await getOrCreateSheet(doc);

  const itemsStr = data.items
    .map((c) => `${c.name} (${c.size}) x${c.qty}`)
    .join(", ");

  const now = nowBKK();

  await sheet.addRow({
    "Order ID": data.orderId,
    "Date": now,
    "LINE User ID": data.lineUserId,
    "Status": "PENDING",
    "Items": itemsStr,
    "Subtotal": data.sub,
    "Shipping Fee": data.ship,
    "Total": data.total,
    "First Name": data.firstName,
    "Last Name": data.lastName,
    "Phone": data.phone,
    "Address": data.address,
    "Sub-district": data.subDistrict,
    "District": data.district,
    "Province": data.province,
    "Postal Code": data.postalCode,
    "Updated At": now,
    "Variant IDs": data.variantIds || "",
  });
}

// Match orderId with or without # prefix
function matchOrderId(stored: string, search: string): boolean {
  if (stored === search) return true;
  if (stored === `#${search}`) return true;
  if (search === `#${stored}`) return true;
  return false;
}

export async function getOrder(orderId: string): Promise<OrderRow | null> {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = await getOrCreateSheet(doc);

  const rows = await sheet.getRows();
  const row = rows.find((r) => matchOrderId(r.get("Order ID") || "", orderId));
  if (!row) return null;

  return {
    "Order ID": row.get("Order ID"),
    "Date": row.get("Date"),
    "LINE User ID": row.get("LINE User ID"),
    "Status": row.get("Status"),
    "Items": row.get("Items"),
    "Subtotal": Number(row.get("Subtotal")),
    "Shipping Fee": Number(row.get("Shipping Fee")),
    "Total": Number(row.get("Total")),
    "First Name": row.get("First Name"),
    "Last Name": row.get("Last Name"),
    "Phone": row.get("Phone"),
    "Address": row.get("Address"),
    "Sub-district": row.get("Sub-district"),
    "District": row.get("District"),
    "Province": row.get("Province"),
    "Postal Code": row.get("Postal Code"),
    "Updated At": row.get("Updated At"),
    "Transaction Ref": row.get("Transaction Ref") || "",
    "Paid At": row.get("Paid At") || "",
    "Variant IDs": row.get("Variant IDs") || "",
    "Shopify Order ID": row.get("Shopify Order ID") || "",
    "Size Changed": row.get("Size Changed") || "",
    "Address Changed": row.get("Address Changed") || "",
  };
}

/**
 * Full order update for reorder flow — updates items, shipping, totals, variant IDs.
 * Only works on PENDING orders.
 */
export async function updateOrderFull(
  orderId: string,
  data: {
    items: string;
    subtotal: number;
    shippingFee: number;
    total: number;
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    subDistrict: string;
    district: string;
    province: string;
    postalCode: string;
    variantIds: string;
  }
): Promise<boolean> {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) return false;

  const rows = await sheet.getRows();
  const row = rows.find((r) => matchOrderId(r.get("Order ID") || "", orderId));
  if (!row) return false;

  // Only allow reorder on PENDING orders
  if ((row.get("Status") || "").toUpperCase() !== "PENDING") return false;

  row.set("Items", data.items);
  row.set("Subtotal", data.subtotal);
  row.set("Shipping Fee", data.shippingFee);
  row.set("Total", data.total);
  row.set("First Name", data.firstName);
  row.set("Last Name", data.lastName);
  row.set("Phone", data.phone);
  row.set("Address", data.address);
  row.set("Sub-district", data.subDistrict);
  row.set("District", data.district);
  row.set("Province", data.province);
  row.set("Postal Code", data.postalCode);
  row.set("Variant IDs", data.variantIds);
  row.set("Updated At", nowBKK());
  await row.save();
  return true;
}

export async function updateOrderShipping(
  orderId: string,
  data: {
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    subDistrict: string;
    district: string;
    province: string;
    postalCode: string;
  }
): Promise<boolean> {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = await getOrCreateSheet(doc);

  const rows = await sheet.getRows();
  const row = rows.find((r) => matchOrderId(r.get("Order ID") || "", orderId));
  if (!row) return false;

  row.set("First Name", data.firstName);
  row.set("Last Name", data.lastName);
  row.set("Phone", data.phone);
  row.set("Address", data.address);
  row.set("Sub-district", data.subDistrict);
  row.set("District", data.district);
  row.set("Province", data.province);
  row.set("Postal Code", data.postalCode);
  row.set("Address Changed", "YES");
  row.set("Updated At", nowBKK());
  await row.save();
  console.log("[sheets] updateOrderShipping:", orderId, "Address Changed set to YES");
  return true;
}

export async function ensureHeaders() {
  const doc = getDoc();
  await doc.loadInfo();
  let sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) {
    sheet = await doc.addSheet({ title: "Orders" });
  }
  const rows = await sheet.getRows();
  if (rows.length === 0) {
    await sheet.setHeaderRow(HEADERS);
  }
}

/* ── Slip verification helpers ── */

/**
 * Find a PENDING order for the given user with matching amount.
 * Returns the most recent match (last row).
 */
export async function findPendingOrder(
  userId: string,
  amount: number
): Promise<OrderRow | null> {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) return null;
  try { await sheet.loadHeaderRow(); } catch { return null; }

  const rows = await sheet.getRows();

  // Search from last to first (most recent order first)
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const status = (row.get("Status") || "").toUpperCase();
    const lineUserId = row.get("LINE User ID") || "";
    const total = Number(row.get("Total") || 0);

    if (status === "PENDING" && lineUserId === userId && total === amount) {
      return {
        "Order ID": row.get("Order ID"),
        "Date": row.get("Date"),
        "LINE User ID": lineUserId,
        "Status": row.get("Status"),
        "Items": row.get("Items"),
        "Subtotal": Number(row.get("Subtotal")),
        "Shipping Fee": Number(row.get("Shipping Fee")),
        "Total": total,
        "First Name": row.get("First Name"),
        "Last Name": row.get("Last Name"),
        "Phone": row.get("Phone"),
        "Address": row.get("Address"),
        "Sub-district": row.get("Sub-district"),
        "District": row.get("District"),
        "Province": row.get("Province"),
        "Postal Code": row.get("Postal Code"),
        "Updated At": row.get("Updated At"),
        "Transaction Ref": row.get("Transaction Ref") || "",
        "Paid At": row.get("Paid At") || "",
        "Variant IDs": row.get("Variant IDs") || "",
        "Shopify Order ID": row.get("Shopify Order ID") || "",
        "Size Changed": row.get("Size Changed") || "",
        "Address Changed": row.get("Address Changed") || "",
      };
    }
  }

  return null;
}

/**
 * Check if a transRef has already been used (duplicate slip protection).
 */
export async function checkDuplicateTransRef(transRef: string): Promise<boolean> {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) return false;
  try { await sheet.loadHeaderRow(); } catch { return false; }

  const rows = await sheet.getRows();
  return rows.some((row) => (row.get("Transaction Ref") || "") === transRef);
}

/**
 * Update an order's status to PAID with transaction reference.
 */
export async function updateOrderStatus(
  orderId: string,
  status: string,
  transRef: string
): Promise<boolean> {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) return false;
  try { await sheet.loadHeaderRow(); } catch { return false; }

  const rows = await sheet.getRows();
  const row = rows.find((r) => matchOrderId(r.get("Order ID") || "", orderId));
  if (!row) return false;

  row.set("Status", status);
  if (transRef) row.set("Transaction Ref", transRef);
  if (status === "PAID") row.set("Paid At", nowBKK());
  row.set("Updated At", nowBKK());
  await row.save();
  return true;
}

/**
 * Find PENDING orders that are older than `minutes` minutes.
 * Used by the auto-cancel cron job.
 */
export async function findExpiredOrders(minutes: number): Promise<OrderRow[]> {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) return [];
  try { await sheet.loadHeaderRow(); } catch { return []; }

  const rows = await sheet.getRows();
  const results: OrderRow[] = [];
  const now = new Date();

  for (const row of rows) {
    const status = (row.get("Status") || "").toUpperCase();
    if (status !== "PENDING") continue;

    const dateStr = row.get("Date") || "";
    if (!dateStr) continue;

    // Parse the date (stored in BKK time: "YYYY-MM-DD HH:mm")
    const orderDate = new Date(dateStr.replace(" ", "T") + "+07:00");
    const diffMs = now.getTime() - orderDate.getTime();
    const diffMin = diffMs / (1000 * 60);

    if (diffMin >= minutes) {
      results.push({
        "Order ID": row.get("Order ID"),
        "Date": dateStr,
        "LINE User ID": row.get("LINE User ID") || "",
        "Status": status,
        "Items": row.get("Items"),
        "Subtotal": Number(row.get("Subtotal")),
        "Shipping Fee": Number(row.get("Shipping Fee")),
        "Total": Number(row.get("Total")),
        "First Name": row.get("First Name"),
        "Last Name": row.get("Last Name"),
        "Phone": row.get("Phone"),
        "Address": row.get("Address"),
        "Sub-district": row.get("Sub-district"),
        "District": row.get("District"),
        "Province": row.get("Province"),
        "Postal Code": row.get("Postal Code"),
        "Updated At": row.get("Updated At"),
        "Transaction Ref": row.get("Transaction Ref") || "",
        "Paid At": row.get("Paid At") || "",
        "Variant IDs": row.get("Variant IDs") || "",
        "Shopify Order ID": row.get("Shopify Order ID") || "",
        "Size Changed": row.get("Size Changed") || "",
        "Address Changed": row.get("Address Changed") || "",
      });
    }
  }

  return results;
}

/**
 * Save Shopify Draft Order ID back to the order row.
 */
/**
 * Find the latest order data for a returning customer by LINE userId.
 * Returns shipping info from their most recent order, or null if not found.
 */
export async function findLatestCustomerData(
  userId: string
): Promise<{
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  subDistrict: string;
  district: string;
  province: string;
  postalCode: string;
} | null> {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) return null;
  try { await sheet.loadHeaderRow(); } catch { return null; }

  const rows = await sheet.getRows();

  // Search from last to first (most recent order)
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if ((row.get("LINE User ID") || "") === userId) {
      const firstName = row.get("First Name") || "";
      if (!firstName) continue; // Skip rows without shipping info
      return {
        firstName,
        lastName: row.get("Last Name") || "",
        phone: row.get("Phone") || "",
        address: row.get("Address") || "",
        subDistrict: row.get("Sub-district") || "",
        district: row.get("District") || "",
        province: row.get("Province") || "",
        postalCode: row.get("Postal Code") || "",
      };
    }
  }

  return null;
}

export async function updateShopifyOrderId(
  orderId: string,
  shopifyOrderId: string
): Promise<boolean> {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) return false;
  try { await sheet.loadHeaderRow(); } catch { return false; }

  const rows = await sheet.getRows();
  const row = rows.find((r) => matchOrderId(r.get("Order ID") || "", orderId));
  if (!row) return false;

  row.set("Shopify Order ID", shopifyOrderId);
  row.set("Updated At", nowBKK());
  await row.save();
  return true;
}

/**
 * Find the latest order (any status) for a user by LINE userId.
 */
export async function findLatestOrderByUser(userId: string): Promise<OrderRow | null> {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) return null;
  try { await sheet.loadHeaderRow(); } catch { return null; }

  const rows = await sheet.getRows();
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if ((row.get("LINE User ID") || "") === userId) {
      return {
        "Order ID": row.get("Order ID"),
        "Date": row.get("Date"),
        "LINE User ID": userId,
        "Status": row.get("Status"),
        "Items": row.get("Items"),
        "Subtotal": Number(row.get("Subtotal")),
        "Shipping Fee": Number(row.get("Shipping Fee")),
        "Total": Number(row.get("Total")),
        "First Name": row.get("First Name"),
        "Last Name": row.get("Last Name"),
        "Phone": row.get("Phone"),
        "Address": row.get("Address"),
        "Sub-district": row.get("Sub-district"),
        "District": row.get("District"),
        "Province": row.get("Province"),
        "Postal Code": row.get("Postal Code"),
        "Updated At": row.get("Updated At"),
        "Transaction Ref": row.get("Transaction Ref") || "",
        "Paid At": row.get("Paid At") || "",
        "Variant IDs": row.get("Variant IDs") || "",
        "Shopify Order ID": row.get("Shopify Order ID") || "",
        "Size Changed": row.get("Size Changed") || "",
        "Address Changed": row.get("Address Changed") || "",
      };
    }
  }
  return null;
}

/**
 * Update order size: change Items text, Variant IDs, and mark Size Changed = YES.
 */
/**
 * Find all active (PAID) orders for a user by LINE userId.
 * Optional filter: "address" = exclude Address Changed=YES,
 *                  "size" = exclude Size Changed=YES,
 *                  undefined = all PAID orders.
 * Fulfillment filtering is done separately via Shopify API.
 */
export async function findActiveOrders(
  userId: string,
  filter?: "address" | "size"
): Promise<OrderRow[]> {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = await getOrCreateSheet(doc);

  const rows = await sheet.getRows();
  const results: OrderRow[] = [];

  // Collect all PAID orders for this user (newest first)
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (
      (row.get("LINE User ID") || "") === userId &&
      (row.get("Status") || "").toUpperCase() === "PAID"
    ) {
      // Apply lock filter
      const addrChanged = (row.get("Address Changed") || "").toUpperCase();
      const sizeChanged = (row.get("Size Changed") || "").toUpperCase();
      if (filter === "address" && addrChanged === "YES") {
        console.log("[sheets] Filtered out", row.get("Order ID"), "Address Changed =", addrChanged);
        continue;
      }
      if (filter === "size" && sizeChanged === "YES") {
        console.log("[sheets] Filtered out", row.get("Order ID"), "Size Changed =", sizeChanged);
        continue;
      }

      results.push({
        "Order ID": row.get("Order ID"),
        "Date": row.get("Date"),
        "LINE User ID": userId,
        "Status": row.get("Status"),
        "Items": row.get("Items"),
        "Subtotal": Number(row.get("Subtotal")),
        "Shipping Fee": Number(row.get("Shipping Fee")),
        "Total": Number(row.get("Total")),
        "First Name": row.get("First Name"),
        "Last Name": row.get("Last Name"),
        "Phone": row.get("Phone"),
        "Address": row.get("Address"),
        "Sub-district": row.get("Sub-district"),
        "District": row.get("District"),
        "Province": row.get("Province"),
        "Postal Code": row.get("Postal Code"),
        "Updated At": row.get("Updated At"),
        "Transaction Ref": row.get("Transaction Ref") || "",
        "Paid At": row.get("Paid At") || "",
        "Variant IDs": row.get("Variant IDs") || "",
        "Shopify Order ID": row.get("Shopify Order ID") || "",
        "Size Changed": row.get("Size Changed") || "",
        "Address Changed": row.get("Address Changed") || "",
      });
    }
  }

  return results;
}

export async function updateOrderSize(
  orderId: string,
  oldSize: string,
  newSize: string,
  newVariantId: string
): Promise<boolean> {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) return false;
  try { await sheet.loadHeaderRow(); } catch { return false; }

  const rows = await sheet.getRows();
  const row = rows.find((r) => matchOrderId(r.get("Order ID") || "", orderId));
  if (!row) return false;

  // Update Items text: replace size reference
  const items = row.get("Items") || "";
  const updatedItems = items.replace(
    new RegExp(`\\(${oldSize}\\)`, "i"),
    `(${newSize})`
  );
  row.set("Items", updatedItems);

  // Update Variant IDs: replace old variant with new
  const variantIds = row.get("Variant IDs") || "";
  // Format: "variantId:qty" — replace the variant ID portion
  const parts = variantIds.split(",").map((p: string) => p.trim());
  const updatedParts = parts.map((p: string) => {
    const [, qty] = p.split(":");
    // If this is the item being changed, use new variant ID
    // For single-item orders this is straightforward
    return `${newVariantId}:${qty || "1"}`;
  });
  row.set("Variant IDs", updatedParts.join(","));

  row.set("Size Changed", "YES");
  row.set("Updated At", nowBKK());
  await row.save();
  return true;
}

/* ──────────────────────────────────────────────────────────────
 * STOCK SYSTEM — "Stock" overview tab + "Stock Log" history tab
 * ────────────────────────────────────────────────────────────── */

const STOCK_HEADERS = [
  "Product", "Size", "Variant ID", "Shopify Stock",
  "Reserved", "Available", "Sold", "Last Updated",
];

const STOCK_LOG_HEADERS = [
  "Date", "Type", "Product", "Size", "Variant ID",
  "Change", "Stock After", "Order ID", "Note",
];

/** Generic get-or-create tab that ensures the given headers exist. */
async function getOrCreateTab(
  doc: GoogleSpreadsheet,
  title: string,
  headers: string[]
) {
  let sheet = doc.sheetsByTitle[title];
  if (!sheet) {
    console.log(`[sheets] Creating '${title}' tab...`);
    sheet = await doc.addSheet({ title, headerValues: headers });
    return sheet;
  }
  try {
    await sheet.loadHeaderRow();
    const existing = sheet.headerValues || [];
    const missing = headers.filter((h) => !existing.includes(h));
    if (missing.length > 0) {
      await sheet.setHeaderRow([...existing, ...missing]);
    }
  } catch {
    await sheet.setHeaderRow(headers);
  }
  return sheet;
}

export interface OrderLineItem {
  product: string;
  size: string;
  variantId: string;
  qty: number;
}

/**
 * Parse an order's line items by zipping the "Items" text
 * ("Name (Size) xQty, ...") with the "Variant IDs" field ("vid:qty,...").
 */
export function parseOrderItems(order: OrderRow): OrderLineItem[] {
  const itemsStr = order["Items"] || "";
  const variantIds = order["Variant IDs"] || "";

  const vidParts = variantIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const itemParts = itemsStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const result: OrderLineItem[] = [];
  const len = Math.max(vidParts.length, itemParts.length);
  for (let i = 0; i < len; i++) {
    const [vid, vidQty] = (vidParts[i] || "").split(":");
    const m = (itemParts[i] || "").match(/^(.+?)\s*\((\w+)\)\s*x(\d+)$/);
    const product = m ? m[1].trim() : "";
    const size = m ? m[2] : "";
    const qty = m ? parseInt(m[3], 10) : parseInt(vidQty, 10) || 1;
    const variantId = (vid || "").trim();
    if (!variantId && !product) continue;
    result.push({ product, size, variantId, qty: qty || 1 });
  }
  return result;
}

export type StockLogType = "RESERVED" | "SOLD" | "RETURNED" | "RESTOCK";

export interface StockLogEntry {
  type: StockLogType;
  product: string;
  size: string;
  variantId: string;
  change: number;
  stockAfter?: number | null;
  orderId?: string;
  note?: string;
}

/** Append one movement row to the "Stock Log" tab (never overwrites). */
export async function appendStockLog(entry: StockLogEntry): Promise<void> {
  try {
    const doc = getDoc();
    await doc.loadInfo();
    const sheet = await getOrCreateTab(doc, "Stock Log", STOCK_LOG_HEADERS);
    await sheet.addRow({
      "Date": nowBKK(),
      "Type": entry.type,
      "Product": entry.product,
      "Size": entry.size,
      "Variant ID": entry.variantId,
      "Change": entry.change > 0 ? `+${entry.change}` : String(entry.change),
      "Stock After": entry.stockAfter ?? "",
      "Order ID": entry.orderId || "",
      "Note": entry.note || "",
    });
  } catch (err) {
    console.error("[sheets] appendStockLog failed:", err);
  }
}

/** Append a Stock Log row for every line item of an order. */
export async function logOrderStockMovement(
  order: OrderRow,
  type: StockLogType,
  changePerUnit: number,
  note: string
): Promise<void> {
  const items = parseOrderItems(order);
  for (const it of items) {
    await appendStockLog({
      type,
      product: it.product,
      size: it.size,
      variantId: it.variantId,
      change: changePerUnit * it.qty,
      orderId: order["Order ID"],
      note,
    });
  }
}

/**
 * Rebuild the "Stock" overview tab from authoritative sources:
 * Shopify inventory + live Reserved (PENDING) / Sold (PAID) counts
 * from the Orders tab. Overwrites all data rows.
 */
export async function refreshStockTab(): Promise<void> {
  const variants = await getAllVariantsWithStock();
  if (variants.length === 0) {
    console.warn("[sheets] refreshStockTab: no variants from Shopify, skipping");
    return;
  }

  const doc = getDoc();
  await doc.loadInfo();

  // Ensure the history tab exists too, so both tabs appear together
  await getOrCreateTab(doc, "Stock Log", STOCK_LOG_HEADERS);

  // Count Reserved (PENDING) and Sold (PAID) per variant from Orders tab
  const reserved: Record<string, number> = {};
  const sold: Record<string, number> = {};
  const ordersSheet = doc.sheetsByTitle["Orders"];
  if (ordersSheet) {
    try {
      await ordersSheet.loadHeaderRow();
      const rows = await ordersSheet.getRows();
      for (const row of rows) {
        const status = (row.get("Status") || "").toUpperCase();
        if (status !== "PENDING" && status !== "PAID") continue;
        const vids = (row.get("Variant IDs") || "") as string;
        for (const part of vids.split(",")) {
          const [vid, q] = part.trim().split(":");
          if (!vid) continue;
          const qty = parseInt(q, 10) || 1;
          if (status === "PENDING") reserved[vid] = (reserved[vid] || 0) + qty;
          else sold[vid] = (sold[vid] || 0) + qty;
        }
      }
    } catch (err) {
      console.error("[sheets] refreshStockTab: failed reading Orders:", err);
    }
  }

  const stockSheet = await getOrCreateTab(doc, "Stock", STOCK_HEADERS);
  await stockSheet.clearRows().catch(() => {});

  const now = nowBKK();
  const newRows = variants.map((v) => {
    const r = reserved[v.variantId] || 0;
    return {
      "Product": v.product,
      "Size": v.size,
      "Variant ID": v.variantId,
      "Shopify Stock": v.stock,
      "Reserved": r,
      "Available": v.stock - r,
      "Sold": sold[v.variantId] || 0,
      "Last Updated": now,
    };
  });

  if (newRows.length > 0) {
    await stockSheet.addRows(newRows);
  }
  console.log(`[sheets] refreshStockTab: wrote ${newRows.length} variant rows`);
}

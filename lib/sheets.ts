import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

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
  "Variant IDs", "Shopify Order ID",
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
  const sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) return null;
  try { await sheet.loadHeaderRow(); } catch { return null; }

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
  };
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
  const sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) return false;

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
  row.set("Updated At", nowBKK());
  await row.save();
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
  row.set("Transaction Ref", transRef);
  row.set("Paid At", nowBKK());
  row.set("Updated At", nowBKK());
  await row.save();
  return true;
}

/**
 * Save Shopify Draft Order ID back to the order row.
 */
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

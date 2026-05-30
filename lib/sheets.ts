import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

export interface OrderRow {
  "Order ID": string;
  "Date": string;
  "LINE User ID": string;
  "Status": string;
  "Items": string;
  "Subtotal": number;
  "Shipping": number;
  "Total": number;
  "Name": string;
  "Phone": string;
  "Address": string;
  "Updated At": string;
}

function getPrivateKey(): string {
  const raw = process.env.GOOGLE_PRIVATE_KEY || "";
  // Handle all Vercel/env encoding scenarios:
  // 1. Already has real newlines → use as-is
  // 2. Has literal \n (2 chars: backslash + n) → replace with real newline
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
  "Items", "Subtotal", "Shipping", "Total",
  "Name", "Phone", "Address", "Updated At",
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
  name: string;
  phone: string;
  address: string;
  city: string;
  zip: string;
}) {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = await getOrCreateSheet(doc);

  const itemsStr = data.items
    .map((c) => `${c.name} (${c.size}) x${c.qty}`)
    .join(", ");

  const fullAddress = `${data.address}, ${data.city} ${data.zip}`;
  const now = nowBKK();

  await sheet.addRow({
    "Order ID": data.orderId,
    "Date": now,
    "LINE User ID": data.lineUserId,
    "Status": "PENDING",
    "Items": itemsStr,
    "Subtotal": data.sub,
    "Shipping": data.ship,
    "Total": data.total,
    "Name": data.name,
    "Phone": data.phone,
    "Address": fullAddress,
    "Updated At": now,
  });
}

export async function getOrder(orderId: string): Promise<OrderRow | null> {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) return null;
  try { await sheet.loadHeaderRow(); } catch { return null; }

  const rows = await sheet.getRows();
  const row = rows.find((r) => r.get("Order ID") === orderId);
  if (!row) return null;

  return {
    "Order ID": row.get("Order ID"),
    "Date": row.get("Date"),
    "LINE User ID": row.get("LINE User ID"),
    "Status": row.get("Status"),
    "Items": row.get("Items"),
    "Subtotal": Number(row.get("Subtotal")),
    "Shipping": Number(row.get("Shipping")),
    "Total": Number(row.get("Total")),
    "Name": row.get("Name"),
    "Phone": row.get("Phone"),
    "Address": row.get("Address"),
    "Updated At": row.get("Updated At"),
  };
}

export async function updateOrderShipping(
  orderId: string,
  data: { name: string; phone: string; address: string; city: string; zip: string }
): Promise<boolean> {
  const doc = getDoc();
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) return false;

  const rows = await sheet.getRows();
  const row = rows.find((r) => r.get("Order ID") === orderId);
  if (!row) return false;

  const fullAddress = data.city || data.zip
    ? `${data.address}, ${data.city} ${data.zip}`.trim()
    : data.address;

  row.set("Name", data.name);
  row.set("Phone", data.phone);
  row.set("Address", fullAddress);
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
    await sheet.setHeaderRow([
      "Order ID", "Date", "LINE User ID", "Status",
      "Items", "Subtotal", "Shipping", "Total",
      "Name", "Phone", "Address", "Updated At",
    ]);
  }
}

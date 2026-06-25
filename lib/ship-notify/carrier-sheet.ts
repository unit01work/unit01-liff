// Read the carrier's shared Google Sheet. Each dated tab holds one shipping
// round; we extract only the rows that map to a real Shopify order (order cell
// like "#1058"). Influencer / sample rows (INFLU, อินฟลู, "-", blank) are
// skipped — the owner handles those separately.

import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { CARRIER_SHEETS_ID, CARRIER_COL } from "./config";

function carrierKey(): string {
  const b64 = process.env.GOOGLE_PRIVATE_KEY_BASE64 || "";
  if (b64) {
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    return decoded.includes("\\n") ? decoded.split("\\n").join("\n") : decoded;
  }
  const key = process.env.GOOGLE_PRIVATE_KEY || "";
  return key.includes("\\n") ? key.split("\\n").join("\n") : key;
}

function carrierDoc(): GoogleSpreadsheet {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: carrierKey(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return new GoogleSpreadsheet(CARRIER_SHEETS_ID, auth);
}

export interface CarrierDay {
  tabTitle: string; // raw tab title, e.g. "Order 24/6/26"
  dateLabel: string; // normalised "DD/MM" for display, e.g. "24/6"
  day: number;
  month: number;
  year: number; // 4-digit
  sortKey: number; // yyyymmdd for ordering
}

export interface CarrierShipment {
  orderName: string; // "#1058"
  customer: string; // carrier's customer name (display only)
  carrier: string; // "Flash Express"
  trackingNumbers: string[]; // 1+ numbers
  tabTitle: string;
}

// Parse a "d/m/yy" (or d/m/yyyy) date out of a tab title, ignoring the prefix
// word ("Order", "Orders", "Oreder", …). Returns null if no date found.
export function parseTabDate(
  title: string
): { day: number; month: number; year: number } | null {
  const m = title.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return { day, month, year };
}

// List every tab that carries a parseable date, newest first.
export async function listCarrierDays(): Promise<CarrierDay[]> {
  const doc = carrierDoc();
  await doc.loadInfo();
  const days: CarrierDay[] = [];
  for (const s of doc.sheetsByIndex) {
    const d = parseTabDate(s.title);
    if (!d) continue;
    days.push({
      tabTitle: s.title,
      dateLabel: `${d.day}/${d.month}`,
      day: d.day,
      month: d.month,
      year: d.year,
      sortKey: d.year * 10000 + d.month * 100 + d.day,
    });
  }
  days.sort((a, b) => b.sortKey - a.sortKey);
  return days;
}

// A carrier order cell counts as a real order only when it's "#<digits>".
function isRealOrderName(raw: string): boolean {
  return /^#\d+$/.test((raw || "").trim());
}

// Split a tracking cell into one or more numbers. Carriers join multiples with
// commas/spaces: "TH24018VQ4KU1M , TH24018VQ4XA0M".
function splitTracking(raw: string): string[] {
  return (raw || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Read all real-order shipments (with tracking) from one dated tab.
export async function readShipments(tabTitle: string): Promise<CarrierShipment[]> {
  const doc = carrierDoc();
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle[tabTitle];
  if (!sheet) throw new Error(`carrier tab not found: ${tabTitle}`);
  const rows = await sheet.getRows();
  const out: CarrierShipment[] = [];
  for (const r of rows) {
    const orderName = (r.get(CARRIER_COL.orderName) || "").trim();
    if (!isRealOrderName(orderName)) continue;
    const trackingNumbers = splitTracking(r.get(CARRIER_COL.tracking) || "");
    if (trackingNumbers.length === 0) continue; // no tracking yet → skip
    out.push({
      orderName,
      customer: (r.get(CARRIER_COL.customer) || "").trim(),
      carrier: (r.get(CARRIER_COL.carrier) || "").trim() || "Flash Express",
      trackingNumbers,
      tabTitle,
    });
  }
  return out;
}

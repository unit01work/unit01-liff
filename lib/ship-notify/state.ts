// Resend guard — kept on OUR side (the shop's workbook), never written back
// into the carrier's sheet. A dedicated "Ship Notified" tab records every
// order we've already told the customer about, so re-running a day (e.g. when
// late tracking numbers arrive) only sends the new ones.

import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { NOTIFIED_TAB, NOTIFIED_HEADERS, type Channel } from "./config";

function ourKey(): string {
  const b64 = process.env.GOOGLE_PRIVATE_KEY_BASE64 || "";
  if (b64) {
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    return decoded.includes("\\n") ? decoded.split("\\n").join("\n") : decoded;
  }
  const key = process.env.GOOGLE_PRIVATE_KEY || "";
  return key.includes("\\n") ? key.split("\\n").join("\n") : key;
}

function ourDoc(): GoogleSpreadsheet {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: ourKey(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID!, auth);
}

async function getNotifiedTab(doc: GoogleSpreadsheet) {
  let sheet = doc.sheetsByTitle[NOTIFIED_TAB];
  if (!sheet) {
    sheet = await doc.addSheet({
      title: NOTIFIED_TAB,
      headerValues: [...NOTIFIED_HEADERS],
    });
  }
  return sheet;
}

function nowBKK(): string {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Bangkok", hour12: false })
    .replace("T", " ")
    .slice(0, 16);
}

// Set of order names already notified (any channel).
export async function loadNotified(): Promise<Set<string>> {
  const doc = ourDoc();
  await doc.loadInfo();
  const sheet = await getNotifiedTab(doc);
  const rows = await sheet.getRows();
  const set = new Set<string>();
  for (const r of rows) {
    const name = (r.get("Order Name") || "").trim();
    if (name) set.add(name);
  }
  return set;
}

export interface NotifiedEntry {
  orderName: string;
  tracking: string; // joined
  channel: Channel;
  lineUserId?: string;
  dateTab: string;
}

// Append one row per order we just notified.
export async function markNotified(entries: NotifiedEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const doc = ourDoc();
  await doc.loadInfo();
  const sheet = await getNotifiedTab(doc);
  const at = nowBKK();
  await sheet.addRows(
    entries.map((e) => ({
      "Order Name": e.orderName,
      Tracking: e.tracking,
      Channel: e.channel,
      "LINE User ID": e.lineUserId || "",
      "Notified At": at,
      "Date Tab": e.dateTab,
    }))
  );
}

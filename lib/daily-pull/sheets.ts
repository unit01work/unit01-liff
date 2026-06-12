// Self-contained Google Sheets writer for the daily-pull worklist.
// Writes ONE tab per day (e.g. "WL-2026-06-12") into the existing workbook.
// Independent connection so the module stays deletable in one piece and never
// imports the core lib/sheets.ts (which the sales loop owns).

import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import type { WorklistRow } from "./types";
import { WORKLIST_HEADERS, rowToValues } from "./worklist";

function getPrivateKey(): string {
  const b64 = process.env.GOOGLE_PRIVATE_KEY_BASE64 || "";
  if (b64) {
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    return decoded.includes("\\n") ? decoded.split("\\n").join("\n") : decoded;
  }
  const raw = process.env.GOOGLE_PRIVATE_KEY || "";
  return raw.includes("\\n") ? raw.split("\\n").join("\n") : raw;
}

async function getDoc(): Promise<GoogleSpreadsheet> {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: getPrivateKey(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID!, auth);
  await doc.loadInfo();
  return doc;
}

export function tabTitle(dateLabel: string): string {
  return `WL-${dateLabel}`;
}

export function worklistLink(sheetId: number): string {
  return `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEETS_ID}/edit#gid=${sheetId}`;
}

export interface WriteResult {
  title: string;
  sheetId: number;
  link: string;
  rowCount: number;
}

// Write (or fully regenerate) the day's worklist tab. A re-run for the same
// date deletes the old tab and rebuilds it so the sheet always holds exactly
// this round's orders — no duplicates, no leftovers.
export async function writeWorklistTab(
  dateLabel: string,
  rows: WorklistRow[]
): Promise<WriteResult> {
  const doc = await getDoc();
  const title = tabTitle(dateLabel);

  // Reuse the same tab on regen (stable gid -> stable link); wipe it clean
  // first so the day's tab always holds exactly this round's orders.
  let sheet = doc.sheetsByTitle[title];
  if (sheet) {
    await sheet.clear();
    await sheet.setHeaderRow([...WORKLIST_HEADERS]);
  } else {
    sheet = await doc.addSheet({ title, headerValues: [...WORKLIST_HEADERS] });
  }

  if (rows.length > 0) {
    await sheet.addRows(rows.map(rowToValues));
  }

  return {
    title,
    sheetId: sheet.sheetId,
    link: worklistLink(sheet.sheetId),
    rowCount: rows.length,
  };
}

// Read the worklist tab back as plain objects, for reconciliation.
export async function readWorklistTab(
  dateLabel: string
): Promise<Record<string, string>[]> {
  const doc = await getDoc();
  const title = tabTitle(dateLabel);
  const sheet = doc.sheetsByTitle[title];
  if (!sheet) return [];
  const rows = await sheet.getRows();
  return rows.map((r) => {
    const obj: Record<string, string> = {};
    for (const h of WORKLIST_HEADERS) obj[h] = String(r.get(h) ?? "");
    return obj;
  });
}

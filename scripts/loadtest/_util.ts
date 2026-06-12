/**
 * Shared helpers for the load-test harness: raw sheet access (for seeding,
 * verification and cleanup), a concurrency runner, and timing/quota helpers.
 * Import "./_env" BEFORE this module so the test sheet id + creds are in place.
 */
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

function getPrivateKey(): string {
  const b64 = process.env.GOOGLE_PRIVATE_KEY_BASE64 || "";
  if (b64) {
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    return decoded.includes("\\n") ? decoded.split("\\n").join("\n") : decoded;
  }
  const raw = process.env.GOOGLE_PRIVATE_KEY || "";
  return raw.includes("\\n") ? raw.split("\\n").join("\n") : raw;
}

let _doc: GoogleSpreadsheet | null = null;
export async function rawDoc(): Promise<GoogleSpreadsheet> {
  if (_doc) return _doc;
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: getPrivateKey(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID!, auth);
  await doc.loadInfo();
  _doc = doc;
  return doc;
}

export async function tab(title: string): Promise<GoogleSpreadsheetWorksheet> {
  const doc = await rawDoc();
  const s = doc.sheetsByTitle[title];
  if (!s) throw new Error(`Tab "${title}" not found — run 00-clone-sheet.ts first`);
  await s.loadHeaderRow();
  return s;
}

/** Delete every data row of a tab (keeps the header row). */
export async function clearTab(title: string): Promise<void> {
  const s = await tab(title);
  await s.clearRows().catch(() => {});
}

/** Seed the Stock tab with one variant at a controlled Shopify Stock level. */
export async function seedStock(
  rows: { product: string; size: string; variantId: string; stock: number }[]
): Promise<void> {
  const s = await tab("Stock");
  await s.clearRows().catch(() => {});
  if (rows.length === 0) return;
  await s.addRows(
    rows.map((r) => ({
      "Product": r.product,
      "Size": r.size,
      "Variant ID": r.variantId,
      "Shopify Stock": r.stock,
      "Reserved": 0,
      "Available": r.stock,
      "Sold": 0,
      "Last Updated": new Date().toISOString(),
    }))
  );
}

export interface RunStats {
  total: number;
  ok: number;
  failed: number;
  rateLimited: number; // HTTP 429 / quota errors
  errors: string[];
  ms: number;
  perSec: number;
}

/**
 * Fire `n` tasks "simultaneously" (Promise.all — all dispatched in the same
 * tick, so they race), collect success/failure + 429 counts + wall time.
 */
export async function runConcurrent<T>(
  n: number,
  task: (i: number) => Promise<T>
): Promise<{ stats: RunStats; results: PromiseSettledResult<T>[] }> {
  const t0 = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: n }, (_, i) => task(i))
  );
  const ms = Date.now() - t0;

  let ok = 0,
    failed = 0,
    rateLimited = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") ok++;
    else {
      failed++;
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      if (/429|quota|rate limit|RESOURCE_EXHAUSTED/i.test(msg)) rateLimited++;
      if (errors.length < 8) errors.push(msg.slice(0, 160));
    }
  }
  return {
    stats: {
      total: n,
      ok,
      failed,
      rateLimited,
      errors,
      ms,
      perSec: +(n / (ms / 1000)).toFixed(2),
    },
    results,
  };
}

export function banner(title: string): void {
  console.log("\n" + "═".repeat(64));
  console.log("  " + title);
  console.log("═".repeat(64));
}

export function fmtStats(label: string, s: RunStats): string {
  return (
    `${label}: ${s.ok}/${s.total} ok · ${s.failed} failed ` +
    `(${s.rateLimited} rate-limited) · ${s.ms}ms · ${s.perSec} ops/sec`
  );
}

/**
 * Load-test environment bootstrap + PRODUCTION SAFETY GUARD.
 *
 * This module MUST be imported (side-effect) at the very top of every load-test
 * script, before any import of "@/lib/sheets". It:
 *   1. Reads the production GOOGLE_SHEETS_ID from .env.local (WITHOUT injecting it).
 *   2. Loads the service-account credentials from .env.local into process.env.
 *   3. Reads TEST_SHEET_ID from .env.test.local.
 *   4. REFUSES to run if the test sheet id is missing or equals the prod id.
 *   5. Points process.env.GOOGLE_SHEETS_ID at the TEST sheet.
 *
 * Also forces a placeholder LINE token so any accidental LINE push is skipped,
 * and blanks SlipOK / Shopify creds so nothing can hit those externally.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as dotenv from "dotenv";

const ROOT = resolve(__dirname, "../..");

function parseEnvFile(name: string): Record<string, string> {
  try {
    return dotenv.parse(readFileSync(resolve(ROOT, name)));
  } catch {
    return {};
  }
}

const prodEnv = parseEnvFile(".env.local");
const testEnv = parseEnvFile(".env.test.local");

const PROD_SHEET_ID = (prodEnv.GOOGLE_SHEETS_ID || "").trim();
const TEST_SHEET_ID = (testEnv.TEST_SHEET_ID || "").trim();

// ── Load service-account creds (needed to talk to ANY sheet) ──
for (const k of [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_PRIVATE_KEY_BASE64",
]) {
  if (prodEnv[k]) process.env[k] = prodEnv[k];
}

// ── Neutralise every external side-effect channel ──
process.env.LINE_CHANNEL_ACCESS_TOKEN = "YOUR_CHANNEL_ACCESS_TOKEN_HERE";
process.env.SLIPOK_API_KEY = "";
process.env.SLIPOK_BRANCH_ID = "";
process.env.SHOPIFY_ADMIN_API_TOKEN = "";
process.env.SHOPIFY_STORE = "";

// ── SAFETY GUARD ──
if (!TEST_SHEET_ID) {
  console.error(
    "\n⛔️ STOP: TEST_SHEET_ID is not set in .env.test.local.\n" +
      "   Create a fresh blank Google Sheet, share it with the service account\n" +
      `   (${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "the service account"}) as Editor,\n` +
      "   then put its ID in scripts/loadtest/.env.test.local as TEST_SHEET_ID=...\n"
  );
  process.exit(1);
}
if (PROD_SHEET_ID && TEST_SHEET_ID === PROD_SHEET_ID) {
  console.error(
    "\n⛔️ ABORT: TEST_SHEET_ID equals the PRODUCTION GOOGLE_SHEETS_ID.\n" +
      "   The load test refuses to run against the production order sheet.\n"
  );
  process.exit(1);
}

// ── Point all sheet operations at the TEST sheet ──
process.env.GOOGLE_SHEETS_ID = TEST_SHEET_ID;

export const TEST_SHEET = TEST_SHEET_ID;
export const SERVICE_ACCOUNT =
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "(unknown)";

console.log(`[loadtest] target TEST sheet: ${TEST_SHEET_ID}`);
console.log(`[loadtest] service account:   ${SERVICE_ACCOUNT}`);
console.log(`[loadtest] external APIs (LINE/SlipOK/Shopify): DISABLED\n`);

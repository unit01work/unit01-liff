/**
 * Clone the production sheet STRUCTURE (tabs + headers only, NO data) into the
 * test sheet identified by TEST_SHEET_ID. Safe to re-run (idempotent).
 *
 *   npx tsx scripts/loadtest/00-clone-sheet.ts
 */
import "./_env";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

const ORDERS_HEADERS = [
  "Order ID", "Date", "LINE User ID", "Status",
  "Items", "Subtotal", "Shipping Fee", "Total",
  "First Name", "Last Name", "Phone", "Address",
  "Sub-district", "District", "Province", "Postal Code",
  "Updated At", "Transaction Ref", "Paid At",
  "Variant IDs", "Shopify Order ID", "Size Changed", "Address Changed",
  "Sync Status",
];
const STOCK_HEADERS = [
  "Product", "Size", "Variant ID", "Shopify Stock",
  "Reserved", "Available", "Sold", "Last Updated",
];
const STOCK_LOG_HEADERS = [
  "Date", "Type", "Product", "Size", "Variant ID",
  "Change", "Stock After", "Order ID", "Note",
];

function getPrivateKey(): string {
  const b64 = process.env.GOOGLE_PRIVATE_KEY_BASE64 || "";
  if (b64) {
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    return decoded.includes("\\n") ? decoded.split("\\n").join("\n") : decoded;
  }
  const raw = process.env.GOOGLE_PRIVATE_KEY || "";
  return raw.includes("\\n") ? raw.split("\\n").join("\n") : raw;
}

async function ensureTab(
  doc: GoogleSpreadsheet,
  title: string,
  headers: string[]
) {
  let sheet = doc.sheetsByTitle[title];
  if (!sheet) {
    sheet = await doc.addSheet({ title, headerValues: headers });
    console.log(`  + created tab "${title}" with ${headers.length} headers`);
    return;
  }
  try {
    await sheet.loadHeaderRow();
    const existing = sheet.headerValues || [];
    const missing = headers.filter((h) => !existing.includes(h));
    if (missing.length > 0) {
      await sheet.setHeaderRow([...existing, ...missing]);
      console.log(`  ~ tab "${title}" existed, added headers: ${missing.join(", ")}`);
    } else {
      console.log(`  = tab "${title}" already has all headers`);
    }
  } catch {
    await sheet.setHeaderRow(headers);
    console.log(`  ~ tab "${title}" existed (empty), set headers`);
  }
}

async function main() {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: getPrivateKey(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID!, auth);

  try {
    await doc.loadInfo();
  } catch (e) {
    console.error(
      "\n⛔️ Could not open the test sheet. Most likely it is not shared with the\n" +
        `   service account (${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}) as Editor.\n` +
        "   Share it, then re-run.\n\nUnderlying error:",
      e instanceof Error ? e.message : String(e)
    );
    process.exit(1);
  }

  console.log(`Opened test sheet: "${doc.title}"`);
  await ensureTab(doc, "Orders", ORDERS_HEADERS);
  await ensureTab(doc, "Stock", STOCK_HEADERS);
  await ensureTab(doc, "Stock Log", STOCK_LOG_HEADERS);

  // Remove the default "Sheet1" if it is empty and not one of ours.
  const junk = doc.sheetsByTitle["Sheet1"];
  if (junk && !["Orders", "Stock", "Stock Log"].includes(junk.title)) {
    try {
      await junk.delete();
      console.log('  - removed default empty "Sheet1"');
    } catch {
      /* ignore */
    }
  }

  console.log("\n✅ Test sheet structure ready (Orders / Stock / Stock Log).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

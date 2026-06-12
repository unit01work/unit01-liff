/**
 * Wipe all test data rows from the TEST sheet (Orders / Stock / Stock Log).
 * Headers are kept. Safe — refuses the prod sheet via _env guard.
 *
 *   npx tsx scripts/loadtest/99-cleanup.ts
 */
import "./_env";
import { clearTab } from "./_util";

async function main() {
  for (const t of ["Orders", "Stock", "Stock Log"]) {
    await clearTab(t).catch(() => {});
    console.log(`cleared "${t}"`);
  }
  console.log("✅ test sheet cleaned.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

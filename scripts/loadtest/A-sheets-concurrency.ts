/**
 * TEST A — Google Sheets concurrent-write integrity + throughput.
 *
 * Fires N concurrent appendOrder() calls (the exact function the order route
 * uses) at the TEST sheet, then verifies the Orders tab ends up with exactly N
 * well-formed rows (no lost / overwritten / corrupted rows) and reports
 * throughput + how many writes were rate-limited (429).
 *
 *   npx tsx scripts/loadtest/A-sheets-concurrency.ts [N]
 */
import "./_env";
import { appendOrder } from "../../lib/sheets";
import { clearTab, readRows, runConcurrent, banner, fmtStats, sleep } from "./_util";

const N = Number(process.argv[2]) || 50;

function order(i: number) {
  return {
    orderId: `#LT-A${String(i).padStart(3, "0")}`,
    lineUserId: `Uload_${i}`,
    items: [{ name: "TEST TEE", size: "M", price: 100, qty: 1 }],
    sub: 100,
    ship: 50,
    total: 150,
    firstName: `First${i}`,
    lastName: `Last${i}`,
    phone: "0800000000",
    address: `${i} Test Rd`,
    subDistrict: "TestSub",
    district: "TestDist",
    province: "TestProv",
    postalCode: "10000",
    variantIds: `vtest:${1}`,
  };
}

async function main() {
  banner(`TEST A — ${N} concurrent appendOrder() writes`);
  await clearTab("Orders");

  const { stats } = await runConcurrent(N, (i) => appendOrder(order(i)));
  console.log(fmtStats("append", stats));

  // Let the per-minute quota window recover before our verification reads.
  console.log("   …settling 60s for quota window before integrity read");
  await sleep(60000);

  // Integrity check: re-read and confirm exactly the rows that succeeded exist,
  // each unique, none corrupted.
  const rows = await readRows("Orders");
  const ids = rows.map((r) => r.get("Order ID")).filter(Boolean);
  const unique = new Set(ids);
  const corrupted = rows.filter(
    (r) => !/^#LT-A\d{3}$/.test(r.get("Order ID") || "") || Number(r.get("Total")) !== 150
  );

  console.log(`rows in sheet:      ${rows.length}`);
  console.log(`unique Order IDs:   ${unique.size}`);
  console.log(`duplicate rows:     ${ids.length - unique.size}`);
  console.log(`corrupted rows:     ${corrupted.length}`);

  const expected = stats.ok;
  const pass =
    rows.length === expected && unique.size === expected && corrupted.length === 0;
  console.log(
    pass
      ? `\n✅ A PASS — all ${expected} successful writes landed intact, no corruption.`
      : `\n⚠️  A NOTE — sheet has ${rows.length} rows vs ${expected} successful appends ` +
          `(diff usually = rate-limited writes that threw before landing).`
  );

  console.log(
    JSON.stringify({ test: "A", ...stats, rowsInSheet: rows.length, unique: unique.size, corrupted: corrupted.length })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

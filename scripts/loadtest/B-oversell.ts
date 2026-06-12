/**
 * TEST B — Oversell race at stock = 1.
 *
 * Seeds ONE variant with Shopify Stock = 1, then fires N simultaneous buyers.
 *
 *   BASELINE (current production logic): order route calls appendOrder() with
 *   NO stock check → every buyer succeeds → oversell.
 *
 *   FIXED: each buyer calls createOrderGuarded(), which checks live committed
 *   stock and appends inside one locked critical section → at most `stock`
 *   buyers succeed.
 *
 *   npx tsx scripts/loadtest/B-oversell.ts [N] [STOCK]
 */
import "./_env";
import { appendOrder, createOrderGuarded, type ReserveLineItem } from "../../lib/sheets";
import { seedStock, clearTab, readRows, runConcurrent, banner, sleep } from "./_util";

const N = Number(process.argv[2]) || 50;
const STOCK = Number(process.argv[3]) || 1;
const VID = "vrace-LT";

function order(i: number, prefix: string) {
  return {
    orderId: `#LT-${prefix}${String(i).padStart(3, "0")}`,
    lineUserId: `Urace_${i}`,
    items: [{ name: "RACE TEE", size: "M", price: 100, qty: 1 }],
    sub: 100,
    ship: 50,
    total: 150,
    firstName: `Buyer${i}`,
    lastName: "X",
    phone: "0800000000",
    address: `${i} Race Rd`,
    subDistrict: "S",
    district: "D",
    province: "P",
    postalCode: "10000",
    variantIds: `${VID}:1`,
  };
}
const lineItems = (): ReserveLineItem[] => [
  { name: "RACE TEE", size: "M", variantId: VID, qty: 1 },
];

async function countPending(): Promise<number> {
  const rows = await readRows("Orders");
  return rows.filter(
    (r) =>
      (r.get("Status") || "").toUpperCase() === "PENDING" &&
      (r.get("Variant IDs") || "").includes(VID)
  ).length;
}

async function main() {
  banner(`TEST B — oversell: ${N} buyers, stock = ${STOCK}`);

  // ── BASELINE (no stock check, exactly like current route) ──
  await seedStock([{ product: "RACE TEE", size: "M", variantId: VID, stock: STOCK }]);
  await clearTab("Orders");
  const base = await runConcurrent(N, (i) => appendOrder(order(i, "B")));
  console.log("   …settling 60s for quota window before counting");
  await sleep(60000);
  const baseSold = await countPending();
  const baseOversell = Math.max(0, baseSold - STOCK);
  console.log(
    `BASELINE: ${base.stats.ok}/${N} orders created, ${baseSold} reserved for stock ${STOCK} ` +
      `→ OVERSELL = ${baseOversell}  (${base.stats.rateLimited} rate-limited, ${base.stats.ms}ms)`
  );

  // ── FIXED (createOrderGuarded with locked stock check) ──
  console.log("   …settling 60s before fixed phase");
  await sleep(60000);
  await seedStock([{ product: "RACE TEE", size: "M", variantId: VID, stock: STOCK }]);
  await clearTab("Orders");
  const fixed = await runConcurrent(N, async (i) => {
    const res = await createOrderGuarded(order(i, "F"), lineItems());
    if (!res.ok) throw new Error(res.reason); // rejected = "sold out" (expected)
    return res;
  });
  console.log("   …settling 60s for quota window before counting");
  await sleep(60000);
  const fixSold = await countPending();
  const fixOversell = Math.max(0, fixSold - STOCK);
  const rejected = fixed.stats.failed - fixed.stats.rateLimited;
  console.log(
    `FIXED:    ${fixed.stats.ok}/${N} orders created (${rejected} correctly rejected as sold-out), ` +
      `${fixSold} reserved for stock ${STOCK} → OVERSELL = ${fixOversell}  (${fixed.stats.ms}ms)`
  );

  const closed = baseOversell > 0 && fixOversell === 0;
  console.log(
    closed
      ? `\n✅ B PASS — oversell ${baseOversell} → 0. Race closed (in-process).`
      : `\n⚠️  B — baseline oversell ${baseOversell}, fixed oversell ${fixOversell}.`
  );
  console.log(
    JSON.stringify({
      test: "B",
      n: N,
      stock: STOCK,
      baselineSold: baseSold,
      baselineOversell: baseOversell,
      fixedSold: fixSold,
      fixedOversell: fixOversell,
      fixedRejected: rejected,
      baselineMs: base.stats.ms,
      fixedMs: fixed.stats.ms,
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * TEST D — Reserved / Available accounting integrity.
 *
 * Seeds a known mix of PENDING + PAID orders for one variant under concurrent
 * writes, then recomputes Reserved (= PENDING units), Sold (= PAID units) and
 * Available (= Shopify Stock − Reserved) with the SAME logic refreshStockTab
 * uses, and checks the numbers match what was seeded — i.e. no double-count and
 * no lost rows skew the stock math.
 *
 *   npx tsx scripts/loadtest/D-reserved-calc.ts [PENDING] [PAID] [STOCK]
 */
import "./_env";
import { appendOrder, updateOrderStatus } from "../../lib/sheets";
import { seedStock, clearTab, tab, runConcurrent, banner } from "./_util";

const PENDING = Number(process.argv[2]) || 20;
const PAID = Number(process.argv[3]) || 10;
const STOCK = Number(process.argv[4]) || 100;
const VID = "vcalc-LT";

function order(i: number) {
  return {
    orderId: `#LT-D${String(i).padStart(3, "0")}`,
    lineUserId: `Ucalc_${i}`,
    items: [{ name: "CALC TEE", size: "L", price: 100, qty: 1 }],
    sub: 100,
    ship: 50,
    total: 150,
    firstName: `C${i}`,
    lastName: "X",
    phone: "0800000000",
    address: `${i} Calc Rd`,
    subDistrict: "S",
    district: "D",
    province: "P",
    postalCode: "10000",
    variantIds: `${VID}:1`,
  };
}

async function recompute() {
  // Mirror refreshStockTab's per-variant counting (Reserved=PENDING, Sold=PAID).
  const s = await tab("Orders");
  const rows = await s.getRows();
  let reserved = 0;
  let sold = 0;
  for (const row of rows) {
    const status = (row.get("Status") || "").toUpperCase();
    if (!(row.get("Variant IDs") || "").includes(VID)) continue;
    if (status === "PENDING") reserved += 1;
    else if (status === "PAID") sold += 1;
  }
  return { reserved, sold, available: STOCK - reserved };
}

async function main() {
  banner(`TEST D — accounting: ${PENDING} PENDING + ${PAID} PAID, stock ${STOCK}`);
  await seedStock([{ product: "CALC TEE", size: "L", variantId: VID, stock: STOCK }]);
  await clearTab("Orders");

  const total = PENDING + PAID;
  // Concurrently create all orders.
  await runConcurrent(total, (i) => appendOrder(order(i)));
  // Mark the first PAID of them PAID (sequential to avoid the dedup race — that
  // race is covered by Test C; here we only validate counting).
  for (let i = 0; i < PAID; i++) {
    await updateOrderStatus(`#LT-D${String(i).padStart(3, "0")}`, "PAID", `ref-D-${i}`);
  }

  const got = await recompute();
  console.log(`expected → reserved ${PENDING}, sold ${PAID}, available ${STOCK - PENDING}`);
  console.log(`actual   → reserved ${got.reserved}, sold ${got.sold}, available ${got.available}`);

  const pass =
    got.reserved === PENDING && got.sold === PAID && got.available === STOCK - PENDING;
  console.log(
    pass
      ? `\n✅ D PASS — reserved/sold/available all exact, no double-count or drift.`
      : `\n⚠️  D — mismatch (often = rate-limited writes that never landed; check Test A 429 count).`
  );
  console.log(
    JSON.stringify({
      test: "D",
      expectedReserved: PENDING,
      actualReserved: got.reserved,
      expectedSold: PAID,
      actualSold: got.sold,
      expectedAvailable: STOCK - PENDING,
      actualAvailable: got.available,
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

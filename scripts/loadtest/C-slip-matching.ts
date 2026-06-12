/**
 * TEST C — Slip matching under identical amounts + duplicate-ref protection.
 *
 * Part 1 (matching): seed N PENDING orders, each a DIFFERENT user but the SAME
 *   total amount. Fire N concurrent findPendingOrder(user, amount). Every slip
 *   must resolve to its own distinct order — never another user's order.
 *
 * Part 2 (double-claim race): take ONE order, fire 2 concurrent payment claims
 *   that carry the SAME Transaction Ref.
 *     BASELINE: checkDuplicateTransRef() + updateOrderStatus() (read-then-write
 *       gap) → both can win → order paid twice / two orders share a ref.
 *     FIXED: claimAndMarkPaid() (locked) → exactly one wins.
 *
 *   npx tsx scripts/loadtest/C-slip-matching.ts [N]
 */
import "./_env";
import {
  appendOrder,
  findPendingOrder,
  checkDuplicateTransRef,
  updateOrderStatus,
  claimAndMarkPaid,
} from "../../lib/sheets";
import { clearTab, tab, runConcurrent, banner } from "./_util";

const N = Number(process.argv[2]) || 50;
const AMOUNT = 150; // identical for every order

function order(i: number) {
  return {
    orderId: `#LT-C${String(i).padStart(3, "0")}`,
    lineUserId: `Uslip_${i}`,
    items: [{ name: "SLIP TEE", size: "M", price: 100, qty: 1 }],
    sub: 100,
    ship: 50,
    total: AMOUNT,
    firstName: `Pay${i}`,
    lastName: "X",
    phone: "0800000000",
    address: `${i} Slip Rd`,
    subDistrict: "S",
    district: "D",
    province: "P",
    postalCode: "10000",
    variantIds: `vslip:1`,
  };
}

async function seedOrders(n: number) {
  await clearTab("Orders");
  // Sequential append to guarantee all land (Part 1 is about matching, not write race).
  for (let i = 0; i < n; i++) await appendOrder(order(i));
}

async function part1Matching() {
  banner(`TEST C · Part 1 — ${N} identical-amount slips must match distinct orders`);
  await seedOrders(N);

  const { results } = await runConcurrent(N, (i) =>
    findPendingOrder(`Uslip_${i}`, AMOUNT)
  );

  const matched: string[] = [];
  let wrongUser = 0;
  let notFound = 0;
  results.forEach((r, i) => {
    if (r.status !== "fulfilled" || !r.value) {
      notFound++;
      return;
    }
    matched.push(r.value["Order ID"]);
    if (r.value["LINE User ID"] !== `Uslip_${i}`) wrongUser++;
  });
  const distinct = new Set(matched).size;

  console.log(`matched:          ${matched.length}/${N}`);
  console.log(`distinct orders:  ${distinct}`);
  console.log(`wrong-user match: ${wrongUser}`);
  console.log(`not found:        ${notFound}`);

  const pass = matched.length === N && distinct === N && wrongUser === 0;
  console.log(
    pass
      ? `✅ C1 PASS — every slip matched its own order (user+amount key is safe when users differ).`
      : `⚠️  C1 — ${wrongUser} wrong-user, ${notFound} unmatched, ${N - distinct} collisions.`
  );
  return { matched: matched.length, distinct, wrongUser, notFound };
}

/** Simulate the CURRENT production claim flow (non-atomic). */
async function baselineClaim(orderId: string, transRef: string): Promise<boolean> {
  if (await checkDuplicateTransRef(transRef)) return false;
  // <- race window: a second caller passes the same check here before either writes
  return updateOrderStatus(orderId, "PAID", transRef);
}

async function part2DoubleClaim() {
  banner(`TEST C · Part 2 — same Transaction Ref claimed twice (race)`);
  const REF = "LT-DUP-REF-0001";

  // BASELINE: two orders, two concurrent claims with the SAME ref.
  await clearTab("Orders");
  await appendOrder(order(900));
  await appendOrder(order(901));
  const base = await runConcurrent(2, (i) =>
    baselineClaim(`#LT-C${900 + i}`, REF).then((ok) => {
      if (!ok) throw new Error("rejected");
      return ok;
    })
  );
  const baseAccepted = base.stats.ok;
  console.log(
    `BASELINE: ${baseAccepted}/2 claims accepted for the same ref ` +
      `→ ${baseAccepted > 1 ? `DOUBLE-CLAIM (${baseAccepted})` : "single"}`
  );

  // FIXED: claimAndMarkPaid (locked dedup+write).
  await clearTab("Orders");
  await appendOrder(order(900));
  await appendOrder(order(901));
  const fixed = await runConcurrent(2, (i) =>
    claimAndMarkPaid(`#LT-C${900 + i}`, REF).then((r) => {
      if (!r.ok) throw new Error(r.reason);
      return r;
    })
  );
  const fixAccepted = fixed.stats.ok;
  console.log(
    `FIXED:    ${fixAccepted}/2 claims accepted for the same ref ` +
      `→ ${fixAccepted > 1 ? "STILL DOUBLE" : "single (correct)"}`
  );

  const closed = baseAccepted > 1 && fixAccepted === 1;
  console.log(
    closed
      ? `✅ C2 PASS — double-claim ${baseAccepted} → 1. Dedup race closed (in-process).`
      : `⚠️  C2 — baseline accepted ${baseAccepted}, fixed accepted ${fixAccepted}.`
  );
  return { baselineAccepted: baseAccepted, fixedAccepted: fixAccepted };
}

async function main() {
  const p1 = await part1Matching();
  const p2 = await part2DoubleClaim();
  console.log(JSON.stringify({ test: "C", ...p1, ...p2 }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

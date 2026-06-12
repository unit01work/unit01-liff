/**
 * TEST E — REAL ROUTE integration (HTTP), not standalone functions.
 *
 * Drives the actual Next.js `/api/order` endpoint over HTTP — the same code
 * path a real LINE customer hits — so we exercise route wiring + createOrderGuarded
 * + withLock end to end, not just the library function in isolation.
 *
 * Phases:
 *   0. SAFETY PRE-FLIGHT — POST one probe order, then confirm that exact Order
 *      ID landed in the TEST sheet. If it didn't, the server is NOT pointed at
 *      the test sheet → ABORT before firing any load.
 *   A. Lost-order integrity — fire N concurrent POSTs at a well-stocked variant.
 *      Assert: rows in sheet == number of HTTP 200s (every accepted order
 *      actually persisted — no silent clobber/loss), all unique, none corrupt.
 *   B. Oversell — seed stock = 1, fire N concurrent POSTs. Assert exactly one
 *      HTTP 200 (rest 409 out_of_stock) and exactly one PENDING row → oversell 0.
 *
 * Webhook claim race (C) is covered by C-slip-matching.ts against
 * claimPaymentForUser (the function the webhook route now calls); the slip path
 * itself can't be driven over HTTP without a live SlipOK provider.
 *
 *   BASE_URL=http://localhost:3100 npx tsx scripts/loadtest/E-route-http.ts [N]
 */
import "./_env";
import { TEST_SHEET } from "./_env";
import { clearTab, readRows, seedStock, banner, sleep } from "./_util";

const BASE_URL = process.env.BASE_URL || "http://localhost:3100";
const N = Number(process.argv[2]) || 20;

interface PostResult {
  status: number;
  orderId?: string;
  error?: string;
}

function shipping(i: number) {
  return {
    firstName: `First${i}`,
    lastName: `Last${i}`,
    phone: "0800000000",
    address: `${i} Route Rd`,
    postalCode: "10000",
    subDistrict: "S",
    district: "D",
    province: "P",
  };
}

async function postOrder(i: number, variantId: string): Promise<PostResult> {
  try {
    const res = await fetch(`${BASE_URL}/api/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cart: [{ name: "ROUTE TEE", size: "M", price: 100, qty: 1, shopifyVariantId: variantId }],
        shipping: shipping(i),
        lineUserId: `Uroute_${i}`,
      }),
    });
    let body: { orderId?: string; error?: string } = {};
    try { body = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, orderId: body.orderId, error: body.error };
  } catch (e) {
    return { status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function preflight(): Promise<void> {
  banner("TEST E · phase 0 — SAFETY pre-flight (confirm server ↔ TEST sheet)");
  await clearTab("Orders");
  await seedStock([{ product: "ROUTE TEE", size: "M", variantId: "vprobe-LT", stock: 999 }]);
  const probe = await postOrder(9999, "vprobe-LT");
  if (probe.status !== 200 || !probe.orderId) {
    console.error(`⛔️ Pre-flight POST failed (status ${probe.status}, error ${probe.error}). Is the dev server up at ${BASE_URL}?`);
    process.exit(1);
  }
  console.log(`   probe order accepted: ${probe.orderId} (HTTP 200)`);
  await sleep(4000); // let the write settle
  const rows = await readRows("Orders");
  const found = rows.some((r) => r.get("Order ID") === probe.orderId);
  if (!found) {
    console.error(
      `\n⛔️ ABORT: probe order ${probe.orderId} is NOT in the TEST sheet (${TEST_SHEET}).\n` +
        `   The server under test is writing to a DIFFERENT spreadsheet — refusing to\n` +
        `   fire load that might hit production. Restart the server with\n` +
        `   GOOGLE_SHEETS_ID=${TEST_SHEET} and try again.\n`
    );
    process.exit(1);
  }
  console.log(`   ✅ confirmed: server is writing to the TEST sheet. Safe to load.\n`);
}

async function phaseA(): Promise<Record<string, number | boolean>> {
  banner(`TEST E · phase A — ${N} concurrent /api/order POSTs (lost-order integrity)`);
  await clearTab("Orders");
  await seedStock([{ product: "ROUTE TEE", size: "M", variantId: "vbulk-LT", stock: 9999 }]);

  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: N }, (_, i) => postOrder(i, "vbulk-LT")));
  const ms = Date.now() - t0;

  const ok = results.filter((r) => r.status === 200);
  const busy = results.filter((r) => r.status === 503); // order_busy (quota)
  const other = results.filter((r) => r.status !== 200 && r.status !== 503);
  console.log(`HTTP 200 (created): ${ok.length}`);
  console.log(`HTTP 503 (busy):    ${busy.length}`);
  console.log(`other status:       ${other.length}  ${other.map((r) => r.status).join(",")}`);
  console.log(`wall time:          ${ms}ms`);

  console.log("   …settling 60s for quota window before integrity read");
  await sleep(60000);
  const rows = await readRows("Orders");
  const ids = rows.map((r) => r.get("Order ID")).filter(Boolean);
  const unique = new Set(ids);
  const corrupted = rows.filter((r) => Number(r.get("Total")) !== 150);

  console.log(`rows in sheet:      ${rows.length}`);
  console.log(`unique Order IDs:   ${unique.size}`);
  console.log(`corrupted rows:     ${corrupted.length}`);

  // The integrity property: every order the route REPORTED as created (HTTP 200)
  // is actually present exactly once — no silent loss, no clobber overwrite.
  const pass =
    rows.length === ok.length && unique.size === ok.length && corrupted.length === 0;
  console.log(
    pass
      ? `\n✅ E-A PASS — all ${ok.length} accepted orders persisted intact (0 lost, 0 clobbered).`
      : `\n⚠️  E-A — ${ok.length} HTTP 200s vs ${rows.length} rows / ${unique.size} unique.`
  );
  return { httpOk: ok.length, busy: busy.length, rows: rows.length, unique: unique.size, corrupted: corrupted.length, pass };
}

async function phaseB(): Promise<Record<string, number | boolean>> {
  banner(`TEST E · phase B — oversell: ${N} concurrent POSTs, stock = 1`);
  console.log("   …settling 60s before phase B");
  await sleep(60000);
  await clearTab("Orders");
  await seedStock([{ product: "ROUTE TEE", size: "M", variantId: "vone-LT", stock: 1 }]);

  const results = await Promise.all(Array.from({ length: N }, (_, i) => postOrder(i, "vone-LT")));
  const ok = results.filter((r) => r.status === 200).length;
  const soldOut = results.filter((r) => r.status === 409).length;
  const busy = results.filter((r) => r.status === 503).length;
  console.log(`HTTP 200 (created): ${ok}`);
  console.log(`HTTP 409 (out_of_stock): ${soldOut}`);
  console.log(`HTTP 503 (busy):    ${busy}`);

  console.log("   …settling 60s for quota window before counting");
  await sleep(60000);
  const rows = await readRows("Orders");
  const pending = rows.filter(
    (r) => (r.get("Status") || "").toUpperCase() === "PENDING" && (r.get("Variant IDs") || "").includes("vone-LT")
  ).length;
  const oversell = Math.max(0, pending - 1);
  console.log(`PENDING rows for variant: ${pending}  → OVERSELL = ${oversell}`);

  const pass = ok === 1 && oversell === 0;
  console.log(
    pass
      ? `\n✅ E-B PASS — exactly 1 order created through the real route, oversell = 0.`
      : `\n⚠️  E-B — ${ok} created, oversell ${oversell}.`
  );
  return { httpOk: ok, soldOut, busy, pending, oversell, pass };
}

async function main() {
  console.log(`[E] target route: ${BASE_URL}/api/order`);
  await preflight();
  const a = await phaseA();
  const b = await phaseB();
  console.log("\n" + JSON.stringify({ test: "E", n: N, A: a, B: b }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

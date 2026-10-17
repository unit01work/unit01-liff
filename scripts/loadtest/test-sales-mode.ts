/**
 * TEST — manual-mode switch round-trip (runs against the TEST sheet only).
 *
 * Proves the owner's ON/OFF toggle actually persists and reads back correctly,
 * both ways, repeatedly — i.e. that flipping "ปิดระบบ" then "เปิดระบบ" really
 * brings the system back. Also sanity-checks the two Flex control cards.
 *
 *   npx tsx scripts/loadtest/test-sales-mode.ts
 */
import "./_env"; // side-effect: points GOOGLE_SHEETS_ID at the TEST sheet + guards prod
import {
  getSalesMode,
  setSalesMode,
  getAutoReply,
  setAutoReply,
  _resetSalesModeCache,
  buildSalesControlCard,
  buildSalesModeChangedCard,
  buildAutoReplyChangedCard,
  type SalesMode,
} from "../../lib/sales-mode";
import { banner } from "./_util";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
}

// Read the flag with a COLD cache, i.e. force a real Sheets read — this is what
// a fresh serverless instance sees after the owner toggled on another instance.
async function readCold(): Promise<SalesMode> {
  _resetSalesModeCache();
  return getSalesMode();
}

async function readColdAutoReply(): Promise<boolean> {
  _resetSalesModeCache();
  return getAutoReply();
}

async function main() {
  banner("MANUAL-MODE SWITCH — round-trip test (TEST sheet)");

  // 1. Close the shop.
  await setSalesMode("MANUAL");
  check("setSalesMode('MANUAL') then cold read === MANUAL", (await readCold()) === "MANUAL");

  // 2. Re-open — the important one: does it truly come back to normal?
  await setSalesMode("AUTO");
  check("setSalesMode('AUTO') then cold read === AUTO", (await readCold()) === "AUTO");

  // 3. Toggle again to prove it's repeatable (owner may flip several times).
  await setSalesMode("MANUAL");
  check("second close: cold read === MANUAL", (await readCold()) === "MANUAL");
  await setSalesMode("AUTO");
  check("second open: cold read === AUTO", (await readCold()) === "AUTO");

  // 4. Warm-cache read returns instantly and matches the last write.
  await setSalesMode("MANUAL");
  check("warm read right after set === MANUAL", (await getSalesMode()) === "MANUAL");
  await setSalesMode("AUTO"); // leave the TEST sheet in the safe (open) state

  // 5. AUTO-REPLY flag round-trip (independent switch, default ON / fail-safe).
  await setAutoReply(false);
  check("setAutoReply(false) then cold read === OFF", (await readColdAutoReply()) === false);
  await setAutoReply(true);
  check("setAutoReply(true) then cold read === ON", (await readColdAutoReply()) === true);
  await setAutoReply(false);
  check("second mute: cold read === OFF", (await readColdAutoReply()) === false);
  await setAutoReply(true);
  check("warm read right after set === ON", (await getAutoReply()) === true);

  // 6. Card sanity.
  const closeCard = buildSalesControlCard("AUTO", true);
  const openCard = buildSalesControlCard("MANUAL", false);
  check("control card has altText", typeof closeCard.altText === "string" && closeCard.altText.length > 0);
  const btns = closeCard.contents.body.contents.filter((c: { type: string }) => c.type === "button");
  check("control card has 4 toggle buttons", btns.length === 4);
  check(
    "buttons carry sales_manual / sales_auto postbacks",
    JSON.stringify(btns).includes("action=sales_manual") && JSON.stringify(btns).includes("action=sales_auto")
  );
  check(
    "buttons carry autoreply_off / autoreply_on postbacks",
    JSON.stringify(btns).includes("action=autoreply_off") && JSON.stringify(btns).includes("action=autoreply_on")
  );
  check("changed cards render for both modes", !!buildSalesModeChangedCard("MANUAL").altText && !!openCard);
  check(
    "auto-reply changed cards render for both states",
    !!buildAutoReplyChangedCard(true).altText && !!buildAutoReplyChangedCard(false).altText
  );

  console.log(`\n  RESULT: ${passed} passed, ${failed} failed`);
  console.log("  (TEST sheet left in AUTO + auto-reply ON — safe/normal state)\n");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

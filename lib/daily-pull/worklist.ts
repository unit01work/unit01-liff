import type { PulledOrder, WorklistRow } from "./types";
import { ictParts } from "./window";

/**
 * Normalise a phone number to E.164 with an explicit leading "+" and country
 * code, so the packing worklist is unambiguous (e.g. "+66815459999",
 * "+19498137942"). Shopify usually returns E.164 already, but some older orders
 * carry a Thai-local value ("081..."), and either way Google Sheets would coerce
 * a "+66..." string into a number and strip the "+" (and any leading zero). We
 * normalise here and the caller writes the value as text (see rowToValues).
 *
 *   "+66 81 545 9999" → "+66815459999"   (already E.164, just compacted)
 *   "+1 949-813-7942" → "+19498137942"
 *   "0815459999"      → "+66815459999"   (Thai local → add +66, drop the 0)
 *   "66815459999"     → "+66815459999"   (Thai cc without +)
 *   "19498137942"     → "+19498137942"   (US cc 1 + 10 digits, missing +)
 *   "7062316620"      → "+17062316620"   (US/Canada 10-digit national, no cc)
 *   "(706) 231-6620"  → "+17062316620"   (same, with separators)
 *
 * The 10-digit NANP case matters: Shopify returns US shipping phones as a bare
 * national number ("7062316620"). Without this branch it fell through to the
 * generic `"+" + digits` and became "+7062316620" — which reads as country code
 * +7 (Russia/Kazakhstan), an un-shippable number on the packing worklist. Thai
 * numbers never hit this branch (local form starts with 0 → +66 above; E.164
 * form starts with +). A bare 10-digit number with no leading 0 is therefore a
 * North-American national number → prefix +1.
 */
export function toDisplayPhone(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  // Already E.164: keep the "+", strip separators from the rest.
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const d = trimmed.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) return "+" + d.slice(2); // intl prefix → +
  if (d.startsWith("0")) return "+66" + d.slice(1); // Thai local → +66
  if (d.startsWith("66")) return "+" + d; // Thai cc, missing +
  if (d.length === 11 && d.startsWith("1")) return "+" + d; // US cc 1 + 10 digits
  if (d.length === 10) return "+1" + d; // US/Canada 10-digit national → +1
  return "+" + d; // assume it already carries a country code
}

// Map a Shopify order to the 11-column worklist row. Pure — no I/O.
export function toWorklistRow(o: PulledOrder): WorklistRow {
  const paid = ictParts(new Date(o.paidAt));

  const address = [o.address1, o.address2, o.city, o.province]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(" ");

  const uniqueTitles = Array.from(new Set(o.lineItems.map((li) => li.title)));
  const products = uniqueTitles.join(" ; ");

  const qty = o.lineItems.reduce((sum, li) => sum + li.quantity, 0);

  const sizes = o.lineItems
    .map((li) => `${li.size || "-"} x${li.quantity}`)
    .join(" / ");

  return {
    orderName: o.name,
    date: paid.dateLabel,
    time: paid.time,
    country: o.country,
    customer: o.customerName,
    address,
    zip: o.zip,
    phone: toDisplayPhone(o.phone),
    products,
    qty,
    sizes,
  };
}

// Thai header row for the worklist tab (internal packing tool — Thai is fine).
export const WORKLIST_HEADERS = [
  "เลขคำสั่งซื้อ",
  "วันที่",
  "เวลา",
  "ประเทศปลายทาง",
  "ลูกค้า",
  "ที่อยู่จัดส่ง",
  "รหัสไปรษณีย์",
  "เบอร์โทร",
  "ชื่อสินค้า",
  "จำนวนชิ้น",
  "Size",
] as const;

export function rowToValues(r: WorklistRow): Record<string, string | number> {
  return {
    [WORKLIST_HEADERS[0]]: r.orderName,
    [WORKLIST_HEADERS[1]]: r.date,
    // Leading apostrophe forces text, else Sheets coerces "09:38" to a time value
    // and re-renders it as "9:38" (single-digit hour) — keep the zero-pad. The
    // apostrophe itself is not displayed.
    [WORKLIST_HEADERS[2]]: r.time ? `'${r.time}` : "",
    [WORKLIST_HEADERS[3]]: r.country,
    [WORKLIST_HEADERS[4]]: r.customer,
    [WORKLIST_HEADERS[5]]: r.address,
    // Leading apostrophe forces text, else Sheets coerces a numeric ZIP into a
    // number and strips the leading zero (US "02721" → "2721"), so the worklist
    // no longer matches Shopify. Thai 5-digit codes are unaffected but kept as
    // text too. The apostrophe itself is not displayed.
    [WORKLIST_HEADERS[6]]: r.zip ? `'${r.zip}` : "",
    // Leading apostrophe forces Google Sheets (USER_ENTERED) to store the value
    // as text, so the "+" and any leading zero survive instead of being coerced
    // into a number. The apostrophe itself is not displayed.
    [WORKLIST_HEADERS[7]]: r.phone ? `'${r.phone}` : "",
    [WORKLIST_HEADERS[8]]: r.products,
    [WORKLIST_HEADERS[9]]: r.qty,
    [WORKLIST_HEADERS[10]]: r.sizes,
  };
}

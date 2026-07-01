import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import type { CountryCode } from "libphonenumber-js";
import type { PulledOrder, WorklistRow } from "./types";
import { ictParts } from "./window";

/**
 * Normalise a phone number to E.164 with an explicit leading "+" and country
 * code, so the packing worklist is unambiguous (e.g. "+66815459999",
 * "+19498137942", "+525639630778"). Shopify usually returns E.164 already, but
 * some orders carry a bare national number ("081...", "5639630778"), and either
 * way Google Sheets would coerce a "+66..." string into a number and strip the
 * "+" (and any leading zero). We normalise here and the caller writes the value
 * as text (see rowToValues).
 *
 * Parsing is delegated to libphonenumber-js, which knows the numbering plan of
 * every country — so we never have to hardcode dial codes or guess from the
 * digit count again. `countryCode` is Shopify's shippingAddress.countryCodeV2
 * ("TH", "US", "MX", …); it tells the library how to interpret a bare national
 * number. This is the fix for the bug where a 10-digit Mexican number
 * ("5639630778") was guessed as North-American → "+15639630778" instead of
 * "+525639630778": a digit count can't tell MX from US, but the country can.
 * The library also handles country-specific quirks a simple dial-code map
 * cannot (e.g. Italian landlines keep their leading 0 in E.164).
 *
 *   "+66 81 545 9999" (TH) → "+66815459999"  (already E.164, just compacted)
 *   "0815459999"      (TH) → "+66815459999"  (national w/ trunk 0 → +66)
 *   "7062316620"      (US) → "+17062316620"  (bare national → +1)
 *   "5639630778"      (MX) → "+525639630778" (bare national → +52)
 *
 * If the library can't parse the value (garbage/partial data, or a bare
 * national number with no country code to anchor it), we fall back to a
 * best-effort normalisation so the worklist still shows something usable.
 */
export function toDisplayPhone(raw: string, countryCode?: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();

  // A "+"-prefixed value is already international; otherwise hand the library
  // the Shopify country code so a bare national number resolves correctly.
  const cc = trimmed.startsWith("+")
    ? undefined
    : (countryCode?.toUpperCase() as CountryCode | undefined);
  const parsed = parsePhoneNumberFromString(trimmed, cc);
  if (parsed) return parsed.number; // E.164, e.g. "+525639630778"

  // Fallback — library couldn't parse it. Best-effort E.164.
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const d = trimmed.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) return "+" + d.slice(2); // intl prefix → +
  if (d.startsWith("0")) return "+66" + d.replace(/^0+/, ""); // assume Thai local
  if (d.startsWith("66")) return "+" + d; // Thai cc, missing +
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
    phone: toDisplayPhone(o.phone, o.countryCode),
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

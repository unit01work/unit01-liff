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
 *   "19498137942"     → "+19498137942"   (US cc without +)
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
  if (d.length === 11 && d.startsWith("1")) return "+" + d; // US cc, missing +
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
    [WORKLIST_HEADERS[2]]: r.time,
    [WORKLIST_HEADERS[3]]: r.country,
    [WORKLIST_HEADERS[4]]: r.customer,
    [WORKLIST_HEADERS[5]]: r.address,
    [WORKLIST_HEADERS[6]]: r.zip,
    // Leading apostrophe forces Google Sheets (USER_ENTERED) to store the value
    // as text, so the "+" and any leading zero survive instead of being coerced
    // into a number. The apostrophe itself is not displayed.
    [WORKLIST_HEADERS[7]]: r.phone ? `'${r.phone}` : "",
    [WORKLIST_HEADERS[8]]: r.products,
    [WORKLIST_HEADERS[9]]: r.qty,
    [WORKLIST_HEADERS[10]]: r.sizes,
  };
}

import type { PulledOrder, WorklistRow } from "./types";
import { ictParts } from "./window";

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
    phone: o.phone,
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
    [WORKLIST_HEADERS[7]]: r.phone,
    [WORKLIST_HEADERS[8]]: r.products,
    [WORKLIST_HEADERS[9]]: r.qty,
    [WORKLIST_HEADERS[10]]: r.sizes,
  };
}

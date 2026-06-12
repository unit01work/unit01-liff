// Reconcile: after writing the worklist, pull Shopify again for the same window
// and compare order-by-order against what landed in the sheet. Classifies the
// three mismatch types from the spec:
//   1. missing  — in Shopify window but not in the sheet (dropped)
//   2. extra    — in the sheet but not in Shopify window (shouldn't be there)
//   3. fieldDiff — present in both but a key field differs (pulled wrong)

import type { WorklistRow } from "./types";
import { WORKLIST_HEADERS } from "./worklist";

export type MismatchKind = "missing" | "extra" | "fieldDiff";

export interface Mismatch {
  orderName: string;
  kind: MismatchKind;
  detail: string; // Thai, ready for LINE
}

const norm = (s: string) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();

// The fields we treat as load-bearing for "did the right data land?".
function rowFingerprint(r: {
  customer: string;
  address: string;
  zip: string;
  qty: number | string;
  sizes: string;
  products: string;
}): Record<string, string> {
  return {
    customer: norm(String(r.customer)),
    address: norm(String(r.address)),
    zip: norm(String(r.zip)),
    qty: norm(String(r.qty)),
    sizes: norm(String(r.sizes)),
    products: norm(String(r.products)),
  };
}

const FIELD_LABEL_TH: Record<string, string> = {
  customer: "ลูกค้า",
  address: "ที่อยู่",
  zip: "รหัสไปรษณีย์",
  qty: "จำนวนชิ้น",
  sizes: "Size",
  products: "ชื่อสินค้า",
};

// Convert a sheet row (header-keyed strings) into the comparable shape.
function sheetRowToComparable(row: Record<string, string>) {
  return {
    orderName: row[WORKLIST_HEADERS[0]] || "",
    customer: row[WORKLIST_HEADERS[4]] || "",
    address: row[WORKLIST_HEADERS[5]] || "",
    zip: row[WORKLIST_HEADERS[6]] || "",
    products: row[WORKLIST_HEADERS[8]] || "",
    qty: row[WORKLIST_HEADERS[9]] || "",
    sizes: row[WORKLIST_HEADERS[10]] || "",
  };
}

export function reconcile(
  freshRows: WorklistRow[],
  sheetRows: Record<string, string>[]
): Mismatch[] {
  const mismatches: Mismatch[] = [];

  const freshByName = new Map(freshRows.map((r) => [r.orderName, r]));
  const sheetByName = new Map(
    sheetRows.map((r) => {
      const c = sheetRowToComparable(r);
      return [c.orderName, c];
    })
  );

  // 1. missing — Shopify has it, sheet doesn't
  for (const [name] of freshByName) {
    if (!sheetByName.has(name)) {
      mismatches.push({ orderName: name, kind: "missing", detail: `${name} หายจาก worklist (ตกหล่น)` });
    }
  }

  // 2. extra — sheet has it, Shopify window doesn't
  for (const [name] of sheetByName) {
    if (!freshByName.has(name)) {
      mismatches.push({ orderName: name, kind: "extra", detail: `${name} อยู่ใน worklist แต่ไม่อยู่ในกรอบ Shopify (เกินมา)` });
    }
  }

  // 3. fieldDiff — present in both, a field differs
  for (const [name, fresh] of freshByName) {
    const sheet = sheetByName.get(name);
    if (!sheet) continue;
    const fp = rowFingerprint(fresh);
    const sp = rowFingerprint(sheet);
    const diffs = Object.keys(fp).filter((k) => fp[k] !== sp[k]);
    if (diffs.length > 0) {
      const labels = diffs.map((k) => FIELD_LABEL_TH[k] || k).join(", ");
      mismatches.push({ orderName: name, kind: "fieldDiff", detail: `${name} ${labels}ไม่ตรงกับ Shopify` });
    }
  }

  return mismatches;
}

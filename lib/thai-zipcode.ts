/**
 * Thai postal code lookup database.
 *
 * This module is designed to be dynamically imported:
 *   import("@/lib/thai-zipcode").then(({ lookupZip }) => { ... })
 *
 * The database (~200KB compressed) is loaded when this module is first imported.
 * Data source: thai-address-database package (Sellsuki)
 */

export interface ZipResult {
  subDistrict: string; // ตำบล/แขวง in Thai
  district: string; // อำเภอ/เขต in Thai
  province: string; // จังหวัด in Thai
}

// --- Decompress the thai-address-database compact format ---

interface CompactDB {
  lookup: string;
  words: string;
  data: unknown[];
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const db: CompactDB = require("thai-address-database/database/db.json");

function buildZipMap(compactDb: CompactDB): Map<string, ZipResult[]> {
  const lookupTable = compactDb.lookup.split("|");
  const wordsTable = compactDb.words.split("|");
  const map = new Map<string, ZipResult[]>();

  const t = (text: string | number): string => {
    if (typeof text === "number") {
      text = lookupTable[text];
    }
    return text.replace(/[A-Za-z]/g, (m: string) => {
      const ch = m.charCodeAt(0);
      return wordsTable[ch < 97 ? ch - 65 : 26 + ch - 97];
    });
  };

  // Data structure varies:
  // Standard:   [["province", [["amphoe", [["district", zipcode], ...]], ...]], ...]
  // Geographic: [["province", code, [["amphoe", code, [["district", code, zipcode], ...]], ...]], ...]
  for (const provinceEntry of compactDb.data as unknown[][]) {
    // If entry has 3 elements, it's geographic format (province, code, amphoes)
    const geoOffset = provinceEntry.length === 3 ? 1 : 0;
    const provinceName = t(provinceEntry[0] as string | number);
    const amphoes = provinceEntry[1 + geoOffset] as unknown[][];

    for (const amphoeEntry of amphoes) {
      const amphoeName = t(amphoeEntry[0] as string | number);
      const districts = amphoeEntry[1 + geoOffset] as unknown[][];

      for (const districtEntry of districts) {
        const districtName = t(districtEntry[0] as string | number);
        const rawZip = districtEntry[1 + geoOffset] as
          | string
          | number
          | (string | number)[];
        const zipcodes = rawZip instanceof Array ? rawZip : [rawZip];

        for (const zip of zipcodes) {
          const zipStr = String(zip);
          const result: ZipResult = {
            subDistrict: districtName,
            district: amphoeName,
            province: provinceName,
          };

          const existing = map.get(zipStr);
          if (existing) {
            existing.push(result);
          } else {
            map.set(zipStr, [result]);
          }
        }
      }
    }
  }

  return map;
}

const zipMap = buildZipMap(db);

/**
 * Look up a Thai postal code and return matching areas.
 * Returns array of matching areas, or empty array if not found.
 *
 * @example
 * const results = lookupZip("10110");
 * // [{ subDistrict: "คลองจั่น", district: "บางกะปิ", province: "กรุงเทพมหานคร" }, ...]
 */
export function lookupZip(postalCode: string): ZipResult[] {
  return zipMap.get(postalCode) ?? [];
}

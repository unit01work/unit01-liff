// Standard apparel size order, smallest → largest. Shopify returns variants
// in an arbitrary order, so we sort by this to keep S → M → L → XL everywhere
// (LIFF shop size buttons AND the Google Sheets "Stock" tab).
export const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

// Rank a size label for sorting. Unknown labels (e.g. "Free Size", numeric)
// sort after all known sizes; ties preserve their original order (stable sort).
export function sizeRank(size: string): number {
  const norm = (size || "").trim().toUpperCase().replace(/\s|-/g, "");
  // Normalize numeric forms: 2XL → XXL, 3XL → XXXL.
  const alias: Record<string, string> = { "2XL": "XXL", "3XL": "XXXL" };
  const key = alias[norm] || norm;
  const idx = SIZE_ORDER.indexOf(key);
  return idx === -1 ? SIZE_ORDER.length : idx;
}

/** Comparator: sort size labels small → large, unknowns last. */
export function compareSizes(a: string, b: string): number {
  return sizeRank(a) - sizeRank(b);
}

export interface Variant {
  id: string;
  shopifyVariantId: string;
  size: string;
  price: number;
  stock: number;
}

export interface Product {
  id: string;
  shopifyId: string;
  name: string;
  price: number;
  priceMax: number;
  lot: string;
  badge: string | null;
  // Product color from Shopify metafield custom.color_line (e.g. "BLACK").
  // Undefined when not set on the product — UI hides the color label.
  color?: string;
  image: string;
  images: string[];
  variants: Variant[];
  // Optional per-product size guide URL (from Shopify metafield).
  // Not yet wired in the API — link auto-hides while undefined.
  sizeGuideUrl?: string;
}

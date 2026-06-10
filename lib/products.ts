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
  image: string;
  images: string[];
  variants: Variant[];
  // Optional per-product size guide URL (from Shopify metafield).
  // Not yet wired in the API — link auto-hides while undefined.
  sizeGuideUrl?: string;
}

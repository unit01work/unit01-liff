export interface Variant {
  id: string;
  shopifyVariantId: string;
  size: string;
  stock: number;
}

export interface Product {
  id: string;
  shopifyId: string;
  name: string;
  price: number;
  lot: string;
  badge: string | null;
  image: string;
  variants: Variant[];
}

export const PRODUCTS: Product[] = [
  {
    id: "prod-1",
    shopifyId: "gid://shopify/Product/9313698316525",
    name: "01 TRAINING OVERSIZE TEE",
    price: 1800,
    lot: "LOT 04",
    badge: "NEW",
    image:
      "https://cdn.shopify.com/s/files/1/0802/1622/8077/files/Artboard1.png?v=1775482961",
    variants: [
      { id: "v1a", shopifyVariantId: "49705473048813", size: "S", stock: 8 },
      { id: "v1b", shopifyVariantId: "49705473081581", size: "M", stock: 10 },
      { id: "v1c", shopifyVariantId: "49705473114349", size: "L", stock: 10 },
      { id: "v1d", shopifyVariantId: "", size: "XL", stock: 0 },
    ],
  },
  {
    id: "prod-2",
    shopifyId: "gid://shopify/Product/9370581729517",
    name: "01 OUTLINE TEE",
    price: 2200,
    lot: "LOT 05",
    badge: null,
    image:
      "https://cdn.shopify.com/s/files/1/0802/1622/8077/files/2569-05-17_18.10.50.png?v=1779016264",
    variants: [
      { id: "v2a", shopifyVariantId: "49982772248813", size: "S", stock: 100 },
      { id: "v2b", shopifyVariantId: "49982772281581", size: "M", stock: 0 },
      { id: "v2c", shopifyVariantId: "49982772314349", size: "L", stock: 0 },
      { id: "v2d", shopifyVariantId: "", size: "XL", stock: 0 },
    ],
  },
];

import { NextResponse } from "next/server";
import { compareSizes } from "@/lib/products";
import { getCommittedMap } from "@/lib/sheets";

interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  inventory_quantity: number;
}

interface ShopifyImage {
  src: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  tags: string;
  images: ShopifyImage[];
  variants: ShopifyVariant[];
}

export async function GET() {
  try {
    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2026-04/products.json?status=active&fields=id,title,variants,images,tags`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN!,
        },
        next: { revalidate: 300 }, // Cache 5 minutes
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("[products] Shopify API error:", response.status, errText);
      return NextResponse.json({ products: [], error: `Shopify ${response.status}` }, { status: 500 });
    }

    const data = await response.json();

    // Fetch custom.color_line + custom.sizechart metafields for all products
    // in one GraphQL call, then merge by numeric product id. REST products.json
    // can't return metafields inline, so this is a single extra request (not N+1).
    // - color_line: single_line_text → label.
    // - sizechart: file_reference (MediaImage) → resolve to CDN image URL.
    const colorById = new Map<string, string>();
    const sizeGuideById = new Map<string, string>();
    try {
      const gqlRes = await fetch(
        `https://${process.env.SHOPIFY_STORE}/admin/api/2026-04/graphql.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query:
              '{ products(first:100, query:"status:active") { nodes { id color: metafield(namespace:"custom", key:"color_line") { value } sizechart: metafield(namespace:"custom", key:"sizechart") { reference { ... on MediaImage { image { url } } } } } } }',
          }),
          next: { revalidate: 300 },
        }
      );
      if (gqlRes.ok) {
        const gql = await gqlRes.json();
        const nodes = gql?.data?.products?.nodes ?? [];
        for (const n of nodes) {
          const numericId = String(n.id).split("/").pop() || "";
          if (!numericId) continue;
          const colorVal = n?.color?.value;
          if (colorVal) colorById.set(numericId, String(colorVal).trim());
          const guideUrl = n?.sizechart?.reference?.image?.url;
          if (guideUrl) sizeGuideById.set(numericId, String(guideUrl));
        }
      }
    } catch (e) {
      console.error("[products] metafield fetch failed:", e);
      // Non-fatal — products still render without color label / size guide.
    }

    // Units already committed per variant = PENDING (reserved) + PAID (sold),
    // read live from the Orders tab. Shopify inventory_quantity is NOT
    // decremented when an order is paid in this setup, so a size that is fully
    // sold (or reserved) still reports stock > 0 from Shopify even though the
    // order guard would reject it. Subtract committed so effective availability
    // matches the guard (available = Shopify stock − committed) and a sold-out
    // size shows as struck-through/disabled in the shop.
    let committed: Record<string, number> = {};
    try {
      committed = await getCommittedMap();
    } catch (e) {
      console.error("[products] committed-map fetch failed:", e);
      // Non-fatal — fall back to raw Shopify stock (no reservation subtraction).
    }

    const products = (data.products as ShopifyProduct[])
      // Stable order: sort by product id ascending (= creation order).
      // New products always append to the end, existing ones never shift.
      .sort((a, b) => a.id - b.id)
      .filter((p) => p.images?.length > 0) // Must have image
      .map((p) => {
        const tags = p.tags
          ? p.tags.split(", ").map((t: string) => t.toLowerCase().trim())
          : [];

        // Determine badge from tags
        let badge: string | null = null;
        if (tags.includes("new")) badge = "NEW";
        else if (tags.includes("preorder")) badge = "PRE-ORDER";
        else if (tags.includes("sold-out")) badge = "SOLD OUT";

        // Determine lot from tags (e.g. "lot-04")
        const lotTag = tags.find((t: string) => t.startsWith("lot-"));
        const lot = lotTag
          ? `LOT ${lotTag.replace("lot-", "").padStart(2, "0")}`
          : "";

        const variants = p.variants
          .map((v) => {
            const raw = v.inventory_quantity ?? 0;
            const used = committed[String(v.id)] ?? 0;
            return {
              id: String(v.id),
              shopifyVariantId: String(v.id),
              size: v.title,
              price: parseFloat(v.price),
              // Effective availability = Shopify stock − committed (PENDING+PAID),
              // floored at 0. Drives the struck-through/disabled size button.
              stock: Math.max(0, raw - used),
            };
          })
          // Sort sizes S → M → L → XL (unknowns last) so the shop buttons
          // are always in size order, not Shopify's arbitrary variant order.
          .sort((a, b) => compareSizes(a.size, b.size));

        // Base price: lowest variant price
        const prices = variants.map((v) => v.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        return {
          id: String(p.id),
          shopifyId: `gid://shopify/Product/${p.id}`,
          name: p.title,
          price: minPrice,
          priceMax: maxPrice,
          lot,
          badge,
          color: colorById.get(String(p.id)) || undefined,
          sizeGuideUrl: sizeGuideById.get(String(p.id)) || undefined,
          image: p.images[0]?.src || "",
          images: p.images.map((img) => img.src),
          variants,
        };
      })
      // Only show products that have at least 1 variant with stock
      .filter((p) => p.variants.some((v) => v.stock > 0));

    const shippingFee = parseInt(process.env.SHIPPING_FEE || "50", 10);

    return NextResponse.json(
      { products, shippingFee },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      }
    );
  } catch (err) {
    console.error("[products] Error:", err);
    return NextResponse.json({ products: [] }, { status: 500 });
  }
}

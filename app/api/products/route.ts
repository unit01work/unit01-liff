import { NextResponse } from "next/server";

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

    // Fetch custom.color metafield for all products in one GraphQL call,
    // then merge by numeric product id. REST products.json can't return
    // metafields inline, so this is a single extra request (not N+1).
    const colorById = new Map<string, string>();
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
              '{ products(first:100, query:"status:active") { nodes { id metafield(namespace:"custom", key:"color_line") { value } } } }',
          }),
          next: { revalidate: 300 },
        }
      );
      if (gqlRes.ok) {
        const gql = await gqlRes.json();
        const nodes = gql?.data?.products?.nodes ?? [];
        for (const n of nodes) {
          const numericId = String(n.id).split("/").pop() || "";
          const val = n?.metafield?.value;
          if (numericId && val) colorById.set(numericId, String(val).trim());
        }
      }
    } catch (e) {
      console.error("[products] color metafield fetch failed:", e);
      // Non-fatal — products still render without color label.
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

        const variants = p.variants.map((v) => ({
          id: String(v.id),
          shopifyVariantId: String(v.id),
          size: v.title,
          price: parseFloat(v.price),
          stock: v.inventory_quantity ?? 0,
        }));

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

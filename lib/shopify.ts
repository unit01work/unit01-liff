/**
 * Shopify Admin API helper — create Draft Orders.
 */

import type { OrderRow } from "./sheets";

interface ShopifyLineItem {
  variant_id: number;
  quantity: number;
}

interface ShopifyDraftOrder {
  id: number;
  name: string;
  status: string;
  total_price: string;
}

/**
 * Parse variant IDs string from Google Sheets.
 * Format: "shopifyVariantId:qty,shopifyVariantId:qty"
 * Example: "49705473081581:1,49982772248813:2"
 */
function parseLineItems(variantIds: string): ShopifyLineItem[] {
  if (!variantIds) return [];
  return variantIds.split(",").map((item) => {
    const [variantId, qty] = item.trim().split(":");
    return {
      variant_id: parseInt(variantId, 10),
      quantity: parseInt(qty, 10) || 1,
    };
  });
}

/**
 * Create a Shopify Draft Order from order data.
 */
export async function createShopifyDraftOrder(
  order: OrderRow
): Promise<ShopifyDraftOrder> {
  const lineItems = parseLineItems(order["Variant IDs"]);

  if (lineItems.length === 0) {
    throw new Error("No variant IDs found for this order");
  }

  const shippingFee = Number(order["Shipping Fee"]) || 0;

  const body = {
    draft_order: {
      line_items: lineItems,
      shipping_address: {
        first_name: order["First Name"],
        last_name: order["Last Name"],
        address1: order["Address"],
        address2: order["Sub-district"],
        city: order["District"],
        province: order["Province"],
        zip: order["Postal Code"],
        country: "TH",
        phone: order["Phone"],
      },
      shipping_line: {
        title: "Standard Shipping",
        price: shippingFee.toFixed(2),
      },
      note: `Order from LIFF - ${order["Order ID"]}`,
      tags: "liff-order",
    },
  };

  console.log("[shopify] Creating draft order:", JSON.stringify(body));

  const response = await fetch(
    `https://${process.env.SHOPIFY_STORE}/admin/api/2026-04/draft_orders.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("[shopify] Draft Order error:", JSON.stringify(data));
    throw new Error(`Shopify API error: ${response.status}`);
  }

  console.log("[shopify] Draft Order created:", data.draft_order?.id, data.draft_order?.name);

  // Auto-complete: convert Draft Order → real paid Order
  const draftId = data.draft_order.id;
  const completeRes = await fetch(
    `https://${process.env.SHOPIFY_STORE}/admin/api/2026-04/draft_orders/${draftId}/complete.json?payment_pending=false`,
    {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN!,
        "Content-Type": "application/json",
      },
    }
  );

  if (completeRes.ok) {
    const completeData = await completeRes.json();
    const orderId = completeData.draft_order?.order_id;
    console.log("[shopify] Draft Order completed → Order ID:", orderId);
    // Return with the real order_id attached
    data.draft_order.order_id = orderId;
  } else {
    const errText = await completeRes.text();
    console.error("[shopify] Complete Draft Order failed:", completeRes.status, errText);
  }

  return data.draft_order;
}

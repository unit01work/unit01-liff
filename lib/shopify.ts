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
 * Thai → Shopify province name mapping.
 * Shopify requires English province names for Thailand addresses.
 */
const THAI_PROVINCE_MAP: Record<string, string> = {
  "กรุงเทพมหานคร": "Bangkok",
  "กรุงเทพ": "Bangkok",
  "กทม": "Bangkok",
  "กทม.": "Bangkok",
  "สมุทรปราการ": "Samut Prakan",
  "นนทบุรี": "Nonthaburi",
  "ปทุมธานี": "Pathum Thani",
  "พระนครศรีอยุธยา": "Phra Nakhon Si Ayutthaya",
  "อ่างทอง": "Ang Thong",
  "ลพบุรี": "Lopburi",
  "สิงห์บุรี": "Sing Buri",
  "ชัยนาท": "Chai Nat",
  "สระบุรี": "Saraburi",
  "ชลบุรี": "Chon Buri",
  "ระยอง": "Rayong",
  "จันทบุรี": "Chanthaburi",
  "ตราด": "Trat",
  "ฉะเชิงเทรา": "Chachoengsao",
  "ปราจีนบุรี": "Prachin Buri",
  "นครนายก": "Nakhon Nayok",
  "สระแก้ว": "Sa Kaeo",
  "นครราชสีมา": "Nakhon Ratchasima",
  "บุรีรัมย์": "Buri Ram",
  "สุรินทร์": "Surin",
  "ศรีสะเกษ": "Si Sa Ket",
  "อุบลราชธานี": "Ubon Ratchathani",
  "ยโสธร": "Yasothon",
  "ชัยภูมิ": "Chaiyaphum",
  "อำนาจเจริญ": "Amnat Charoen",
  "บึงกาฬ": "Bueng Kan",
  "หนองบัวลำภู": "Nong Bua Lam Phu",
  "ขอนแก่น": "Khon Kaen",
  "อุดรธานี": "Udon Thani",
  "เลย": "Loei",
  "หนองคาย": "Nong Khai",
  "มหาสารคาม": "Maha Sarakham",
  "ร้อยเอ็ด": "Roi Et",
  "กาฬสินธุ์": "Kalasin",
  "สกลนคร": "Sakon Nakhon",
  "นครพนม": "Nakhon Phanom",
  "มุกดาหาร": "Mukdahan",
  "เชียงใหม่": "Chiang Mai",
  "ลำพูน": "Lamphun",
  "ลำปาง": "Lampang",
  "อุตรดิตถ์": "Uttaradit",
  "แพร่": "Phrae",
  "น่าน": "Nan",
  "พะเยา": "Phayao",
  "เชียงราย": "Chiang Rai",
  "แม่ฮ่องสอน": "Mae Hong Son",
  "นครสวรรค์": "Nakhon Sawan",
  "อุทัยธานี": "Uthai Thani",
  "กำแพงเพชร": "Kamphaeng Phet",
  "ตาก": "Tak",
  "สุโขทัย": "Sukhothai",
  "พิษณุโลก": "Phitsanulok",
  "พิจิตร": "Phichit",
  "เพชรบูรณ์": "Phetchabun",
  "ราชบุรี": "Ratchaburi",
  "กาญจนบุรี": "Kanchanaburi",
  "สุพรรณบุรี": "Suphan Buri",
  "นครปฐม": "Nakhon Pathom",
  "สมุทรสาคร": "Samut Sakhon",
  "สมุทรสงคราม": "Samut Songkhram",
  "เพชรบุรี": "Phetchaburi",
  "ประจวบคีรีขันธ์": "Prachuap Khiri Khan",
  "นครศรีธรรมราช": "Nakhon Si Thammarat",
  "กระบี่": "Krabi",
  "พังงา": "Phangnga",
  "ภูเก็ต": "Phuket",
  "สุราษฎร์ธานี": "Surat Thani",
  "ระนอง": "Ranong",
  "ชุมพร": "Chumphon",
  "สงขลา": "Songkhla",
  "สตูล": "Satun",
  "ตรัง": "Trang",
  "พัทลุง": "Phatthalung",
  "ปัตตานี": "Pattani",
  "ยะลา": "Yala",
  "นราธิวาส": "Narathiwat",
};

function toShopifyProvince(thai: string): string {
  return THAI_PROVINCE_MAP[thai.trim()] || thai;
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
        province: toShopifyProvince(order["Province"]),
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

/**
 * Shopify API helper — make authenticated requests.
 */
async function shopifyFetch(path: string, options?: RequestInit) {
  const res = await fetch(
    `https://${process.env.SHOPIFY_STORE}/admin/api/2026-04${path}`,
    {
      ...options,
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN!,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    }
  );
  return res;
}

/**
 * Get Shopify order details (fulfillment status, tracking info).
 */
export async function getShopifyOrderStatus(shopifyOrderId: string) {
  const res = await shopifyFetch(
    `/orders/${shopifyOrderId}.json?fields=id,name,fulfillment_status,fulfillments`
  );
  if (!res.ok) {
    console.error("[shopify] getOrderStatus error:", res.status);
    return null;
  }
  const data = await res.json();
  return data.order;
}

/**
 * Update shipping address on a Shopify order.
 */
export async function updateShopifyShippingAddress(
  shopifyOrderId: string,
  address: {
    firstName: string;
    lastName: string;
    address1: string;
    address2: string;
    city: string;
    province: string;
    zip: string;
    phone: string;
  }
) {
  const res = await shopifyFetch(`/orders/${shopifyOrderId}.json`, {
    method: "PUT",
    body: JSON.stringify({
      order: {
        id: Number(shopifyOrderId),
        shipping_address: {
          first_name: address.firstName,
          last_name: address.lastName,
          address1: address.address1,
          address2: address.address2,
          city: address.city,
          province: toShopifyProvince(address.province),
          zip: address.zip,
          country: "TH",
          phone: address.phone,
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[shopify] updateShipping error:", res.status, errText);
    return false;
  }
  console.log("[shopify] Shipping address updated for order:", shopifyOrderId);
  return true;
}

/**
 * Get product variants with stock from Shopify.
 */
export async function getProductVariants(productId: string) {
  const res = await shopifyFetch(
    `/products/${productId}.json?fields=id,title,variants`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.product;
}

/**
 * Get product size chart metafield.
 */
export async function getProductSizeChart(productId: string): Promise<string | null> {
  const res = await shopifyFetch(
    `/products/${productId}/metafields.json`
  );
  if (!res.ok) return null;
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sizeChart = data.metafields?.find((m: any) =>
    m.key === "sizechart" || m.key === "size_chart" || m.key === "SIZECHART"
  );
  return sizeChart?.value || null;
}

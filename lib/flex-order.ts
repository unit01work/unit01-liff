// LINE Flex Message builder for order confirmation

interface CartItem {
  name: string;
  size: string;
  price: number;
  qty: number;
}

interface ShippingInfo {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  postalCode: string;
  subDistrict: string;
  district: string;
  province: string;
}

const fmt = (n: number) => `฿${n.toLocaleString("en-US")}`;

export function buildOrderFlex({
  orderId,
  cart,
  shipping,
  total,
  ship,
  qrUrl,
  liffUrl,
}: {
  orderId: string;
  cart: CartItem[];
  shipping: ShippingInfo;
  total: number;
  ship: number;
  qrUrl: string;
  liffUrl: string;
}) {
  // Build item rows — no spacers (LINE: spacer must be first or last)
  const itemBoxes: Record<string, unknown>[] = [];
  cart.forEach((c, i) => {
    itemBoxes.push(
      {
        type: "box",
        layout: "horizontal",
        margin: i > 0 ? "md" : "sm",   // top margin instead of spacer
        contents: [
          {
            type: "text",
            text: c.name,
            size: "xs",
            color: "#1A1A1A",
            flex: 4,
            wrap: true,
          },
          {
            type: "text",
            text: fmt(c.price * c.qty),
            size: "xs",
            color: "#1A1A1A",
            flex: 2,
            align: "end",
          },
        ],
      },
      {
        type: "text",
        text: `Size ${c.size}  x${c.qty}`,
        size: "xxs",
        color: "#888888",
        margin: "xs",
      }
    );
  });

  // Encode Thai text for URI
  const contactUri = `https://line.me/R/oaMessage/@086nkudl/?text=${encodeURIComponent("สอบถามเรื่องออเดอร์")}`;
  const editUri = `${liffUrl}?page=edit&order=${orderId.replace("#", "")}`;

  return {
    type: "flex",
    altText: `Order ${orderId} - ${fmt(total)}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "none",
        contents: [
          // ── HEADER ──
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#E5E0DD",
            paddingAll: "lg",
            contents: [
              {
                type: "text",
                text: "ORDER CONFIRMED",
                size: "xxs",
                color: "#555555",
                weight: "bold",
                align: "center",
              },
              {
                type: "text",
                text: orderId,
                size: "md",
                color: "#1A1A1A",
                weight: "bold",
                align: "center",
                margin: "sm",
              },
            ],
          },

          // ── ITEMS ──
          {
            type: "box",
            layout: "vertical",
            paddingAll: "lg",
            contents: [
              {
                type: "text",
                text: "ITEMS",
                size: "xxs",
                color: "#999999",
                weight: "bold",
              },
              ...itemBoxes,
            ],
          },

          { type: "separator", color: "#EBE7E4" },

          // ── SHIPPING + TOTAL ──
          {
            type: "box",
            layout: "vertical",
            paddingAll: "lg",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "Shipping", size: "xs", color: "#888888", flex: 4 },
                  { type: "text", text: fmt(ship), size: "xs", color: "#888888", flex: 2, align: "end" },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                margin: "sm",
                contents: [
                  { type: "text", text: "Total", size: "sm", color: "#1A1A1A", weight: "bold", flex: 4 },
                  { type: "text", text: fmt(total), size: "sm", color: "#1A1A1A", weight: "bold", flex: 2, align: "end" },
                ],
              },
            ],
          },

          { type: "separator", color: "#EBE7E4" },

          // ── SHIP TO ──
          {
            type: "box",
            layout: "vertical",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "SHIP TO", size: "xxs", color: "#999999", weight: "bold" },
              { type: "text", text: `${shipping.firstName} ${shipping.lastName}`, size: "xs", color: "#1A1A1A", margin: "sm", wrap: true },
              { type: "text", text: shipping.address, size: "xxs", color: "#777777", margin: "xs", wrap: true },
              { type: "text", text: `${shipping.subDistrict} ${shipping.district}`, size: "xxs", color: "#777777", margin: "xs", wrap: true },
              { type: "text", text: `${shipping.province} ${shipping.postalCode}`, size: "xxs", color: "#777777", margin: "xs", wrap: true },
              { type: "text", text: `Tel: ${shipping.phone}`, size: "xxs", color: "#777777", margin: "xs" },
            ],
          },

          { type: "separator", color: "#EBE7E4" },

          // ── PROMPTPAY QR ──
          {
            type: "box",
            layout: "vertical",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "PROMPTPAY QR", size: "xxs", color: "#999999", weight: "bold", align: "center" },
              { type: "image", url: qrUrl, size: "lg", aspectRatio: "1:1", aspectMode: "fit", margin: "md" },
              { type: "text", text: fmt(total), size: "lg", color: "#1A1A1A", weight: "bold", align: "center", margin: "sm" },
              { type: "text", text: "Send transfer slip\nto this chat", size: "xxs", color: "#999999", align: "center", margin: "sm", wrap: true },
            ],
          },

          { type: "separator", color: "#EBE7E4" },

          // ── EDIT BUTTON ──
          {
            type: "box",
            layout: "vertical",
            paddingAll: "sm",
            contents: [
              {
                type: "button",
                action: { type: "uri", label: "Edit information", uri: editUri },
                style: "link",
                color: "#C47237",
                height: "sm",
              },
            ],
          },

          { type: "separator", color: "#EBE7E4" },

          // ── CONTACT BUTTON ──
          {
            type: "box",
            layout: "vertical",
            paddingAll: "sm",
            contents: [
              {
                type: "button",
                action: { type: "uri", label: "Contact us", uri: contactUri },
                style: "link",
                color: "#888888",
                height: "sm",
              },
            ],
          },
        ],
      },
    },
  };
}

/**
 * LINE Flex Message builders for Contact Us flow.
 */

const LIFF_URL = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID || "2010192572-jfj8ev6c"}`;

/**
 * Owner alert (Flex) — a verified slip whose money could NOT be matched to any
 * PENDING order (orphan payment). Sent ONLY to the shop owner so they can
 * reconcile/refund. Designed for fast scanning: warning header, then clean
 * label/value rows. Includes the customer's LINE display name + userId so the
 * owner can find/contact them.
 */
export function buildOrphanPaymentFlex(args: {
  amount: number;
  transRef: string;
  userId: string;
  receivedAt: string;
  slipDateTime?: string;
  senderName?: string;
  sendingBank?: string;
  customerName?: string;
}) {
  const { amount, transRef, userId, receivedAt, slipDateTime, senderName, sendingBank, customerName } = args;
  const sender = [senderName, sendingBank].filter(Boolean).join(" / ");

  // One label/value row. `mono` widens the value for long IDs/refs.
  const row = (label: string, value: string, mono = false) => ({
    type: "box",
    layout: "horizontal",
    margin: "md",
    contents: [
      { type: "text", text: label, size: "xs", color: "#999999", flex: 4 },
      {
        type: "text",
        text: value || "-",
        size: "xs",
        color: "#1A1A1A",
        weight: "bold",
        flex: 7,
        wrap: true,
        align: "end",
        ...(mono ? { size: "xxs" } : {}),
      },
    ],
  });

  return {
    type: "flex",
    altText: `⚠️ เงินเข้าไม่พบออเดอร์ ฿${amount} (${customerName || userId.slice(0, 8)})`,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "none",
        contents: [
          // Header (warning)
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#C62828",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "⚠️ เงินเข้า — ไม่พบออเดอร์", size: "sm", color: "#FFFFFF", weight: "bold" },
              { type: "text", text: "SlipOK ผ่าน แต่จับคู่ออเดอร์ PENDING ไม่ได้", size: "xxs", color: "#FFCDD2", margin: "xs", wrap: true },
            ],
          },
          // Amount (prominent)
          {
            type: "box",
            layout: "vertical",
            paddingStart: "lg",
            paddingEnd: "lg",
            paddingTop: "lg",
            contents: [
              { type: "text", text: "ยอดเงิน", size: "xxs", color: "#999999" },
              { type: "text", text: `฿${amount}`, size: "xxl", color: "#C62828", weight: "bold" },
            ],
          },
          // Details
          {
            type: "box",
            layout: "vertical",
            paddingStart: "lg",
            paddingEnd: "lg",
            paddingTop: "md",
            paddingBottom: "lg",
            contents: [
              row("เวลาในสลิป", slipDateTime || "-"),
              row("เวลาที่ระบบรับ", receivedAt),
              { type: "separator", margin: "md", color: "#EBE7E4" },
              row("ลูกค้า (LINE)", customerName || "-"),
              row("LINE userId", userId, true),
              { type: "separator", margin: "md", color: "#EBE7E4" },
              row("คนโอน", sender || "-"),
              row("Ref สลิป", transRef || "-", true),
            ],
          },
          { type: "separator", color: "#EBE7E4" },
          // Footer note
          {
            type: "box",
            layout: "vertical",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "⛔️ อาจหมดอายุไปแล้ว หรือยอดไม่ตรง", size: "xxs", color: "#C62828", wrap: true },
              { type: "text", text: "ตรวจสอบ/ติดต่อลูกค้า/คืนเงินด้วยตนเอง", size: "xxs", color: "#777777", margin: "xs", wrap: true },
              { type: "text", text: 'บันทึกไว้ในแท็บ "Orphan Payments" แล้ว', size: "xxs", color: "#AAAAAA", margin: "xs", wrap: true },
            ],
          },
        ],
      },
    },
  };
}

/**
 * Contact Us welcome menu — "How can we help?" with 4 options.
 */
export function buildContactFlex(
  orderId: string,
  locks: { addressLocked?: boolean; sizeLocked?: boolean } = {}
) {
  const cleanId = orderId.replace("#", "");
  const displayId = orderId.startsWith("#") ? orderId : `#${orderId}`;
  const editUri = `${LIFF_URL}?page=edit&order=${cleanId}`;
  const { addressLocked = false, sizeLocked = false } = locks;

  return {
    type: "flex",
    altText: `Order Support ${displayId}`,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "none",
        contents: [
          // Header
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#E5E0DD",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "ORDER SUPPORT", size: "xxs", color: "#555555", weight: "bold" },
              { type: "text", text: displayId, size: "sm", color: "#1A1A1A", weight: "bold", margin: "xs" },
            ],
          },
          // Body
          {
            type: "box",
            layout: "vertical",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "How can we help?", size: "sm", color: "#1A1A1A", weight: "bold" },
              { type: "text", text: "Select an option below", size: "xxs", color: "#999999", margin: "xs" },
            ],
          },
          { type: "separator", color: "#EBE7E4" },
          // Option 1: Edit shipping address
          ...(addressLocked ? [{
            type: "box",
            layout: "horizontal",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "[ 1 ]", size: "xs", color: "#C4BFBB", weight: "bold", flex: 0 },
              { type: "text", text: "Edit shipping address", size: "xs", color: "#C4BFBB", weight: "bold", margin: "lg", flex: 1 },
              { type: "text", text: "LOCKED", size: "xxs", color: "#C4BFBB", flex: 0, align: "end" },
            ],
          }] : [{
            type: "box",
            layout: "horizontal",
            paddingAll: "lg",
            action: { type: "uri", uri: editUri },
            contents: [
              { type: "text", text: "[ 1 ]", size: "xs", color: "#1A1A1A", weight: "bold", flex: 0 },
              { type: "text", text: "Edit shipping address", size: "xs", color: "#1A1A1A", weight: "bold", margin: "lg", flex: 1 },
              { type: "text", text: "›", size: "sm", color: "#C4BFBB", flex: 0, align: "end" },
            ],
          }]),
          { type: "separator", color: "#EBE7E4" },
          // Option 2: Change size
          ...(sizeLocked ? [{
            type: "box",
            layout: "horizontal",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "[ 2 ]", size: "xs", color: "#C4BFBB", weight: "bold", flex: 0 },
              { type: "text", text: "Change size", size: "xs", color: "#C4BFBB", weight: "bold", margin: "lg", flex: 1 },
              { type: "text", text: "LOCKED", size: "xxs", color: "#C4BFBB", flex: 0, align: "end" },
            ],
          }] : [{
            type: "box",
            layout: "horizontal",
            paddingAll: "lg",
            action: { type: "postback", data: `action=change_size&orderId=${cleanId}`, displayText: "Change size" },
            contents: [
              { type: "text", text: "[ 2 ]", size: "xs", color: "#1A1A1A", weight: "bold", flex: 0 },
              { type: "text", text: "Change size", size: "xs", color: "#1A1A1A", weight: "bold", margin: "lg", flex: 1 },
              { type: "text", text: "›", size: "sm", color: "#C4BFBB", flex: 0, align: "end" },
            ],
          }]),
          { type: "separator", color: "#EBE7E4" },
          // Option 3: Track my order (always available)
          {
            type: "box",
            layout: "horizontal",
            paddingAll: "lg",
            action: { type: "postback", data: `action=track&orderId=${cleanId}`, displayText: "Track my order" },
            contents: [
              { type: "text", text: "[ 3 ]", size: "xs", color: "#1A1A1A", weight: "bold", flex: 0 },
              { type: "text", text: "Track my order", size: "xs", color: "#1A1A1A", weight: "bold", margin: "lg", flex: 1 },
              { type: "text", text: "›", size: "sm", color: "#C4BFBB", flex: 0, align: "end" },
            ],
          },
          { type: "separator", color: "#EBE7E4" },
          // Option 4: Chat with team (always available)
          {
            type: "box",
            layout: "horizontal",
            paddingAll: "lg",
            action: { type: "postback", data: `action=chat_team&orderId=${cleanId}`, displayText: "Chat with team" },
            contents: [
              { type: "text", text: "[ 4 ]", size: "xs", color: "#1A1A1A", weight: "bold", flex: 0 },
              { type: "text", text: "Chat with team", size: "xs", color: "#1A1A1A", weight: "bold", margin: "lg", flex: 1 },
              { type: "text", text: "›", size: "sm", color: "#C4BFBB", flex: 0, align: "end" },
            ],
          },
        ],
      },
    },
  };
}

/**
 * Contact Us menu from Rich Menu — no order ID in header.
 * Options 1-3 use postback without orderId; option 4 is chat_team.
 */
export function buildContactMenuNoOrder() {
  return {
    type: "flex",
    altText: "Order Support",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "none",
        contents: [
          // Header
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#E5E0DD",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "ORDER SUPPORT", size: "xxs", color: "#555555", weight: "bold" },
            ],
          },
          // Body
          {
            type: "box",
            layout: "vertical",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "How can we help?", size: "sm", color: "#1A1A1A", weight: "bold" },
              { type: "text", text: "Select an option below", size: "xxs", color: "#999999", margin: "xs" },
            ],
          },
          { type: "separator", color: "#EBE7E4" },
          // Option 1: Edit shipping address
          {
            type: "box",
            layout: "horizontal",
            paddingAll: "lg",
            action: { type: "postback", data: "action=edit_address_menu", displayText: "Edit shipping address" },
            contents: [
              { type: "text", text: "[ 1 ]", size: "xs", color: "#1A1A1A", weight: "bold", flex: 0 },
              { type: "text", text: "Edit shipping address", size: "xs", color: "#1A1A1A", weight: "bold", margin: "lg", flex: 1 },
              { type: "text", text: "›", size: "sm", color: "#C4BFBB", flex: 0, align: "end" },
            ],
          },
          { type: "separator", color: "#EBE7E4" },
          // Option 2: Change size
          {
            type: "box",
            layout: "horizontal",
            paddingAll: "lg",
            action: { type: "postback", data: "action=change_size_menu", displayText: "Change size" },
            contents: [
              { type: "text", text: "[ 2 ]", size: "xs", color: "#1A1A1A", weight: "bold", flex: 0 },
              { type: "text", text: "Change size", size: "xs", color: "#1A1A1A", weight: "bold", margin: "lg", flex: 1 },
              { type: "text", text: "›", size: "sm", color: "#C4BFBB", flex: 0, align: "end" },
            ],
          },
          { type: "separator", color: "#EBE7E4" },
          // Option 3: Track my order
          {
            type: "box",
            layout: "horizontal",
            paddingAll: "lg",
            action: { type: "postback", data: "action=track_menu", displayText: "Track my order" },
            contents: [
              { type: "text", text: "[ 3 ]", size: "xs", color: "#1A1A1A", weight: "bold", flex: 0 },
              { type: "text", text: "Track my order", size: "xs", color: "#1A1A1A", weight: "bold", margin: "lg", flex: 1 },
              { type: "text", text: "›", size: "sm", color: "#C4BFBB", flex: 0, align: "end" },
            ],
          },
          { type: "separator", color: "#EBE7E4" },
          // Option 4: Chat with team
          {
            type: "box",
            layout: "horizontal",
            paddingAll: "lg",
            action: { type: "postback", data: "action=chat_team", displayText: "Chat with team" },
            contents: [
              { type: "text", text: "[ 4 ]", size: "xs", color: "#1A1A1A", weight: "bold", flex: 0 },
              { type: "text", text: "Chat with team", size: "xs", color: "#1A1A1A", weight: "bold", margin: "lg", flex: 1 },
              { type: "text", text: "›", size: "sm", color: "#C4BFBB", flex: 0, align: "end" },
            ],
          },
        ],
      },
    },
  };
}

/**
 * Select Order Flex — when user has multiple active orders, let them choose.
 * nextAction maps back to the original action: edit_address, change_size, track
 */
export function buildSelectOrderFlex(
  orders: { orderId: string; items: string; total: number }[],
  nextAction: string
) {
  const orderBoxes = orders.flatMap((order, idx) => {
    const displayId = order.orderId.startsWith("#") ? order.orderId : `#${order.orderId}`;
    const cleanId = order.orderId.replace("#", "");
    const box = {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      action: {
        type: "postback",
        data: `action=select_order&orderId=${cleanId}&nextAction=${nextAction}`,
        displayText: displayId,
      },
      contents: [
        { type: "text", text: displayId, size: "xs", color: "#1A1A1A", weight: "bold" },
        {
          type: "text",
          text: `${order.items} — ฿${order.total.toLocaleString()}`,
          size: "xxs",
          color: "#999999",
          margin: "xs",
          wrap: true,
        },
      ],
    };
    // Add separator between orders
    if (idx < orders.length - 1) {
      return [box, { type: "separator", color: "#EBE7E4" }];
    }
    return [box];
  });

  return {
    type: "flex",
    altText: "Select Order",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "none",
        contents: [
          // Header
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#E5E0DD",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "SELECT ORDER", size: "xxs", color: "#555555", weight: "bold" },
            ],
          },
          // Body
          {
            type: "box",
            layout: "vertical",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "Select which order:", size: "sm", color: "#1A1A1A", weight: "bold" },
            ],
          },
          { type: "separator", color: "#EBE7E4" },
          // Order list
          ...orderBoxes,
        ],
      },
    },
  };
}

/**
 * Change Size selection Flex — shows available sizes as buttons.
 */
export function buildChangeSizeFlex({
  orderId,
  productName,
  currentSize,
  availableSizes,
  oldVariantId = "",
}: {
  orderId: string;
  productName: string;
  currentSize: string;
  availableSizes: { size: string; variantId: string }[];
  oldVariantId?: string;
}) {
  const cleanId = orderId.replace("#", "");
  const displayId = orderId.startsWith("#") ? orderId : `#${orderId}`;

  const sizeButtons = availableSizes.map((s) => ({
    type: "button",
    action: {
      type: "postback",
      label: s.size,
      // `old` tells the commit handler WHICH line item to swap (multi-item safe).
      data: `action=select_size&orderId=${cleanId}&size=${s.size}&variantId=${s.variantId}&old=${oldVariantId}`,
      displayText: `Size ${s.size}`,
    },
    style: "primary",
    color: "#1A1A1A",
    height: "sm",
    flex: 1,
  }));

  return {
    type: "flex",
    altText: `Change Size ${displayId}`,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "none",
        contents: [
          // Header
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#E5E0DD",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "CHANGE SIZE", size: "xxs", color: "#555555", weight: "bold" },
              { type: "text", text: displayId, size: "sm", color: "#1A1A1A", weight: "bold", margin: "xs" },
            ],
          },
          // Body
          {
            type: "box",
            layout: "vertical",
            paddingAll: "lg",
            contents: [
              { type: "text", text: productName, size: "xs", color: "#1A1A1A", weight: "bold" },
              { type: "text", text: `Current: Size ${currentSize}`, size: "xxs", color: "#999999", margin: "xs" },
              { type: "text", text: "SELECT NEW SIZE", size: "xxs", color: "#999999", weight: "bold", margin: "lg" },
              // Size buttons row
              {
                type: "box",
                layout: "horizontal",
                margin: "md",
                spacing: "md",
                contents: sizeButtons.length > 0
                  ? sizeButtons
                  : [{ type: "text", text: "No sizes available", size: "xs", color: "#999999" }],
              },
              // Warning
              {
                type: "box",
                layout: "vertical",
                margin: "lg",
                paddingTop: "lg",
                borderWidth: "light",
                borderColor: "#EBE7E4",
                contents: [
                  {
                    type: "text",
                    text: "You can change size once only.\nPlease check size guide carefully.",
                    size: "xxs",
                    color: "#C47237",
                    align: "center",
                    wrap: true,
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  };
}

/**
 * Pick-an-item Flex — shown FIRST when an order has 2+ line items, so the
 * customer chooses WHICH item to resize before seeing the size buttons. Each
 * button carries that item's variant id as `old` so the next step targets the
 * right line item. Single-item orders skip this and go straight to the sizes.
 */
export function buildPickItemFlex({
  orderId,
  items,
}: {
  orderId: string;
  items: { product: string; size: string; variantId: string; qty: number }[];
}) {
  const cleanId = orderId.replace("#", "");
  const displayId = orderId.startsWith("#") ? orderId : `#${orderId}`;

  // Standard LINE buttons — same look/size as the original size-picker card.
  const itemButtons = items.map((it) => ({
    type: "button",
    action: {
      type: "postback",
      label: `${it.size} · ${it.product}`.slice(0, 40),
      data: `action=change_size_item&orderId=${cleanId}&old=${it.variantId}`,
      displayText: `Change ${it.product} (${it.size})`,
    },
    style: "primary",
    color: "#1A1A1A",
    height: "sm",
    margin: "sm",
  }));

  return {
    type: "flex",
    altText: `Change Size ${displayId}`,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "none",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#E5E0DD",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "CHANGE SIZE", size: "xxs", color: "#555555", weight: "bold" },
              { type: "text", text: displayId, size: "sm", color: "#1A1A1A", weight: "bold", margin: "xs" },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            paddingAll: "lg",
            contents: [
              { type: "text", text: "SELECT ITEM", size: "xxs", color: "#999999", weight: "bold" },
              ...itemButtons,
            ],
          },
        ],
      },
    },
  };
}

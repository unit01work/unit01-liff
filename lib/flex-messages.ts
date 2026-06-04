/**
 * LINE Flex Message builders for Contact Us flow.
 */

const LIFF_URL = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID || "2010192572-jfj8ev6c"}`;

/**
 * Contact Us welcome menu — "How can we help?" with 4 options.
 */
export function buildContactFlex(orderId: string, locked = false) {
  const cleanId = orderId.replace("#", "");
  const displayId = orderId.startsWith("#") ? orderId : `#${orderId}`;
  const editUri = `${LIFF_URL}?page=edit&order=${cleanId}`;

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
          ...(locked ? [{
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
          ...(locked ? [{
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
              { type: "text", text: "[ 4 ]", size: "xs", color: "#999999", weight: "bold", flex: 0 },
              { type: "text", text: "Chat with team", size: "xs", color: "#999999", weight: "bold", margin: "lg", flex: 1 },
              { type: "text", text: "›", size: "sm", color: "#C4BFBB", flex: 0, align: "end" },
            ],
          },
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
}: {
  orderId: string;
  productName: string;
  currentSize: string;
  availableSizes: { size: string; variantId: string }[];
}) {
  const cleanId = orderId.replace("#", "");
  const displayId = orderId.startsWith("#") ? orderId : `#${orderId}`;

  const sizeButtons = availableSizes.map((s) => ({
    type: "button",
    action: {
      type: "postback",
      label: s.size,
      data: `action=select_size&orderId=${cleanId}&size=${s.size}&variantId=${s.variantId}`,
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

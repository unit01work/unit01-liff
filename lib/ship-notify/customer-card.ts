// The customer-facing "order shipped" Flex card (UNIT-01, light variant, kilo).
// Baked from design_handoff_line_flex_order_shipped/unit01-order-shipped.final.flex.json
// (the approved size/spacing) PLUS the approved per-number tap-to-copy: each
// tracking number is its own tappable line that copies ONLY that number.
//
// Kept as a programmatic builder (not a static JSON file) so we can splice in a
// variable number of tracking lines per order.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CustomerCardData {
  orderNumber: string; // "#1058"
  productName: string; // "PROTOTYPE-01 TEE x1"
  carrier: string; // "Flash Express"
  trackingNumbers: string[]; // ["TH67018VQ4HU0E0", ...]
}

// Barcode bar pattern from the design: [widthPx, filled?]. Filled bars are
// black, gaps are transparent. 21 segments.
const BARCODE: [number, boolean][] = [
  [3, true], [2, false], [2, true], [3, false], [4, true], [2, false],
  [2, true], [3, false], [3, true], [2, false], [4, true], [2, false],
  [2, true], [3, false], [3, true], [2, false], [4, true], [2, false],
  [2, true], [3, false], [3, true],
];

function barcodeBox(): any {
  return {
    type: "box",
    layout: "horizontal",
    height: "20px",
    spacing: "none",
    contents: BARCODE.map(([w, filled]) => ({
      type: "box",
      layout: "vertical",
      width: `${w}px`,
      ...(filled ? { backgroundColor: "#000000" } : {}),
      contents: [],
    })),
  };
}

// Small "copy" icon drawn from two overlapping squares (on-brand, renders
// identically everywhere). The whole icon box carries the clipboard action so a
// tap copies ONLY this number. A roomy paddingAll keeps the tap target usable
// even though the glyph is small.
function copyIcon(tn: string): any {
  return {
    type: "box",
    layout: "vertical",
    width: "24px",
    height: "24px",
    flex: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingAll: "3px",
    action: { type: "clipboard", label: "คัดลอก", clipboardText: tn },
    contents: [
      {
        type: "box",
        layout: "vertical",
        width: "16px",
        height: "16px",
        contents: [
          // back square (top-right)
          {
            type: "box",
            layout: "vertical",
            position: "absolute",
            offsetTop: "0px",
            offsetEnd: "0px",
            width: "10px",
            height: "10px",
            borderWidth: "1px",
            borderColor: "#9A938D",
            cornerRadius: "1px",
            contents: [],
          },
          // front square (bottom-left), white fill → reads as a stacked sheet
          {
            type: "box",
            layout: "vertical",
            position: "absolute",
            offsetBottom: "0px",
            offsetStart: "0px",
            width: "10px",
            height: "10px",
            borderWidth: "1px",
            borderColor: "#000000",
            cornerRadius: "1px",
            backgroundColor: "#FFFFFF",
            contents: [],
          },
        ],
      },
    ],
  };
}

// One tracking row: bold number on the left, small copy icon on the right.
function trackingRow(tn: string, first: boolean): any {
  return {
    type: "box",
    layout: "horizontal",
    alignItems: "center",
    spacing: "sm",
    margin: first ? "lg" : "sm",
    contents: [
      {
        type: "text",
        text: tn,
        size: "sm",
        weight: "bold",
        color: "#000000",
        wrap: true,
        flex: 5,
        gravity: "center",
        lineSpacing: "8px",
      },
      copyIcon(tn),
    ],
  };
}

export function buildCustomerShippedCard(data: CustomerCardData): any {
  const { orderNumber, productName, carrier, trackingNumbers } = data;

  const numberLines = trackingNumbers.map((tn, i) => trackingRow(tn, i === 0));
  const copyHint =
    trackingNumbers.length > 1
      ? "แตะไอคอนเพื่อคัดลอกเลขที่ต้องการ"
      : "แตะไอคอนเพื่อคัดลอกเลขพัสดุ";

  const altText = `UNIT-01 · ออเดอร์ ${orderNumber} จัดส่งแล้ว — เลขพัสดุ ${trackingNumbers.join(
    ", "
  )} (${carrier})`;

  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      size: "kilo",
      styles: {
        hero: { backgroundColor: "#000000" },
        body: { backgroundColor: "#FFFFFF" },
        footer: { backgroundColor: "#FFFFFF" },
      },
      hero: {
        type: "box",
        layout: "vertical",
        height: "6px",
        paddingAll: "0px",
        contents: [],
        background: {
          type: "linearGradient",
          angle: "90deg",
          startColor: "#3A232B",
          centerColor: "#C47237",
          centerPosition: "55%",
          endColor: "#E8AC4B",
        },
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FFFFFF",
        paddingAll: "20px",
        spacing: "none",
        contents: [
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  { type: "text", text: "ORDER", size: "xxs", color: "#9A938D", flex: 2 },
                  {
                    type: "text",
                    text: orderNumber,
                    size: "xxs",
                    color: "#000000",
                    align: "end",
                    weight: "bold",
                    flex: 5,
                    wrap: true,
                  },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  { type: "text", text: "ITEM", size: "xxs", color: "#9A938D", flex: 2 },
                  {
                    type: "text",
                    text: productName,
                    size: "xxs",
                    color: "#3A3A3A",
                    align: "end",
                    flex: 5,
                    wrap: true,
                  },
                ],
              },
            ],
          },
          { type: "separator", margin: "lg", color: "#E2DCD7" },
          {
            type: "box",
            layout: "vertical",
            margin: "xl",
            spacing: "md",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                spacing: "md",
                contents: [
                  {
                    type: "text",
                    text: "เลขพัสดุ · TRACKING NO.",
                    size: "xxs",
                    color: "#9A938D",
                    flex: 1,
                    gravity: "center",
                  },
                  {
                    type: "text",
                    text: carrier,
                    size: "xxs",
                    color: "#C47237",
                    align: "end",
                    flex: 0,
                    gravity: "center",
                  },
                ],
              },
              // per-number tap-to-copy lines
              ...numberLines,
              {
                type: "text",
                text: copyHint,
                size: "xxs",
                color: "#9A938D",
                margin: "md",
                wrap: true,
              },
            ],
          },
          {
            type: "text",
            text: "[ ][ ][ ][ ][ ][ ][ ][ ][ ][ ][ ][ ]",
            size: "xxs",
            color: "#D8D2CD",
            align: "center",
            margin: "lg",
            wrap: false,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FFFFFF",
        paddingStart: "20px",
        paddingEnd: "20px",
        paddingTop: "4px",
        paddingBottom: "18px",
        spacing: "sm",
        contents: [
          barcodeBox(),
          {
            type: "box",
            layout: "horizontal",
            alignItems: "center",
            contents: [
              {
                type: "text",
                text: `SKU.${orderNumber}`,
                size: "xxs",
                color: "#9A938D",
                flex: 1,
                gravity: "center",
              },
              { type: "text", text: "01", size: "xxs", color: "#9A938D", flex: 0, gravity: "center" },
              {
                type: "box",
                layout: "vertical",
                width: "15px",
                height: "15px",
                flex: 0,
                margin: "sm",
                borderWidth: "1px",
                borderColor: "#C9C3BE",
                justifyContent: "flex-end",
                alignItems: "flex-end",
                paddingAll: "2px",
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    width: "5px",
                    height: "5px",
                    backgroundColor: "#9A938D",
                    contents: [],
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

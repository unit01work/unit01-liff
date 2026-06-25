// Admin-facing Flex cards for the ship-notify flow:
//   1) day picker  — buttons, one per carrier date tab that has pending orders
//   2) confirm card — per-order plan + [ยืนยันส่ง] / [ยกเลิก]
// All postback data is owner-gated in the webhook; these builders are pure.

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Channel } from "./config";
import type { ResolvedShipment } from "./join";

const ACCENT = "#C47237";
const MUTE = "#9A938D";
const INK = "#000000";

export interface DayOption {
  tabTitle: string;
  dateLabel: string; // "24/6"
  pending: number; // orders not yet notified
  total: number; // all real-order shipments in the tab
}

// ── 1) day picker ────────────────────────────────────────────────────────────
export function buildDayPicker(days: DayOption[]): any {
  const withPending = days.filter((d) => d.pending > 0);

  if (withPending.length === 0) {
    return {
      type: "flex",
      altText: "ไม่มีวันที่ต้องแจ้งส่ง",
      contents: {
        type: "bubble",
        size: "kilo",
        body: {
          type: "box",
          layout: "vertical",
          paddingAll: "20px",
          contents: [
            { type: "text", text: "แจ้งส่งพัสดุ", size: "sm", weight: "bold", color: INK },
            {
              type: "text",
              text: "ตอนนี้ไม่มีออเดอร์ที่รอแจ้ง (ทุกวันแจ้งครบแล้ว หรือยังไม่มีเลขพัสดุ)",
              size: "xs",
              color: MUTE,
              wrap: true,
              margin: "md",
            },
          ],
        },
      },
    };
  }

  const buttons = withPending.map((d) => ({
    type: "button",
    style: "secondary",
    height: "sm",
    action: {
      type: "postback",
      label: `${d.dateLabel} · ${d.pending} ออเดอร์`,
      data: `action=ship_day&tab=${encodeURIComponent(d.tabTitle)}`,
      displayText: `เลือกวันที่ ${d.dateLabel}`,
    },
  }));

  return {
    type: "flex",
    altText: "เลือกวันที่จะแจ้งส่ง",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
          { type: "text", text: "แจ้งส่งพัสดุ", size: "sm", weight: "bold", color: INK },
          { type: "text", text: "เลือกวันที่จะแจ้งลูกค้า", size: "xs", color: MUTE },
          { type: "separator", margin: "md", color: "#E2DCD7" },
          { type: "box", layout: "vertical", spacing: "sm", margin: "md", contents: buttons },
        ],
      },
    },
  };
}

// ── 2) confirm card ──────────────────────────────────────────────────────────
const CHANNEL_LABEL: Record<Channel, string> = {
  line: "LINE",
  email: "อีเมล",
  owner: "ข้าม (สั่งแทน)",
  done: "แจ้งแล้ว",
  manual: "เช็คเอง",
};

const CHANNEL_COLOR: Record<Channel, string> = {
  line: "#1F7A3D",
  email: "#1F5F7A",
  owner: MUTE,
  done: MUTE,
  manual: "#B23B3B",
};

function orderRow(s: ResolvedShipment): any {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: s.orderName, size: "xs", color: INK, flex: 3, weight: "bold" },
      {
        type: "text",
        text: CHANNEL_LABEL[s.channel],
        size: "xs",
        color: CHANNEL_COLOR[s.channel],
        flex: 4,
        align: "end",
        wrap: true,
      },
    ],
  };
}

export interface ConfirmCardData {
  dateLabel: string;
  tabTitle: string;
  shipments: ResolvedShipment[]; // already excludes done? no — include all, counts below
  counts: Record<Channel, number>;
}

export function buildConfirmCard(data: ConfirmCardData): any {
  const { dateLabel, tabTitle, shipments, counts } = data;
  const willSend = counts.line + counts.email;

  // Summary line, only non-zero buckets.
  const summaryParts: string[] = [];
  if (counts.line) summaryParts.push(`LINE ${counts.line}`);
  if (counts.email) summaryParts.push(`อีเมล ${counts.email}`);
  if (counts.owner) summaryParts.push(`ข้าม ${counts.owner}`);
  if (counts.manual) summaryParts.push(`เช็คเอง ${counts.manual}`);
  if (counts.done) summaryParts.push(`แจ้งแล้ว ${counts.done}`);

  const footerContents: any[] =
    willSend > 0
      ? [
          {
            type: "button",
            style: "primary",
            color: INK,
            height: "sm",
            action: {
              type: "postback",
              label: `ยืนยันส่ง ${willSend} ราย`,
              data: `action=ship_confirm&tab=${encodeURIComponent(tabTitle)}`,
              displayText: "ยืนยันส่ง",
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: { type: "postback", label: "ยกเลิก", data: "action=ship_cancel", displayText: "ยกเลิก" },
          },
        ]
      : [
          {
            type: "text",
            text: "ไม่มีรายที่จะส่งอัตโนมัติ (ที่เหลือเป็นข้าม/เช็คเอง/แจ้งแล้ว)",
            size: "xxs",
            color: MUTE,
            wrap: true,
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: { type: "postback", label: "ปิด", data: "action=ship_cancel", displayText: "ปิด" },
          },
        ];

  return {
    type: "flex",
    altText: `ยืนยันแจ้งส่ง ${dateLabel} — ส่ง ${willSend} ราย`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "sm",
        contents: [
          { type: "text", text: `ยืนยันแจ้งส่ง · ${dateLabel}`, size: "md", weight: "bold", color: INK },
          { type: "text", text: summaryParts.join("  ·  ") || "ไม่มีออเดอร์", size: "xs", color: ACCENT, wrap: true },
          { type: "separator", margin: "md", color: "#E2DCD7" },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            margin: "md",
            contents: shipments.map(orderRow),
          },
          { type: "separator", margin: "md", color: "#E2DCD7" },
          {
            type: "text",
            text: "กด \"ยืนยันส่ง\" แล้วระบบจะแจ้งเฉพาะราย LINE/อีเมล ที่ยังไม่เคยแจ้ง",
            size: "xxs",
            color: MUTE,
            wrap: true,
            margin: "sm",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        contents: footerContents,
      },
    },
  };
}

// Global manual-mode switch — self-contained module.
//
// Lets the shop owner flip the whole automated sales system OFF ("MANUAL") for a
// campaign day and back ON ("AUTO") from a LINE control card, without a redeploy.
// While MANUAL:
//   • the LIFF shop cannot create orders (guarded in app/api/order/route.ts),
//   • the bot stays fully silent (no replies, no slip verification, no welcome),
//   • the owner handles every order / payment / message by hand.
//
// Owns its own "System" tab and its own Sheets auth (mirrors lib/chat-session.ts)
// so it never imports lib/sheets.ts — the whole feature can be deleted in one go
// without touching the sales-critical path.
//
// FAIL-SAFE DESIGN: the system is MANUAL only if the stored value is EXACTLY
// "MANUAL". Anything else (empty, "AUTO", missing tab, read error) resolves to
// AUTO = normal operation, so a glitch can never leave the shop stuck closed.

import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

// Secret code the owner types from their own LINE to open the control card.
// The userId === OWNER check is the real guard; this is the second layer.
export const SALES_MODE_CODE = process.env.SALES_MODE_CODE || "141990";

export type SalesMode = "AUTO" | "MANUAL";

const TAB = "System";
const HEADERS = ["Key", "Value", "Updated At"];
const KEY = "SALES_MODE";
const KEY_AUTOREPLY = "AUTO_REPLY";

// Short in-memory cache so the flag read on the webhook / order hot path costs a
// Sheets round-trip at most once every CACHE_TTL_MS per server instance. A toggle
// updates the local cache instantly; other instances pick it up within the TTL.
const CACHE_TTL_MS = 10 * 1000;
let cache: { mode: SalesMode; at: number } | null = null;
let arCache: { on: boolean; at: number } | null = null;

/* ── Google Sheets access (own auth, mirrors lib/chat-session.ts) ── */
function getPrivateKey(): string {
  const b64 = process.env.GOOGLE_PRIVATE_KEY_BASE64 || "";
  if (b64) {
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    return decoded.includes("\\n") ? decoded.split("\\n").join("\n") : decoded;
  }
  const raw = process.env.GOOGLE_PRIVATE_KEY || "";
  return raw.includes("\\n") ? raw.split("\\n").join("\n") : raw;
}

async function getTab(): Promise<GoogleSpreadsheetWorksheet> {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: getPrivateKey(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID!, auth);
  await doc.loadInfo();
  let sheet = doc.sheetsByTitle[TAB];
  if (!sheet) {
    sheet = await doc.addSheet({ title: TAB, headerValues: HEADERS });
    return sheet;
  }
  try {
    await sheet.loadHeaderRow();
    const existing = sheet.headerValues || [];
    const missing = HEADERS.filter((h) => !existing.includes(h));
    if (missing.length > 0) await sheet.setHeaderRow([...existing, ...missing]);
  } catch {
    await sheet.setHeaderRow(HEADERS);
  }
  return sheet;
}

function bkkNow(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Bangkok", hour12: false });
}

/**
 * Current sales mode. Cached for CACHE_TTL_MS. Fail-safe: on a read error keep
 * the last known mode (so an active manual close survives a Sheets hiccup), and
 * default to AUTO when nothing is known yet (system operational by default).
 */
export async function getSalesMode(): Promise<SalesMode> {
  const nowMs = Date.now();
  if (cache && nowMs - cache.at < CACHE_TTL_MS) return cache.mode;
  try {
    const sheet = await getTab();
    const rows = await sheet.getRows();
    const row = rows.find((r) => (r.get("Key") || "") === KEY);
    const raw = (row?.get("Value") || "").toString().trim().toUpperCase();
    const mode: SalesMode = raw === "MANUAL" ? "MANUAL" : "AUTO";
    cache = { mode, at: nowMs };
    return mode;
  } catch (err) {
    console.error("[sales-mode] read failed — keeping last known / AUTO:", err);
    return cache?.mode ?? "AUTO";
  }
}

/** Flip the switch. Updates the sheet and the local cache immediately. */
export async function setSalesMode(mode: SalesMode): Promise<void> {
  const sheet = await getTab();
  const rows = await sheet.getRows();
  const now = bkkNow();
  const row = rows.find((r) => (r.get("Key") || "") === KEY);
  if (row) {
    row.set("Value", mode);
    row.set("Updated At", now);
    await row.save();
  } else {
    await sheet.addRow({ Key: KEY, Value: mode, "Updated At": now });
  }
  cache = { mode, at: Date.now() };
}

/**
 * Auto-reply flag. When OFF, the webhook stops sending the catch-all fallback
 * menu to unrecognised text / stickers (the "bot replies to everything" feature)
 * — but orders, slip verification, the contact keyword and new-friend welcome
 * all keep working. Cached for CACHE_TTL_MS.
 *
 * FAIL-SAFE: auto-reply is OFF only if the stored value is EXACTLY "OFF".
 * Anything else (empty, "ON", missing, read error) resolves to ON = normal
 * replies, so a glitch can never leave the bot accidentally muted for good.
 */
export async function getAutoReply(): Promise<boolean> {
  const nowMs = Date.now();
  if (arCache && nowMs - arCache.at < CACHE_TTL_MS) return arCache.on;
  try {
    const sheet = await getTab();
    const rows = await sheet.getRows();
    const row = rows.find((r) => (r.get("Key") || "") === KEY_AUTOREPLY);
    const raw = (row?.get("Value") || "").toString().trim().toUpperCase();
    const on = raw !== "OFF"; // default ON
    arCache = { on, at: nowMs };
    return on;
  } catch (err) {
    console.error("[sales-mode] auto-reply read failed — keeping last known / ON:", err);
    return arCache?.on ?? true;
  }
}

/** Flip the auto-reply flag. Updates the sheet and local cache immediately. */
export async function setAutoReply(on: boolean): Promise<void> {
  const sheet = await getTab();
  const rows = await sheet.getRows();
  const now = bkkNow();
  const value = on ? "ON" : "OFF";
  const row = rows.find((r) => (r.get("Key") || "") === KEY_AUTOREPLY);
  if (row) {
    row.set("Value", value);
    row.set("Updated At", now);
    await row.save();
  } else {
    await sheet.addRow({ Key: KEY_AUTOREPLY, Value: value, "Updated At": now });
  }
  arCache = { on, at: Date.now() };
}

/** Clear the in-memory cache (used by tests). */
export function _resetSalesModeCache(): void {
  cache = null;
  arCache = null;
}

/* ── LINE Flex cards (owner-facing, Thai) ── */

/**
 * The control card: shows current status + toggle buttons for BOTH switches —
 * (1) the whole system (AUTO/MANUAL) and (2) the auto-reply fallback menu.
 * `autoReplyOn` defaults to true so older callers keep working.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSalesControlCard(mode: SalesMode, autoReplyOn: boolean = true): any {
  const isManual = mode === "MANUAL";
  const statusText = isManual ? "ปิดระบบ (แมนนวล)" : "เปิดระบบ (ปกติ)";
  const statusColor = isManual ? "#C44A3A" : "#5B805E";
  const dot = isManual ? "🔴" : "🟢";
  const arText = autoReplyOn ? "เปิด (ตอบปกติ)" : "ปิด (เงียบ)";
  const arColor = autoReplyOn ? "#5B805E" : "#C44A3A";
  const arDot = autoReplyOn ? "🟢" : "🔇";
  return {
    type: "flex",
    altText: `SYSTEM CONTROL — ${statusText}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "lg",
        background: {
          type: "linearGradient",
          angle: "90deg",
          startColor: "#0E0B08",
          centerColor: "#A8551F",
          endColor: "#ECB45A",
        },
        contents: [{ type: "text", text: "SYSTEM CONTROL", color: "#FFFFFF", weight: "bold", size: "sm" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "lg",
        contents: [
          { type: "text", text: "สถานะตอนนี้", size: "xxs", color: "#9A9490" },
          { type: "text", text: `${dot} ${statusText}`, size: "md", weight: "bold", color: statusColor, wrap: true },
          { type: "separator", color: "#EBE7E4" },
          {
            type: "button",
            style: "primary",
            color: "#C44A3A",
            height: "sm",
            action: { type: "postback", label: "🔴 ปิดระบบ", data: "action=sales_manual", displayText: "ปิดระบบ" },
          },
          {
            type: "button",
            style: "primary",
            color: "#5B805E",
            height: "sm",
            action: { type: "postback", label: "🟢 เปิดระบบ", data: "action=sales_auto", displayText: "เปิดระบบ" },
          },
          {
            type: "text",
            text: "ปิด = หน้าร้านสั่งไม่ได้ + บอทเงียบ + ไม่ตรวจสลิป",
            size: "xxs",
            color: "#9A9490",
            wrap: true,
          },
          { type: "separator", color: "#EBE7E4", margin: "md" },
          { type: "text", text: "ตอบข้อความอัตโนมัติ (เมนูตอบมั่ว)", size: "xxs", color: "#9A9490", margin: "md" },
          { type: "text", text: `${arDot} ${arText}`, size: "md", weight: "bold", color: arColor, wrap: true },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: { type: "postback", label: "🔇 ปิดตอบมั่ว", data: "action=autoreply_off", displayText: "ปิดบอทตอบมั่ว" },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: { type: "postback", label: "🔊 เปิดตอบมั่ว", data: "action=autoreply_on", displayText: "เปิดบอทตอบมั่ว" },
          },
          {
            type: "text",
            text: "ปิด = ลูกค้าพิมพ์มั่วๆ บอทไม่เด้งเมนู (แต่ยังสั่งซื้อ/ตรวจสลิป/ติดต่อเราได้)",
            size: "xxs",
            color: "#9A9490",
            wrap: true,
          },
        ],
      },
    },
  };
}

/** Confirmation card shown after the owner toggles the auto-reply switch. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildAutoReplyChangedCard(on: boolean): any {
  const title = on ? "🔊 เปิดบอทตอบอัตโนมัติแล้ว" : "🔇 ปิดบอทตอบมั่วแล้ว";
  const detail = on
    ? "ลูกค้าพิมพ์อะไรมาที่บอทไม่รู้จัก บอทจะเด้งเมนูช่วยเหลือให้ตามปกติ"
    : "ลูกค้าพิมพ์อะไรมั่วๆ บอทจะเงียบ ไม่เด้งเมนู\n• สั่งซื้อผ่านหน้าร้าน = ปกติ\n• ตรวจสลิป = ปกติ\n• พิมพ์ 'ติดต่อเรา' = ยังตอบ\n• เพื่อนใหม่ = ยังได้การ์ดต้อนรับ";
  const color = on ? "#5B805E" : "#C44A3A";
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "lg",
        contents: [
          { type: "text", text: title, weight: "bold", size: "md", color },
          { type: "text", text: detail, size: "xs", color: "#555555", wrap: true },
        ],
      },
    },
  };
}

/** Confirmation card shown after the owner taps a toggle button. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSalesModeChangedCard(mode: SalesMode): any {
  const isManual = mode === "MANUAL";
  const title = isManual ? "🔴 ปิดระบบแล้ว" : "🟢 เปิดระบบแล้ว";
  const detail = isManual
    ? "รับออเดอร์เองทั้งหมด\n• หน้าร้านสั่งไม่ได้\n• บอทเงียบ ไม่ตอบลูกค้า\n• ไม่ตรวจสลิปอัตโนมัติ\n• แอดเพื่อนใหม่ไม่ส่งอะไร"
    : "ทุกอย่างกลับมาทำงานปกติแล้ว\n• หน้าร้านสั่งได้\n• บอทตอบลูกค้า\n• ตรวจสลิปอัตโนมัติ";
  const color = isManual ? "#C44A3A" : "#5B805E";
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "lg",
        contents: [
          { type: "text", text: title, weight: "bold", size: "md", color },
          { type: "text", text: detail, size: "xs", color: "#555555", wrap: true },
        ],
      },
    },
  };
}

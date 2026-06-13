// Chat-with-team human handoff — self-contained module.
//
// Owns the "chat_sessions" tab and all LINE pushes for the handoff feature.
// Deliberately does NOT import lib/sheets.ts (the sales-critical path) so it can
// be removed wholesale without touching order/payment logic. Low traffic, so no
// doc caching / mutex — each call does its own loadInfo.
//
// Scope of the feature (see CHAT-HANDOFF spec): a customer who taps "Chat with
// team" enters a session; while active the bot stays SILENT on free text only —
// slips, postbacks, and keyword commands still work normally. The session ends
// when the owner taps "จบแชท", the customer types a breakout keyword, or 60 min
// of silence elapse (lazy check on the next inbound message — no cron).

import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

const TAB = "chat_sessions";
const HEADERS = ["userId", "status", "enteredAt", "lastCustomerMsgAt"];
const TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

const OWNER_FALLBACK = "U7f329a9ce9a351a1bebc77646e20b2e1";
function adminUserId(): string {
  return process.env.ADMIN_LINE_USER_ID || process.env.OWNER_LINE_USER_ID || OWNER_FALLBACK;
}

/* ── Google Sheets access (own auth, mirrors lib/sheets.ts) ── */
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

// Human-readable Bangkok timestamp "YYYY-MM-DD HH:MM:SS" (sv-SE → ISO-ish).
function bkkNow(): string {
  return new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

// Parse a stored bkkNow() string back to epoch ms (treat as +07:00).
function parseBkk(s: string): number {
  if (!s) return 0;
  const t = Date.parse(s.trim().replace(" ", "T") + "+07:00");
  return Number.isNaN(t) ? 0 : t;
}

export interface ChatSession {
  userId: string;
  status: string;
  enteredAt: string;
  lastCustomerMsgAt: string;
}

/** Upsert an active session for the user (enter chat-with-team mode). */
export async function enterChatSession(userId: string): Promise<void> {
  if (!userId) return;
  const sheet = await getTab();
  const rows = await sheet.getRows();
  const now = bkkNow();
  const existing = rows.find((r) => r.get("userId") === userId);
  if (existing) {
    existing.set("status", "active");
    existing.set("enteredAt", now);
    existing.set("lastCustomerMsgAt", now);
    await existing.save();
  } else {
    await sheet.addRow({ userId, status: "active", enteredAt: now, lastCustomerMsgAt: now });
  }
}

/**
 * Return the active session for userId, or null. Lazily enforces the 60-min
 * timeout: if the last customer message is older than the window, the row is
 * deleted and null is returned (bot resumes). No cron — checked on each inbound.
 */
export async function getActiveChatSession(userId: string): Promise<ChatSession | null> {
  if (!userId) return null;
  const sheet = await getTab();
  const rows = await sheet.getRows();
  const row = rows.find((r) => r.get("userId") === userId);
  if (!row) return null;
  if ((row.get("status") || "") !== "active") return null;
  const last = parseBkk(row.get("lastCustomerMsgAt") || "");
  if (last && Date.now() - last > TIMEOUT_MS) {
    await row.delete();
    return null;
  }
  return {
    userId,
    status: row.get("status"),
    enteredAt: row.get("enteredAt") || "",
    lastCustomerMsgAt: row.get("lastCustomerMsgAt") || "",
  };
}

/** Bump lastCustomerMsgAt so the session stays alive while the customer types. */
export async function touchChatSession(userId: string): Promise<void> {
  if (!userId) return;
  const sheet = await getTab();
  const rows = await sheet.getRows();
  const row = rows.find((r) => r.get("userId") === userId);
  if (row) {
    row.set("lastCustomerMsgAt", bkkNow());
    await row.save();
  }
}

/** End a session (owner tapped จบแชท / keyword breakout / timeout). */
export async function endChatSession(userId: string): Promise<boolean> {
  if (!userId) return false;
  const sheet = await getTab();
  const rows = await sheet.getRows();
  const row = rows.find((r) => r.get("userId") === userId);
  if (row) {
    await row.delete();
    return true;
  }
  return false;
}

/* ── LINE profile + admin notification (own raw fetch, never throws) ── */

async function fetchLineProfile(
  userId: string
): Promise<{ displayName: string; pictureUrl: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !userId) return { displayName: "ลูกค้า", pictureUrl: "" };
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { displayName: "ลูกค้า", pictureUrl: "" };
    const d = await res.json();
    return { displayName: d.displayName || "ลูกค้า", pictureUrl: d.pictureUrl || "" };
  } catch {
    return { displayName: "ลูกค้า", pictureUrl: "" };
  }
}

// Build the Thai admin alert card: customer name + photo + last message + a
// single red "จบแชท" button. The button carries the customer's uid so it ends
// only that conversation (supports several concurrent handoffs). No "open chat"
// button — chat.line.biz cannot be deep-linked from the webhook userId
// (verified: 404). The name + photo are enough to locate the chat in OA Manager.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAdminChatCard(opts: {
  displayName: string;
  pictureUrl: string;
  lastMessage: string;
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): any {
  const time = bkkNow().slice(0, 16); // "YYYY-MM-DD HH:MM"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bubble: any = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "text", text: "ลูกค้าขอคุยกับทีม", weight: "bold", size: "lg" },
        { type: "text", text: opts.displayName, weight: "bold", size: "md", color: "#C47237", wrap: true },
        { type: "text", text: `ข้อความ: ${opts.lastMessage || "-"}`, size: "sm", color: "#555555", wrap: true, margin: "sm" },
        { type: "text", text: `เวลา: ${time}`, size: "xs", color: "#999999" },
        { type: "text", text: "ตอบลูกค้าผ่าน LINE OA Manager แล้วกดปุ่มด้านล่างเมื่อคุยจบ", size: "xs", color: "#999999", wrap: true, margin: "md" },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "md",
          color: "#C44A3A",
          action: {
            type: "postback",
            label: "จบแชท · ให้บอทกลับมา",
            data: `action=end_chat&uid=${opts.userId}`,
            displayText: "จบแชทกับลูกค้าแล้ว",
          },
        },
      ],
    },
  };
  // Only attach the hero image when the customer actually has a profile picture.
  if (opts.pictureUrl) {
    bubble.hero = {
      type: "image",
      url: opts.pictureUrl,
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
    };
  }
  return { type: "flex", altText: "ลูกค้าขอคุยกับทีม", contents: bubble };
}

/**
 * Push the admin a handoff card (name + photo + last message + จบแชท button).
 * Fire-and-forget: never throws so it can't break the customer-facing reply.
 */
export async function notifyAdminNewChat(userId: string, lastMessage: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = adminUserId();
  if (!token || !to) {
    console.error("[chat-session] notifyAdminNewChat — missing LINE token / admin id");
    return;
  }
  try {
    const profile = await fetchLineProfile(userId);
    const card = buildAdminChatCard({
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      lastMessage,
      userId,
    });
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [card] }),
    });
    if (!res.ok) {
      console.error("[chat-session] admin push failed:", res.status, await res.text());
    }
  } catch (e) {
    console.error("[chat-session] notifyAdminNewChat error:", e);
  }
}

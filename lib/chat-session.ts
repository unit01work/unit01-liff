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

// status column values (one row per customer):
//   "active" — chat-with-team handoff (bot SILENT on free text; legacy value)
//   "paused" — owner tapped "ปิดบอท & รับช่วงเอง" (bot SILENT, owner sells manually)
//   "seen"   — owner already alerted about this customer's first bot interaction
//              (bot still REPLIES normally — this is only a once-per-customer
//              dedup marker so the owner isn't notified on every message)
// Rows in any state expire lazily after TIMEOUT_MS of customer silence, so a
// customer returning later re-alerts the owner (a fresh sales opportunity).
const CHAT = "active";
const PAUSED = "paused";
const SEEN = "seen";

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
// Sheets may reformat the cell to a single-digit hour ("... 0:42"), which is not
// valid ISO 8601 → NaN. Zero-pad a single-digit hour before parsing.
function parseBkk(s: string): number {
  if (!s) return 0;
  const iso = s.trim().replace(" ", "T").replace(/T(\d):/, "T0$1:");
  const t = Date.parse(iso + "+07:00");
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
    existing.set("status", CHAT);
    existing.set("enteredAt", now);
    existing.set("lastCustomerMsgAt", now);
    await existing.save();
  } else {
    await sheet.addRow({ userId, status: CHAT, enteredAt: now, lastCustomerMsgAt: now });
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
  if ((row.get("status") || "") !== CHAT) return null;
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

/** End a session (owner tapped จบแชท / keyword breakout / timeout / resume). */
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

/**
 * Single-read status lookup used by the webhook gate. Returns the row's status
 * ("active" | "paused" | "seen") or null. Lazily enforces the 60-min timeout
 * for ALL states (deletes the stale row → bot resumes / re-alert next time).
 * Replaces getActiveChatSession on the hot path so one read decides everything.
 */
export async function getSessionStatus(userId: string): Promise<string | null> {
  if (!userId) return null;
  const sheet = await getTab();
  const rows = await sheet.getRows();
  const row = rows.find((r) => r.get("userId") === userId);
  if (!row) return null;
  const status = (row.get("status") || "").trim();
  if (!status) return null;
  const last = parseBkk(row.get("lastCustomerMsgAt") || "");
  if (last && Date.now() - last > TIMEOUT_MS) {
    await row.delete();
    return null;
  }
  return status;
}

/**
 * Sweep EVERY row and delete any that have been silent past the timeout window,
 * regardless of status (active / paused / seen) — mirroring the per-user lazy
 * expiry in getSessionStatus, but for ALL customers at once. This makes the
 * 60-min auto-close fire even when the customer who opened the handoff never
 * messages again: any inbound webhook traffic from any user drives the cleanup,
 * so the owner can never leave the bot silenced forever by forgetting to close.
 * Piggybacked on the webhook (no cron). Returns the number of rows closed.
 * The timeout is measured from lastCustomerMsgAt, so an actively-chatting
 * customer keeps bumping their own timer and is never swept mid-conversation.
 */
export async function sweepExpiredSessions(): Promise<number> {
  const sheet = await getTab();
  const rows = await sheet.getRows();
  const now = Date.now();
  // Collect expired rows first, then delete from the highest row number down so
  // the library's internal row-index bookkeeping isn't shifted under us.
  const expired = rows.filter((r) => {
    if (!(r.get("status") || "").trim()) return false;
    const last = parseBkk(r.get("lastCustomerMsgAt") || "");
    return last > 0 && now - last > TIMEOUT_MS;
  });
  expired.sort((a, b) => b.rowNumber - a.rowNumber);
  let closed = 0;
  for (const row of expired) {
    await row.delete();
    closed++;
  }
  return closed;
}

/**
 * Mark this customer as "seen" (owner alerted about their first bot interaction).
 * Returns true ONLY when a NEW row was created — i.e. this is the first time, so
 * the caller should notify the owner exactly once. If any row already exists
 * (seen / paused / active), returns false (already alerted — stay quiet).
 * Re-checks rows itself so it stays correct even if called without a prior read.
 */
export async function markSeen(userId: string): Promise<boolean> {
  if (!userId) return false;
  const sheet = await getTab();
  const rows = await sheet.getRows();
  const existing = rows.find((r) => r.get("userId") === userId);
  if (existing) return false;
  const now = bkkNow();
  await sheet.addRow({ userId, status: SEEN, enteredAt: now, lastCustomerMsgAt: now });
  return true;
}

/** Owner tapped "ปิดบอท & รับช่วงเอง" → pause the bot for this customer. */
export async function pauseBot(userId: string): Promise<void> {
  if (!userId) return;
  const sheet = await getTab();
  const rows = await sheet.getRows();
  const now = bkkNow();
  const existing = rows.find((r) => r.get("userId") === userId);
  if (existing) {
    existing.set("status", PAUSED);
    existing.set("lastCustomerMsgAt", now);
    await existing.save();
  } else {
    await sheet.addRow({ userId, status: PAUSED, enteredAt: now, lastCustomerMsgAt: now });
  }
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

// Two visually-distinct admin alert cards (so the owner can tell at a glance,
// even when several customers are messaging at once). Each card shows the
// customer's NAME + PHOTO so it's obvious WHO it belongs to, and every footer
// button carries that customer's uid so it only affects that one conversation.
// No "open chat" deep-link — chat.line.biz can't be linked from a webhook userId
// (verified 404); the name + photo locate the chat in OA Manager.
//
// IMPORTANT — why each card carries BOTH a pause AND a resume button:
// A LINE Flex message CANNOT be edited after it is sent, so we can't flip a
// single button between "pause" and "resume". Instead every card is a permanent
// per-customer control panel: the owner taps "ปิดบอท" to step in, then later
// SCROLLS BACK to that same customer's card and taps "ให้บอทกลับมา" when done —
// no need to hunt for a different message. Both actions are idempotent.
//
//   "takeover" → AMBER. A customer started talking to the bot. Pause + Resume.
//   "chat"     → RED.   Customer tapped "Chat with team". Resume (จบแชท) only —
//                       the bot is already silent, so it just needs turning back on.
type AdminCardVariant = "takeover" | "chat";

interface CardButton {
  label: string;
  color: string;
  action: string; // postback "action" value
  displayText: string;
}

const CARD_CONFIG: Record<
  AdminCardVariant,
  { title: string; accent: string; hint: string; buttons: CardButton[] }
> = {
  takeover: {
    title: "🟠 ลูกค้าเริ่มทักบอท",
    accent: "#C47237",
    hint: "กด “ปิดบอท” เพื่อเข้าไปขายเอง คุยเสร็จแล้วเลื่อนกลับมาการ์ดใบนี้ของลูกค้าคนเดิม แล้วกด “ให้บอทกลับมา”",
    buttons: [
      { label: "⏸️ ปิดบอท & รับช่วงเอง", color: "#C47237", action: "pause_bot", displayText: "ปิดบอท รับช่วงเอง" },
      { label: "▶️ ให้บอทกลับมา", color: "#1A1A1A", action: "resume_bot", displayText: "ให้บอทกลับมาทำงาน" },
    ],
  },
  chat: {
    title: "🔴 ลูกค้าขอคุยกับทีม",
    accent: "#C44A3A",
    hint: "ตอบลูกค้าผ่าน LINE OA Manager แล้วเลื่อนกลับมาการ์ดใบนี้ กดปุ่มด้านล่างเมื่อคุยจบ",
    buttons: [
      { label: "▶️ จบแชท · ให้บอทกลับมา", color: "#C44A3A", action: "end_chat", displayText: "จบแชทกับลูกค้าแล้ว" },
    ],
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAdminCard(opts: {
  variant: AdminCardVariant;
  displayName: string;
  pictureUrl: string;
  lastMessage?: string;
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): any {
  const cfg = CARD_CONFIG[opts.variant];
  const time = bkkNow().slice(11, 16); // "HH:MM" only — compact

  // Header row: small avatar (if any) next to title + name. A tiny inline
  // thumbnail instead of a full-width hero keeps the card short and tidy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerInner: any[] = [
    { type: "text", text: cfg.title, weight: "bold", size: "xs", color: cfg.accent, wrap: true },
    { type: "text", text: opts.displayName, weight: "bold", size: "sm", color: "#1A1A1A", wrap: true },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerRow: any[] = [];
  if (opts.pictureUrl) {
    headerRow.push({
      type: "image",
      url: opts.pictureUrl,
      size: "xxs",
      aspectRatio: "1:1",
      aspectMode: "cover",
      flex: 0,
    });
  }
  headerRow.push({ type: "box", layout: "vertical", spacing: "none", contents: headerInner });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyContents: any[] = [
    { type: "box", layout: "horizontal", spacing: "sm", contents: headerRow },
  ];
  if (opts.lastMessage) {
    const msg = opts.lastMessage.length > 60 ? `${opts.lastMessage.slice(0, 60)}…` : opts.lastMessage;
    bodyContents.push({ type: "text", text: `${msg}  ·  ${time}`, size: "xxs", color: "#999999", wrap: true, margin: "sm" });
  } else {
    bodyContents.push({ type: "text", text: time, size: "xxs", color: "#999999", margin: "sm" });
  }

  const footerButtons = cfg.buttons.map((b) => ({
    type: "button",
    style: "primary",
    height: "sm",
    color: b.color,
    action: {
      type: "postback",
      label: b.label,
      data: `action=${b.action}&uid=${opts.userId}`,
      displayText: b.displayText,
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bubble: any = {
    type: "bubble",
    size: "kilo",
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "md", contents: bodyContents },
    footer: { type: "box", layout: "vertical", spacing: "xs", paddingAll: "md", contents: footerButtons },
  };
  return { type: "flex", altText: cfg.title, contents: bubble };
}

/* Low-level push: send any admin card. Never throws (handoff must not break the
 * customer-facing reply). */
async function pushAdminCard(
  variant: AdminCardVariant,
  userId: string,
  lastMessage?: string
): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = adminUserId();
  if (!token || !to) {
    console.error("[chat-session] pushAdminCard — missing LINE token / admin id");
    return;
  }
  try {
    const profile = await fetchLineProfile(userId);
    const card = buildAdminCard({
      variant,
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
    console.error("[chat-session] pushAdminCard error:", e);
  }
}

/**
 * RED card — customer tapped "Chat with team". Button ends the chat.
 * Fire-and-forget: never throws so it can't break the customer-facing reply.
 */
export async function notifyAdminNewChat(userId: string, lastMessage: string): Promise<void> {
  await pushAdminCard("chat", userId, lastMessage);
}

/**
 * AMBER card — a customer's FIRST interaction with the bot. Button pauses the
 * bot so the owner can step in and close the sale. Caller must gate this with
 * markSeen() so it fires at most once per customer.
 */
export async function notifyAdminNewCustomer(userId: string, lastMessage: string): Promise<void> {
  await pushAdminCard("takeover", userId, lastMessage);
}


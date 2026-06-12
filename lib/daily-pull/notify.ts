// Self-contained LINE push for the daily-pull module. Thai text, no emoji
// (per CONTEXT design rules). Targets ADMIN_LINE_USER_ID, falling back to the
// shop owner id so reporting never goes silent if the admin var is unset.

const OWNER_FALLBACK = "U7f329a9ce9a351a1bebc77646e20b2e1";

function adminUserId(): string {
  return process.env.ADMIN_LINE_USER_ID || process.env.OWNER_LINE_USER_ID || OWNER_FALLBACK;
}

// Push one Thai message. Returns false (and logs) instead of throwing so a LINE
// outage never aborts the pull itself.
export async function pushAdmin(text: string): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = adminUserId();
  if (!token || !to) {
    console.error("[daily-pull/notify] missing LINE token / admin id");
    return false;
  }
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    });
    if (!res.ok) {
      console.error("[daily-pull/notify] LINE push failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[daily-pull/notify] LINE push error:", e);
    return false;
  }
}

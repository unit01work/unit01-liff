/**
 * SlipOK API helper — verify Thai payment slips.
 * Also includes LINE Content API image download.
 */

export interface SlipOKSender {
  displayName: string;
  name: string;
}

export interface SlipOKData {
  success: boolean;
  message: string;
  transRef: string;
  transDate: string;
  transTime: string;
  sender: SlipOKSender;
  receiver: SlipOKSender;
  amount: number;
  sendingBank: string;
  receivingBank: string;
  countryCode: string;
}

export interface SlipOKResponse {
  success: boolean;
  data: SlipOKData;
}

/**
 * Retry a transient operation. Re-runs `fn` up to `attempts` times, only when it
 * THROWS (network blip / non-2xx / timeout). A clean return is never retried.
 * Backoff grows linearly (baseDelayMs * attempt). Used to ride out brief LINE /
 * SlipOK API hiccups so a single dropped call doesn't silently lose a payment
 * (root cause of the 2026-06-25 missed-slip incident: one transient throw =
 * customer told "couldn't read", owner never alerted).
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 3,
  baseDelayMs = 400
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      console.error(`[slipok] ${label} attempt ${attempt}/${attempts} failed:`, e);
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
      }
    }
  }
  throw lastErr;
}

/**
 * Download an image from LINE Content API. Retries on transient failure.
 */
export async function downloadLineImage(messageId: string): Promise<Buffer> {
  return withRetry(async () => {
    const response = await fetch(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      {
        headers: {
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`LINE Content API error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }, "downloadLineImage");
}

/**
 * Send slip image to SlipOK for verification. Retries on transient API failure
 * (non-2xx / network). NOTE: a 200 response carrying `data.success === false`
 * (a genuinely unreadable / non-slip image) is NOT a throw and is NOT retried —
 * the caller handles that as an "invalid slip", distinct from a system error.
 */
export async function verifySlip(imageBuffer: Buffer): Promise<SlipOKResponse> {
  return withRetry(async () => {
    // Rebuild the multipart body on every attempt — a request body stream can
    // only be consumed once.
    const formData = new FormData();
    const uint8 = new Uint8Array(imageBuffer);
    const blob = new Blob([uint8], { type: "image/png" });
    formData.append("files", blob, "slip.png");

    const response = await fetch(
      `https://api.slipok.com/api/line/apikey/${process.env.SLIPOK_BRANCH_ID}`,
      {
        method: "POST",
        headers: {
          "x-authorization": process.env.SLIPOK_API_KEY!,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("[slipok] API error:", response.status, text);
      throw new Error(`SlipOK API error: ${response.status}`);
    }

    return response.json();
  }, "verifySlip");
}

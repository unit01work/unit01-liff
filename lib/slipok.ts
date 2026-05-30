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
 * Download an image from LINE Content API.
 */
export async function downloadLineImage(messageId: string): Promise<Buffer> {
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
}

/**
 * Send slip image to SlipOK for verification.
 */
export async function verifySlip(imageBuffer: Buffer): Promise<SlipOKResponse> {
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
}

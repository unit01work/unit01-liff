import generatePayload from "promptpay-qr";
import QRCode from "qrcode";
import { getOrderAmount } from "@/lib/order-store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  // Try to get amount from order store
  let amount = getOrderAmount(orderId);

  // Fallback: check URL search params (used when order store is cold)
  if (amount === null) {
    const url = new URL(request.url);
    const amountParam = url.searchParams.get("amount");
    if (amountParam) amount = parseFloat(amountParam);
  }

  if (amount === null || amount <= 0) {
    return new Response("Order not found or invalid amount", { status: 404 });
  }

  const promptpayId = process.env.PROMPTPAY_ID!;
  const payload = generatePayload(promptpayId, { amount });
  const qrBuffer = await QRCode.toBuffer(payload, {
    width: 400,
    margin: 2,
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  return new Response(new Uint8Array(qrBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

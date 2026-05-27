import { getOrderAmount } from "@/lib/order-store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
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

    const promptpayId = process.env.PROMPTPAY_ID;
    if (!promptpayId) {
      return new Response("PROMPTPAY_ID not configured", { status: 500 });
    }

    // Dynamic import to avoid bundling issues
    const generatePayload = (await import("promptpay-qr")).default;
    const QRCode = await import("qrcode");

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
  } catch (err) {
    console.error("QR generation error:", err);
    return new Response(`QR generation failed: ${err}`, { status: 500 });
  }
}

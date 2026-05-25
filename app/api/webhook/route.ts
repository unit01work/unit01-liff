import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  console.log("LINE Webhook event:", JSON.stringify(body, null, 2));
  return NextResponse.json({ status: "ok" });
}

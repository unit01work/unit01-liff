import { NextRequest, NextResponse } from "next/server";
import { findLatestCustomerData } from "@/lib/sheets";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ customer: null });
  }

  try {
    const customer = await findLatestCustomerData(userId);
    return NextResponse.json({ customer });
  } catch (err) {
    console.error("[customer] Error:", err);
    return NextResponse.json({ customer: null });
  }
}

import { NextResponse } from "next/server";
import { readSessionHealthFromServer } from "@/lib/auth/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await readSessionHealthFromServer();
  return NextResponse.json({ health });
}

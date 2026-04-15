import { NextResponse } from "next/server";
import { readSessionHealthFromServer } from "@/lib/auth/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await readSessionHealthFromServer();
  const response = NextResponse.json({ health });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

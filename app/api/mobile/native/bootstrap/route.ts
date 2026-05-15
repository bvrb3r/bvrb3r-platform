import { NextResponse } from "next/server";
import { z } from "zod";
import { buildNativeBootstrapSummary } from "@/lib/mobile/native";

const roleSchema = z.enum(["shop_owner_user", "manager", "front_desk", "barber_user", "client_user"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsedRole = roleSchema.safeParse(searchParams.get("role"));
  const role = parsedRole.success ? parsedRole.data : "client_user";
  return NextResponse.json({ bootstrap: buildNativeBootstrapSummary(role) });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { buildNativeBootstrapSummary } from "@/lib/mobile/native";

const roleSchema = z.enum(["owner", "manager", "front_desk", "commission_barber", "booth_rent_barber", "client"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsedRole = roleSchema.safeParse(searchParams.get("role"));
  const role = parsedRole.success ? parsedRole.data : "client";
  return NextResponse.json({ bootstrap: buildNativeBootstrapSummary(role) });
}

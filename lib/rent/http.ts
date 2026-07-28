import { NextResponse } from "next/server";
import { RentServiceError } from "@/lib/rent/service";

export function rentErrorResponse(error: unknown, fallback: string) {
  if (error instanceof RentServiceError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 }
  );
}

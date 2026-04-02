import { NextResponse } from "next/server";

export function engagementErrorResponse(error: unknown) {
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    const message = error instanceof Error ? error.message : "Engagement request failed.";
    return NextResponse.json({ error: message }, { status: error.status });
  }

  return NextResponse.json({ error: "Something went wrong while processing this engagement request." }, { status: 500 });
}
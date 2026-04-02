import { NextResponse } from "next/server";

export function marketplaceErrorResponse(error: unknown) {
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    const message = error instanceof Error ? error.message : "Marketplace request failed.";
    return NextResponse.json({ error: message }, { status: error.status });
  }

  return NextResponse.json({ error: "Something went wrong while processing this marketplace request." }, { status: 500 });
}
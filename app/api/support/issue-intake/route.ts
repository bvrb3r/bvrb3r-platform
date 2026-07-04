import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { PlatformEventPersistenceError } from "@/lib/core/platform-events";
import { submitSupportIssueIntake, SupportIssueIntakeError } from "@/lib/support/issue-intake";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const payload = await request.json().catch(() => null);
    const result = await submitSupportIssueIntake(user, payload ?? {});

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof SupportIssueIntakeError) {
      return NextResponse.json({
        error: "Support intake was not submitted",
        message: error.message,
        code: error.code
      }, { status: error.status });
    }

    if (error instanceof PlatformEventPersistenceError) {
      return NextResponse.json({
        error: "Support intake was not routed",
        message: "Support received the message, but routing evidence could not be recorded. Try again or contact support through Messages.",
        code: "support_issue_event_failed"
      }, { status: 503 });
    }

    const message = error instanceof Error ? error.message : "Unable to submit support intake.";
    const status = message === "auth_required" ? 401 : 500;
    return NextResponse.json({
      error: "Support intake was not submitted",
      message: status === 401 ? "Sign in before contacting support." : "Unable to submit support intake.",
      code: status === 401 ? "auth_required" : "support_issue_unexpected_error"
    }, { status });
  }
}

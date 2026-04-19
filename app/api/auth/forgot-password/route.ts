import { NextResponse } from "next/server";
import {
  PASSWORD_RESET_GENERIC_FAILURE,
  PASSWORD_RESET_GENERIC_SUCCESS,
  PASSWORD_RESET_REDIRECT_TO,
  type PasswordRecoverySupabaseClient,
  classifyPasswordRecoveryIdentifier,
  describePasswordRecoveryError,
  resolvePasswordRecoveryEmail,
  shouldMaskPasswordResetError
} from "@/lib/auth/password-recovery";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ForgotPasswordBody = {
  identifier?: unknown;
};

function successResponse() {
  return NextResponse.json({
    ok: true,
    message: PASSWORD_RESET_GENERIC_SUCCESS
  });
}

function failureResponse() {
  return NextResponse.json({
    ok: false,
    message: PASSWORD_RESET_GENERIC_FAILURE
  }, { status: 500 });
}

async function readIdentifier(request: Request) {
  const body = await request.json().catch(() => ({})) as ForgotPasswordBody;
  return typeof body.identifier === "string" ? body.identifier.trim() : "";
}

export async function POST(request: Request) {
  const identifier = await readIdentifier(request);
  const identifierKind = classifyPasswordRecoveryIdentifier(identifier);
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    console.error("[auth] password recovery request failed: Supabase admin client is not configured", {
      identifierKind
    });
    return failureResponse();
  }

  try {
    const passwordRecoveryClient = supabase as unknown as PasswordRecoverySupabaseClient;
    const resolved = await resolvePasswordRecoveryEmail(passwordRecoveryClient, identifier);
    if (resolved?.email) {
      const { error } = await passwordRecoveryClient.auth.resetPasswordForEmail(resolved.email, {
        redirectTo: PASSWORD_RESET_REDIRECT_TO
      });

      if (error) {
        console.warn("[auth] password recovery reset request returned an error", {
          identifierKind,
          source: resolved.source,
          masked: shouldMaskPasswordResetError(error),
          error: describePasswordRecoveryError(error)
        });

        if (!shouldMaskPasswordResetError(error)) {
          return failureResponse();
        }
      }
    }

    console.info("[auth] password recovery request handled", {
      identifierKind,
      resolved: Boolean(resolved?.email)
    });
    return successResponse();
  } catch (error) {
    console.error("[auth] password recovery request failed", {
      identifierKind,
      error: describePasswordRecoveryError(error)
    });
    return failureResponse();
  }
}

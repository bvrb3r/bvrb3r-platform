type OAuthCallbackValue = string | string[] | undefined;

export type OAuthCallbackSearchParams = Record<string, OAuthCallbackValue>;

const CALLBACK_QUERY_KEYS = [
  "code",
  "error",
  "error_description",
  "error_code",
  "state",
  "next",
  "type"
] as const;

function firstValue(value: OAuthCallbackValue) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function buildOAuthCallbackRedirectPath(searchParams?: OAuthCallbackSearchParams | null) {
  const nextParams = new URLSearchParams();

  for (const key of CALLBACK_QUERY_KEYS) {
    const value = firstValue(searchParams?.[key]);
    if (value) {
      nextParams.set(key, value);
    }
  }

  if (!nextParams.has("code")) {
    return null;
  }

  if (nextParams.get("type") === "recovery" && nextParams.has("code")) {
    const resetParams = new URLSearchParams();
    resetParams.set("code", nextParams.get("code") ?? "");
    resetParams.set("type", "recovery");
    return `/reset-password?${resetParams.toString()}`;
  }

  return `/auth/callback?${nextParams.toString()}`;
}

export const GUEST_SESSION_COOKIE = "bvrb3r-guest-entry";

export type GuestEntrySource = "homepage" | "direct";

export function createGuestSessionValue(source: GuestEntrySource = "homepage") {
  return JSON.stringify({
    mode: "guest",
    source,
    startedAt: new Date().toISOString()
  });
}

export function isGuestSessionCookieValue(value?: string | null) {
  if (!value) {
    return false;
  }

  try {
    const parsed = JSON.parse(value) as { mode?: unknown };
    return parsed.mode === "guest";
  } catch {
    return value === "guest";
  }
}

/**
 * Best-effort in-memory rate limiter for kiosk endpoints.
 *
 * Kiosk devices are unattended and their mutation endpoints accept
 * unauthenticated input (gated by the device session), so a runaway or
 * hostile caller must be slowed down close to the handler. This limiter is
 * per-process — serverless instances each keep their own window — which is
 * acceptable as a brake; the device-session gate remains the security
 * boundary.
 */

type WindowState = { count: number; resetAt: number };

const windows = new Map<string, WindowState>();
const MAX_TRACKED_KEYS = 10_000;

export function clientKeyFromRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function consumeRateLimit(input: {
  bucket: string;
  key: string;
  limit: number;
  windowMs: number;
}): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const mapKey = `${input.bucket}:${input.key}`;
  const state = windows.get(mapKey);

  if (!state || state.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) {
      // Drop expired entries before refusing to grow further.
      for (const [key, value] of windows) {
        if (value.resetAt <= now) {
          windows.delete(key);
        }
      }
    }
    windows.set(mapKey, { count: 1, resetAt: now + input.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (state.count >= input.limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000)) };
  }

  state.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test hook: clears all rate-limit windows. */
export function resetRateLimits() {
  windows.clear();
}

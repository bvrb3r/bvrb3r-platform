import { describe, expect, it } from "vitest";

import {
  IDENTITY_AUDIT_REDACTED,
  buildIdentityAuditRow,
  redactIdentityAuditMetadata
} from "@/lib/auth/identity-audit";

const CLIENT_ACTOR = { id: "user-1", role: "client_user" as const, platformAdmin: false };

/** Recursively collects every string in a JSON-ish structure. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((entry) => allStrings(entry, out));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((entry) => allStrings(entry, out));
  }
  return out;
}

describe("identity audit: actor identity is recorded", () => {
  it("records the actor, their effective role, and the internal-access flag", () => {
    const row = buildIdentityAuditRow({
      actor: CLIENT_ACTOR,
      source: "auth.login",
      entityType: "session",
      action: "sign_in"
    });

    expect(row.actor_user_id).toBe("user-1");
    expect(row.effective_role).toBe("client_user");
    expect(row.internal_access).toBe(false);
    expect(row.outcome).toBe("succeeded");
  });

  it("canonicalizes a legacy stored role so the record is comparable later", () => {
    const row = buildIdentityAuditRow({
      actor: { id: "user-2", role: "booth_rent_barber" as never, platformAdmin: false },
      source: "auth.login",
      entityType: "session",
      action: "sign_in"
    });

    expect(row.effective_role).toBe("barber_user");
  });

  it("marks internal access when the actor holds it", () => {
    const row = buildIdentityAuditRow({
      actor: { id: "op-1", role: "client_user", platformAdmin: true },
      source: "architect.console",
      entityType: "shop",
      entityId: "shop-1",
      action: "view"
    });

    expect(row.internal_access).toBe(true);
  });

  it("records a null actor for pre-authentication events rather than inventing one", () => {
    const row = buildIdentityAuditRow({
      actor: null,
      source: "auth.login",
      entityType: "session",
      action: "sign_in",
      outcome: "denied"
    });

    expect(row.actor_user_id).toBeNull();
    expect(row.effective_role).toBeNull();
    expect(row.outcome).toBe("denied");
  });

  it("never stores the guest sentinel as if it were a real identity", () => {
    const row = buildIdentityAuditRow({
      actor: { id: "guest-user", role: "client_user", platformAdmin: false },
      source: "auth.login",
      entityType: "session",
      action: "sign_in"
    });

    expect(row.actor_user_id).toBeNull();
  });

  it("carries correlation and session identifiers when available", () => {
    const row = buildIdentityAuditRow({
      actor: CLIENT_ACTOR,
      source: "auth.callback",
      entityType: "session",
      action: "exchange",
      correlationId: "req-abc",
      sessionId: "sess-xyz"
    });

    expect(row.correlation_id).toBe("req-abc");
    expect(row.session_id).toBe("sess-xyz");
  });
});

describe("identity audit: secrets never reach the record", () => {
  const SECRET = "super-secret-value-1234567890";

  it("redacts credential-shaped keys regardless of casing or separator", () => {
    const redacted = redactIdentityAuditMetadata({
      password: SECRET,
      Password: SECRET,
      passphrase: SECRET,
      access_token: SECRET,
      refreshToken: SECRET,
      otp: "123456",
      otp_code: "123456",
      oneTimeCode: "123456",
      apiKey: SECRET,
      "api-key": SECRET,
      Authorization: `Bearer ${SECRET}`,
      cookie: `sb-access-token=${SECRET}`,
      client_secret: SECRET,
      privateKey: SECRET,
      signature: SECRET,
      magicLink: `https://x.test/#access_token=${SECRET}`,
      pin: "2468",
      cvv: "123",
      card_number: "4242424242424242"
    }) as Record<string, unknown>;

    for (const [key, value] of Object.entries(redacted)) {
      expect(value, `${key} leaked`).toBe(IDENTITY_AUDIT_REDACTED);
    }
  });

  it("redacts credential-shaped values even under an innocent key", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const redacted = redactIdentityAuditMetadata({
      note: jwt,
      header: `bearer ${jwt}`,
      returnTo: "https://bvrb3r.app/auth/callback?token_hash=abc123def456&type=recovery",
      serviceKey: "sbp_0123456789abcdefghij"
    }) as Record<string, string>;

    expect(redacted.note).toBe(IDENTITY_AUDIT_REDACTED);
    expect(redacted.header).toBe(IDENTITY_AUDIT_REDACTED);
    expect(redacted.returnTo).toBe(IDENTITY_AUDIT_REDACTED);
    expect(redacted.serviceKey).toBe(IDENTITY_AUDIT_REDACTED);
  });

  it("reaches secrets nested inside objects and arrays", () => {
    const row = buildIdentityAuditRow({
      actor: CLIENT_ACTOR,
      source: "auth.recovery",
      entityType: "session",
      action: "reset",
      metadata: {
        request: { headers: { authorization: `Bearer ${SECRET}` }, body: { password: SECRET } },
        attempts: [{ otp: "000000" }, { otp: "111111" }]
      }
    });

    const strings = allStrings(row.metadata);
    expect(strings).not.toContain(SECRET);
    expect(strings).not.toContain("000000");
    expect(strings).not.toContain("111111");
  });

  it("keeps benign diagnostic fields intact so the record is still useful", () => {
    const row = buildIdentityAuditRow({
      actor: CLIENT_ACTOR,
      source: "auth.signup_role_intent",
      entityType: "profile",
      entityId: "user-1",
      action: "role_activation",
      outcome: "denied",
      metadata: { requestedIntent: "shop_owner", decision: "lane_change_blocked", attempt: 2 }
    });

    expect(row.metadata).toMatchObject({
      requestedIntent: "shop_owner",
      decision: "lane_change_blocked",
      attempt: 2
    });
  });

  it("stops descending at a bounded depth instead of recursing forever", () => {
    const deep = { a: { b: { c: { d: { e: { f: "bottom" } } } } } };
    const strings = allStrings(redactIdentityAuditMetadata(deep));
    expect(strings).not.toContain("bottom");
    expect(strings).toContain(IDENTITY_AUDIT_REDACTED);
  });

  it("truncates an oversized string rather than storing it whole", () => {
    const long = "a".repeat(5000);
    const redacted = redactIdentityAuditMetadata({ note: long }) as { note: string };
    expect(redacted.note.length).toBeLessThan(long.length);
  });

  it("handles a circular-free exotic value without throwing", () => {
    expect(() => redactIdentityAuditMetadata({ when: new Date(0), fn: () => null })).not.toThrow();
  });
});

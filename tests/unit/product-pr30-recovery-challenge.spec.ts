import { beforeEach, describe, expect, it } from "vitest";
import {
  RECOVERY_REQUEST_LIMIT_PER_TARGET,
  RecoveryChallengeError,
  completeRecoveryChallenge,
  requestRecoveryChallenge,
  resetDemoRecoveryChallenges,
  verifyRecoveryChallenge
} from "@/lib/auth/recovery-challenge";

type DemoChallengeState = {
  id: string;
  expires_at: string;
};

describe("Product PR30 recovery challenges", () => {
  beforeEach(() => {
    resetDemoRecoveryChallenges();
  });

  it("runs the six-digit, one-use recovery sequence without storing plaintext secrets", async () => {
    const requested = await requestRecoveryChallenge({
      channel: "email",
      destination: "client@bvrb3r.demo",
      requestSource: "test-source"
    });

    expect(requested.challengeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(requested.maskedDestination).toBe("c•••@bvrb3r.demo");
    expect(requested.demoCode).toMatch(/^\d{6}$/);
    expect(JSON.stringify(globalThis.__bvrb3rRecoveryChallenges)).not.toContain(requested.demoCode);

    await expect(verifyRecoveryChallenge({
      challengeId: requested.challengeId,
      code: "000000"
    })).rejects.toMatchObject({
      code: "invalid_code"
    });

    const verified = await verifyRecoveryChallenge({
      challengeId: requested.challengeId,
      code: requested.demoCode!
    });
    expect(verified.resetToken.length).toBeGreaterThan(32);
    expect(JSON.stringify(globalThis.__bvrb3rRecoveryChallenges)).not.toContain(verified.resetToken);

    await expect(completeRecoveryChallenge({
      challengeId: requested.challengeId,
      resetToken: verified.resetToken,
      newPassword: "new-secure-password"
    })).resolves.toEqual({
      completed: true,
      signInEmail: "client@bvrb3r.demo"
    });

    await expect(completeRecoveryChallenge({
      challengeId: requested.challengeId,
      resetToken: verified.resetToken,
      newPassword: "new-secure-password"
    })).rejects.toMatchObject({
      code: "invalid_reset_session"
    });
  });

  it("returns an honest expired-code error", async () => {
    const requested = await requestRecoveryChallenge({
      channel: "sms",
      destination: "(813) 555-0100",
      requestSource: "expiry-source"
    });
    const challenge = (globalThis.__bvrb3rRecoveryChallenges as DemoChallengeState[])
      .find((candidate) => candidate.id === requested.challengeId)!;
    challenge.expires_at = new Date(Date.now() - 1000).toISOString();

    await expect(verifyRecoveryChallenge({
      challengeId: requested.challengeId,
      code: requested.demoCode!
    })).rejects.toMatchObject({
      status: 410,
      code: "code_expired",
      message: "That code expired. Request a new six-digit code."
    });
  });

  it("locks a challenge after five incorrect codes", async () => {
    const requested = await requestRecoveryChallenge({
      channel: "email",
      destination: "client@bvrb3r.demo",
      requestSource: "lock-source"
    });

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await expect(verifyRecoveryChallenge({
        challengeId: requested.challengeId,
        code: "000000"
      })).rejects.toMatchObject({ code: "invalid_code" });
    }
    await expect(verifyRecoveryChallenge({
      challengeId: requested.challengeId,
      code: "000000"
    })).rejects.toMatchObject({
      status: 429,
      code: "challenge_locked"
    });
  });

  it("rate limits repeated requests for one destination", async () => {
    for (let attempt = 0; attempt < RECOVERY_REQUEST_LIMIT_PER_TARGET; attempt += 1) {
      await requestRecoveryChallenge({
        channel: "email",
        destination: "client@bvrb3r.demo",
        requestSource: `source-${attempt}`
      });
    }

    await expect(requestRecoveryChallenge({
      channel: "email",
      destination: "client@bvrb3r.demo",
      requestSource: "source-limited"
    })).rejects.toBeInstanceOf(RecoveryChallengeError);
    await expect(requestRecoveryChallenge({
      channel: "email",
      destination: "client@bvrb3r.demo",
      requestSource: "source-limited"
    })).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      retryAfterSeconds: 900
    });
  });
});

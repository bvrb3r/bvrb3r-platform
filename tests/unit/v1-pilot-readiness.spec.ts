import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function projectPathExists(relativePath: string) {
  return existsSync(path.join(root, relativePath));
}

const pilotDocs = [
  "docs/pilot/v1-pilot-readiness.md",
  "docs/pilot/first-shop-setup-checklist.md",
  "docs/pilot/onboarding-scripts.md",
  "docs/pilot/test-account-protocol.md",
  "docs/pilot/recovery-rules.md",
  "docs/pilot/support-escalation.md",
  "docs/pilot/evidence-capture-checklist.md",
  "docs/pilot/pilot-risk-register.md"
] as const;

const allowedVerdicts = [
  "PILOT PACKAGE READY — EXECUTION PENDING RC EVIDENCE",
  "PILOT PACKAGE INCOMPLETE"
] as const;

describe("Roadmap PR #61 pilot readiness package", () => {
  it("adds all required pilot package documents", () => {
    for (const doc of pilotDocs) {
      expect(projectPathExists(doc), `${doc} is missing`).toBe(true);
    }
  });

  it("uses exactly one allowed recommended pilot readiness verdict", () => {
    const readiness = readProjectFile("docs/pilot/v1-pilot-readiness.md");
    const verdictLines = readiness
      .split(/\r?\n/)
      .filter((line) => line.startsWith("Recommended pilot readiness verdict"));

    expect(verdictLines).toHaveLength(1);
    expect(allowedVerdicts.some((verdict) => verdictLines[0].endsWith(verdict))).toBe(true);
    expect(verdictLines[0]).toContain("Recommended - pending founder authorization");
  });

  it("carries forward PR #60 lock facts without softening them", () => {
    const readiness = readProjectFile("docs/pilot/v1-pilot-readiness.md");

    expect(readiness).toContain("Recommended RC verdict: NOT RC READY");
    expect(readiness).toContain("PR #57 decision: Parked Post-RC Item");
    expect(readiness).toContain("PR #58 device QA status: Completed on real devices");
    expect(readiness).toContain(
      "PR #59 evidence ceiling: Integration/Proxy E2E evidence present; true deployed browser E2E absent."
    );
  });

  it("keeps the RC gap closure list and honest not-public-launch sentence visible", () => {
    const readiness = readProjectFile("docs/pilot/v1-pilot-readiness.md");

    expect(readiness).toContain("## RC Gap Closure List");
    expect(readiness).toContain("V1 is not public launch ready; pilot execution is gated on RC evidence closure.");
    expect(readiness).toContain("Execution status: Pending RC evidence closure.");
    expect(readiness).toContain("The next step is not public launch.");
  });

  it("documents test-mode-only money isolation", () => {
    const protocol = readProjectFile("docs/pilot/test-account-protocol.md");

    expect(protocol).toContain("Stripe TEST MODE ONLY is required for all pilot test accounts.");
    expect(protocol).toContain("Pilot test accounts must never be connected to live Stripe payment movement.");
    expect(protocol).toContain("TEST-PILOT-");
    expect(protocol).toContain("Only the Founder creates pilot accounts");
    expect(protocol).toContain("Do not use real personal cards for pilot test accounts.");
  });

  it("documents support and notification reality from existing implementation", () => {
    const support = readProjectFile("docs/pilot/support-escalation.md");
    const scripts = readProjectFile("docs/pilot/onboarding-scripts.md");

    expect(support).toContain("In-app support is functional");
    expect(support).toContain("Manual fallback is still required during pilot");
    expect(scripts).toContain("Notification preference toggles can be saved.");
    expect(scripts).toContain("SMS, email, and push delivery must not be promised from consent alone.");
  });

  it("does not mark pilot risks founder-accepted without explicit input", () => {
    const riskRegister = readProjectFile("docs/pilot/pilot-risk-register.md");
    const tableLines = riskRegister
      .split(/\r?\n/)
      .filter((line) => line.startsWith("| PILOT-"));

    expect(tableLines.some((line) => /\|\s*founder-accepted\s*\|/i.test(line))).toBe(false);
    expect(riskRegister).toContain("No risk is marked founder-accepted in this register.");
  });

  it("keeps forbidden launch and payment claims negation-aware", () => {
    const guardedPhrases = [
      {
        phrase: "public launch ready",
        allowedOnLine: [/not public launch ready/i, /no public launch claim/i]
      },
      {
        phrase: "production launch ready",
        allowedOnLine: [/not production launch ready/i]
      },
      {
        phrase: "real users ready",
        allowedOnLine: [/not real users ready/i]
      },
      {
        phrase: "real payments verified",
        allowedOnLine: [/real payments not verified/i, /no real payments verified/i]
      },
      {
        phrase: "guaranteed",
        allowedOnLine: [/not guaranteed/i, /does not guarantee/i]
      }
    ];

    for (const doc of pilotDocs) {
      const lines = readProjectFile(doc).split(/\r?\n/);

      for (const line of lines) {
        for (const guard of guardedPhrases) {
          if (!line.toLowerCase().includes(guard.phrase)) {
            continue;
          }

          expect(
            guard.allowedOnLine.some((pattern) => pattern.test(line)),
            `${doc} contains an unqualified claim: ${line}`
          ).toBe(true);
        }
      }
    }
  });

  it("keeps raw backend and provider labels out of pilot-facing docs", () => {
    const forbiddenLabels =
      /service_role|stripe_customer_id|payment_intent|payout_readiness_status|account_entitlements/i;

    for (const doc of pilotDocs) {
      expect(readProjectFile(doc), doc).not.toMatch(forbiddenLabels);
    }
  });
});

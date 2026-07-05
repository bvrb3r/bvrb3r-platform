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

const lockDocPath = "docs/qa/v1-release-candidate-lock.md";
const riskRegisterPath = "docs/qa/v1-release-risk-register.md";
const commandsDocPath = "docs/qa/v1-release-evidence-commands.md";

describe("Roadmap PR #60 V1 release candidate lock", () => {
  it("adds the required release lock documents", () => {
    expect(projectPathExists(lockDocPath)).toBe(true);
    expect(projectPathExists(riskRegisterPath)).toBe(true);
    expect(projectPathExists(commandsDocPath)).toBe(true);
  });

  it("records founder inputs and the PR #59 evidence ceiling", () => {
    const lockDoc = readProjectFile(lockDocPath);

    expect(lockDoc).toContain("PR #57 decision: Parked Post-RC Item");
    expect(lockDoc).toContain(
      "Pre-accepted risks: None pre-accepted — surface candidates for founder review"
    );
    expect(lockDoc).toContain("PR #58 device QA status: Completed on real devices");
    expect(lockDoc).toContain(
      "PR #59 evidence ceiling: Integration/Proxy E2E evidence present; true deployed browser E2E absent."
    );
  });

  it("keeps the recommended RC verdict explicit and conservative", () => {
    const lockDoc = readProjectFile(lockDocPath);
    const verdictLines = lockDoc
      .split(/\r?\n/)
      .filter((line) => line.startsWith("Recommended RC verdict"));

    expect(verdictLines).toEqual([
      "Recommended RC verdict (Recommended - pending founder finalization): NOT RC READY"
    ]);
    expect(lockDoc).toContain("V1 is not public launch ready.");
    expect(lockDoc).toContain("Next step: PR #61 Soft Launch / Real Shop Pilot Prep");
  });

  it("does not publish affirmative release-readiness claims in the docs", () => {
    const docs = [lockDocPath, riskRegisterPath, commandsDocPath];
    const guardedPhrases = [
      {
        phrase: "public launch ready",
        allowedOnLine: [/V1 is not public launch ready\./]
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
        allowedOnLine: [/not real payments verified/i]
      },
      {
        phrase: "guaranteed ready",
        allowedOnLine: [/not guaranteed ready/i]
      }
    ];

    for (const docPath of docs) {
      const lines = readProjectFile(docPath).split(/\r?\n/);

      for (const line of lines) {
        for (const guard of guardedPhrases) {
          if (!line.toLowerCase().includes(guard.phrase)) {
            continue;
          }

          expect(
            guard.allowedOnLine.some((pattern) => pattern.test(line)),
            `${docPath} contains an unqualified claim: ${line}`
          ).toBe(true);
        }
      }
    }
  });

  it("does not mark open risks as founder accepted", () => {
    const riskRegister = readProjectFile(riskRegisterPath);

    expect(riskRegister).not.toMatch(/\|\s*founder-accepted\s*\|/i);
    expect(riskRegister).not.toMatch(/\|\s*accepted\s*\|/i);
    expect(riskRegister).toContain("No risk in this register is pre-accepted by the founder.");
  });

  it("keeps raw backend and provider labels out of release QA docs", () => {
    const docs = [lockDocPath, riskRegisterPath, commandsDocPath];
    const forbiddenLabels =
      /service_role|stripe_customer_id|payment_intent|payout_readiness_status|account_entitlements/i;

    for (const docPath of docs) {
      expect(readProjectFile(docPath), docPath).not.toMatch(forbiddenLabels);
    }
  });

  it("keeps the lock scoped to docs and this unit guard", () => {
    const commandsDoc = readProjectFile(commandsDocPath);

    expect(commandsDoc).toContain("Expected result: documentation and PR #60 unit guard only.");
    expect(commandsDoc).toContain("Expected result: no output.");
  });
});

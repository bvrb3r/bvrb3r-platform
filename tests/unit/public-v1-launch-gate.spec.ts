import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const launchDocs = {
  gate: "docs/launch/public-v1-launch-gate.md",
  blockers: "docs/launch/public-v1-blocker-register.md",
  evidence: "docs/launch/public-v1-evidence-checklist.md",
  policy: "docs/launch/public-v1-policy-checklist.md"
} as const;

function readDoc(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function nonEmptyLines(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function isAllowedForbiddenPhraseLine(line: string, phrase: string) {
  const normalized = line.toLowerCase();

  if (phrase === "public launch ready") {
    return normalized.includes("not public launch ready")
      || normalized.includes("no public launch claim");
  }

  if (phrase === "production launch ready") {
    return normalized.includes("not production launch ready")
      || normalized.includes("no production launch claim");
  }

  if (phrase === "real users ready") {
    return normalized.includes("not real users ready")
      || normalized.includes("no real users ready");
  }

  if (phrase === "real payments verified") {
    return normalized.includes("real payments not verified")
      || normalized.includes("no real payments verified")
      || normalized.includes("not real payments verified")
      || normalized.includes("evidence-checklist");
  }

  if (phrase === "guaranteed") {
    return normalized.includes("not guaranteed")
      || normalized.includes("no guarantee");
  }

  return false;
}

describe("public V1 launch gate", () => {
  it("creates all required launch gate documents", () => {
    for (const relativePath of Object.values(launchDocs)) {
      expect(existsSync(path.join(repoRoot, relativePath)), relativePath).toBe(true);
    }
  });

  it("uses exactly one allowed recommended public launch verdict", () => {
    const gate = readDoc(launchDocs.gate);
    const verdictLines = nonEmptyLines(gate).filter((line) => line.startsWith("Recommended verdict"));

    expect(verdictLines).toHaveLength(1);
    expect(verdictLines[0]).toMatch(/Recommended verdict \(Recommended - pending founder authorization\): PUBLIC V1 (READY|NOT READY)$/);
    expect(verdictLines[0]).toBe("Recommended verdict (Recommended - pending founder authorization): PUBLIC V1 NOT READY");
  });

  it("records founder authorization and founder inputs", () => {
    const gate = readDoc(launchDocs.gate);

    expect(gate).toContain("pending founder authorization");
    expect(gate).toContain("Founder final decision: Pending.");
    expect(gate).toContain("RC gap closure status | Still open");
    expect(gate).toContain("Pilot execution status | Not executed");
    expect(gate).toContain("Live Stripe evidence status | Not verified");
    expect(gate).toContain("No `docs/evidence/**` directory was present during this sprint.");
  });

  it("carries the expected first-run context from PR 60 and PR 61", () => {
    const gate = readDoc(launchDocs.gate);

    expect(gate).toContain("PR #60 recommended RC verdict: NOT RC READY");
    expect(gate).toContain("PR #61 pilot readiness: PILOT PACKAGE READY — EXECUTION PENDING RC EVIDENCE");
    expect(gate).toContain("V1 is not public launch ready; pilot execution is gated on RC evidence closure.");
    expect(gate).toContain("Pilot test accounts must never be connected to live Stripe payment movement.");
    expect(gate).toContain("PR #57 decision: Parked Post-RC Item");
    expect(gate).toContain("PR #58 device QA: Completed on real devices");
    expect(gate).toContain("PR #59 evidence tier: Integration/Proxy E2E only");
  });

  it("includes the required scorecards and launch sections", () => {
    const gate = readDoc(launchDocs.gate);

    for (const heading of [
      "## App Health Scorecard",
      "## Role Readiness Scorecards",
      "## Money / Trust Scorecard",
      "## Paywall / Subscription Scorecard",
      "## Support / Notification Scorecard",
      "## Policy Readiness Scorecard",
      "## Pilot Evidence Status",
      "## Critical Blocker Table",
      "## Public Launch Claim Rule",
      "## Go / No-Go Rule"
    ]) {
      expect(gate).toContain(heading);
    }
  });

  it("creates blocker, evidence, and policy checklists with required external rows", () => {
    const blockers = readDoc(launchDocs.blockers);
    const evidence = readDoc(launchDocs.evidence);
    const policy = readDoc(launchDocs.policy);

    expect(blockers).toContain("LAUNCH-003 | Live Stripe evidence status is Not verified");
    expect(blockers).toContain("LAUNCH-004 | Required policy/legal surfaces are incomplete");
    expect(blockers).toContain("LAUNCH-012 | Public launch claim could be unsupported");

    for (const externalItem of [
      "Vercel production",
      "Production Supabase",
      "Stripe live dashboard",
      "Stripe Connect/payout dashboard",
      "Environment secrets presence",
      "Real-device behavior",
      "Real pilot execution",
      "Real support response behavior"
    ]) {
      expect(evidence).toContain(externalItem);
    }

    for (const policyItem of [
      "Terms",
      "Privacy",
      "Refund/dispute",
      "Cancellation/no-show",
      "Community/content",
      "Barber/shop/client conduct",
      "Support policy",
      "Data/privacy disclosure"
    ]) {
      expect(policy).toContain(policyItem);
    }
  });

  it("classifies policy readiness without authoring legal text", () => {
    const policy = readDoc(launchDocs.policy);
    const gate = readDoc(launchDocs.gate);

    expect(policy).toContain("This file classifies policy readiness only.");
    expect(policy).toContain("It does not author legal or policy");
    expect(gate).toContain("No policy text is authored by this gate.");
    expect(policy).toContain("Founder/legal");
    expect(policy).toContain("ABSENT");
  });

  it("keeps fake public-launch and payment claims out of launch docs", () => {
    const docs = Object.values(launchDocs).map((relativePath) => ({
      relativePath,
      lines: readDoc(relativePath).split(/\r?\n/)
    }));

    const forbiddenPhrases = [
      "public launch ready",
      "production launch ready",
      "real users ready",
      "real payments verified",
      "guaranteed"
    ];

    const violations: string[] = [];

    for (const doc of docs) {
      doc.lines.forEach((line, index) => {
        const lowerLine = line.toLowerCase();

        for (const phrase of forbiddenPhrases) {
          if (!lowerLine.includes(phrase)) continue;
          if (isAllowedForbiddenPhraseLine(line, phrase)) continue;

          violations.push(`${doc.relativePath}:${index + 1}:${line}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("does not expose raw internal backend labels in launch docs", () => {
    const combinedDocs = Object.values(launchDocs).map(readDoc).join("\n");

    expect(combinedDocs).not.toMatch(/service_role|stripe_customer_id|payment_intent|payout_readiness_status|account_entitlements/i);
  });
});

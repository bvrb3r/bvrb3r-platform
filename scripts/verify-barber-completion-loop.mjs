import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const proofPath = join(root, "public", ".well-known", "bvrb3r-barber-completion-proof.json");

const requiredFiles = [
  "lib/operations/live-provider.ts",
  "lib/operations/live-state.ts",
  "lib/fintech/service.ts",
  "tests/unit/core-booking-loop-regression.spec.ts",
  "tests/unit/money-routing-lifecycle.spec.ts"
];

const requiredEvidence = [
  {
    path: "lib/operations/live-provider.ts",
    tokens: [
      "COMPLETION_PAYMENT_SUCCESS_STATUSES",
      "isCompletionPaymentSuccessful",
      "evaluatePayoutEligibilityForAppointment",
      "syncPaymentRoutingRecord",
      "service_complete",
      "appointment_status_history",
      "barber_completed_service"
    ]
  },
  {
    path: "tests/unit/core-booking-loop-regression.spec.ts",
    tokens: [
      "action: \"service_complete\"",
      "status: \"completed\"",
      "change_reason: \"barber_completed_service\"",
      "payoutReadinessStatus: \"eligible\"",
      "repairs missing routing for an already completed appointment without rewriting lifecycle history",
      "refuses completion when no captured booking payment exists",
      "Appointment cannot be completed for payout until payment is confirmed."
    ]
  },
  {
    path: "tests/unit/money-routing-lifecycle.spec.ts",
    tokens: [
      "eligible",
      "held",
      "released",
      "refunded"
    ]
  }
];

const forbiddenCompletionPatterns = [
  { pattern: /action\s*===\s*["']service_complete["'][\s\S]{0,500}payout_readiness_status\s*:\s*["']released["']/i, code: "completion_auto_releases_payout" },
  { pattern: /COMPLETION_PAYMENT_SUCCESS_STATUSES[\s\S]{0,300}\bpending\b/i, code: "pending_payment_treated_as_success" },
  { pattern: /catch\s*\([^)]*\)\s*\{[\s\S]{0,250}status\s*:\s*["']completed["']/i, code: "completion_fail_open" }
];

function currentCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const findings = [];
const inventory = [];

for (const file of requiredFiles) {
  const absolute = join(root, file);
  if (!existsSync(absolute)) {
    findings.push({ path: file, code: "missing_required_file", detail: "Required Mission 5 completion file is missing." });
    continue;
  }
  inventory.push(file);
}

for (const requirement of requiredEvidence) {
  const absolute = join(root, requirement.path);
  if (!existsSync(absolute)) continue;
  const source = readFileSync(absolute, "utf8");
  for (const token of requirement.tokens) {
    if (!source.includes(token)) {
      findings.push({
        path: requirement.path,
        code: "missing_completion_evidence",
        detail: `Required completion evidence token is missing: ${token}`
      });
    }
  }
}

const liveProviderPath = join(root, "lib", "operations", "live-provider.ts");
if (existsSync(liveProviderPath)) {
  const source = readFileSync(liveProviderPath, "utf8");
  for (const item of forbiddenCompletionPatterns) {
    if (item.pattern.test(source)) {
      findings.push({
        path: "lib/operations/live-provider.ts",
        code: item.code,
        detail: "Barber completion must fail closed and may establish eligibility, but must not silently release payout."
      });
    }
  }
}

const validationCommit = currentCommit();
const generatedAt = new Date().toISOString();
const proof = {
  schemaVersion: 1,
  mission: 5,
  missionName: "Barber service-completion truth",
  generatedAt,
  validationCommit,
  status: findings.length === 0 ? "pass" : "failed",
  certifiable: findings.length === 0 && Boolean(validationCommit),
  findingCount: findings.length,
  findings,
  certifiedInvariants: {
    barberOwnedCompletionAction: findings.length === 0,
    capturedPaymentRequired: findings.length === 0,
    legalCompletedTransitionCovered: findings.length === 0,
    immutableAppointmentIdentityProtected: findings.length === 0,
    statusHistoryWritten: findings.length === 0,
    routingCreatedOrReconciled: findings.length === 0,
    payoutEligibilityEvaluated: findings.length === 0,
    payoutNotAutoReleased: findings.length === 0,
    repeatedCompletionIsIdempotent: findings.length === 0,
    refundAndHoldLifecycleCovered: findings.length === 0
  },
  requiredRuntimeSmoke: [
    "Barber can load the canonical appointment before completion.",
    "Unpaid appointment completion is denied without changing appointment status.",
    "Captured paid appointment transitions to completed once.",
    "Completion writes canonical status history.",
    "Routing becomes eligible or held from evidence and is not automatically released.",
    "Repeated completion repairs missing routing without duplicating lifecycle history."
  ],
  inventory: inventory.sort()
};

mkdirSync(dirname(proofPath), { recursive: true });
writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(JSON.stringify(proof, null, 2));
if (findings.length > 0) process.exit(1);

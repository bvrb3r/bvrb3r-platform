import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildMoneyReadinessProof,
  moneyProofMatchesCommit,
  type MoneyReadinessProof
} from "@/lib/release/money-readiness-proof";
import type { V1CertificationGate } from "@/lib/release/v1-certification";

const STATIC_PROOF_PATH = join(
  process.cwd(),
  "public",
  ".well-known",
  "bvrb3r-money-readiness-proof.json"
);

function runtimeCommit() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim()
    || process.env.GITHUB_SHA?.trim()
    || null;
}

async function readStaticProof(): Promise<MoneyReadinessProof | null> {
  try {
    const raw = await readFile(STATIC_PROOF_PATH, "utf8");
    return JSON.parse(raw) as MoneyReadinessProof;
  } catch {
    return null;
  }
}

function findingEvidence(prefix: string, findings: Array<{ metric: string; value: number }>) {
  return findings.map((finding) => `${prefix}: ${finding.metric}=${finding.value}`);
}

export async function buildMoneyTruthCertificationGate(): Promise<V1CertificationGate> {
  const commit = runtimeCommit();
  const staticProof = await readStaticProof();
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return {
      id: "money-truth",
      label: "Payment, routing, refund, dispute, and payout truth",
      owner: "Finance",
      status: "needs_review",
      summary: "Live money certification could not run because the server-side Supabase client is unavailable.",
      evidence: staticProof ? ["A build-time proof file exists, but live database confirmation is unavailable."] : [],
      remediation: ["Restore server-side Supabase configuration and rerun the Mission 2 certification."],
      requiredTests: ["payment-routing-completion-regression", "refund-reversal", "webhook-idempotency"]
    };
  }

  const result = await supabase.rpc("bvrb3r_v1_money_readiness_snapshot");
  const liveProof = buildMoneyReadinessProof({
    snapshot: result.error ? null : result.data,
    validationCommit: commit,
    validationSource: "live production bvrb3r_v1_money_readiness_snapshot RPC"
  });
  const staticCommitMatch = moneyProofMatchesCommit(staticProof, commit);
  const evidence = [
    `Runtime commit: ${commit ?? "missing"}.`,
    `Live snapshot status: ${liveProof.status}.`,
    `Build-time proof status: ${staticProof?.status ?? "missing"}.`,
    `Build-time proof matches runtime commit: ${staticCommitMatch ? "yes" : "no"}.`,
    ...findingEvidence("Critical", liveProof.criticalFindings),
    ...findingEvidence("Review", liveProof.reviewFindings)
  ];

  if (result.error) {
    return {
      id: "money-truth",
      label: "Payment, routing, refund, dispute, and payout truth",
      owner: "Finance",
      status: "failed",
      summary: "The live production money snapshot RPC failed.",
      evidence: [...evidence, `RPC error: ${result.error.message}`],
      remediation: ["Repair the aggregate-only money snapshot RPC before certifying any payout state."],
      requiredTests: ["payment-routing-completion-regression", "refund-reversal", "webhook-idempotency"]
    };
  }

  if (liveProof.status === "failed") {
    return {
      id: "money-truth",
      label: "Payment, routing, refund, dispute, and payout truth",
      owner: "Finance",
      status: "critical_failed",
      summary: "One or more live money invariants are failing. Payout release must remain blocked for affected records.",
      evidence,
      remediation: [
        "Run the read-only reconciliation plan.",
        "Resolve each refund, dispute, routing, settlement, connected-account, or failed-payout finding from canonical records.",
        "Rerun certification and require a zero-blocker snapshot."
      ],
      requiredTests: ["payment-routing-completion-regression", "refund-reversal", "webhook-idempotency"]
    };
  }

  if (!liveProof.certifiable || !staticCommitMatch) {
    return {
      id: "money-truth",
      label: "Payment, routing, refund, dispute, and payout truth",
      owner: "Finance",
      status: "needs_review",
      summary: "Live money state is not yet backed by a passing proof from the exact deployed commit.",
      evidence: [...evidence, ...liveProof.reasons],
      remediation: [
        "Generate the money proof during the production build.",
        "Resolve all processor and webhook review findings.",
        "Deploy the exact proof-bearing commit and rerun the live gate."
      ],
      requiredTests: ["payment-routing-completion-regression", "refund-reversal", "webhook-idempotency"]
    };
  }

  return {
    id: "money-truth",
    label: "Payment, routing, refund, dispute, and payout truth",
    owner: "Finance",
    status: "pass",
    summary: "Live payment, routing, refund, dispute, payout, connected-account, and webhook invariants are zero-blocker and commit-bound.",
    evidence,
    remediation: [],
    requiredTests: ["payment-routing-completion-regression", "refund-reversal", "webhook-idempotency"]
  };
}

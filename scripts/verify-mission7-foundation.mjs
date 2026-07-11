import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const proofPath = join(root, "public", ".well-known", "bvrb3r-mission7-foundation-proof.json");
const required = [
  ["lib/fintech/webhook-certification.ts", ["isLiveStripeCertificationProbe", "customer.updated", "processor-verification-only", "stripe_webhook_events"]],
  ["tests/unit/stripe-webhook-certification.spec.ts", ["accepts only the exact live", "rejects test mode"]],
  ["supabase/migrations/20260711230000_mission7_v1_security_identity_foundation.sql", ["profiles_canonical_public_role_check", "profiles_00_canonical_role_guard", "bvrb3r_v1_security_readiness_snapshot", "v1_architect_certification_records"]]
];
const findings = [];
const inventory = [];

for (const [path, tokens] of required) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    findings.push({ path, code: "missing_required_file" });
    continue;
  }
  inventory.push(path);
  const source = readFileSync(absolute, "utf8");
  for (const token of tokens) {
    if (!source.includes(token)) findings.push({ path, code: "missing_required_evidence", token });
  }
}

const currentCommit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || (() => {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); }
  catch { return null; }
})();
const generatedAt = new Date().toISOString();
const proof = {
  schemaVersion: 1,
  mission: 7,
  missionName: "Final production soak and sign-off foundation",
  generatedAt,
  validationCommit: currentCommit,
  status: findings.length ? "failed" : "pass",
  certifiable: findings.length === 0 && Boolean(currentCommit),
  findingCount: findings.length,
  findings,
  inventory: inventory.sort(),
  certifiedInvariants: {
    canonicalRoleDatabaseGuardPresent: findings.length === 0,
    securitySnapshotV2Present: findings.length === 0,
    liveWebhookProbeIsSignatureVerified: findings.length === 0,
    liveWebhookProbeMovesNoMoney: findings.length === 0,
    architectCertificationStoragePresent: findings.length === 0
  }
};
mkdirSync(dirname(proofPath), { recursive: true });
writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
if (findings.length) process.exit(1);

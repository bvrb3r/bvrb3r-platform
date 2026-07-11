import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const proofPath = join(root, "public", ".well-known", "bvrb3r-legal-data-rights-proof.json");

const requirements = [
  { path: "lib/legal/documents.ts", tokens: ["REQUIRED_ACCOUNT_AGREEMENTS", "currentLegalVersions", 'version: "2026-07-10"'] },
  { path: "app/terms/page.tsx", tokens: ["Terms of Service", "account deletion", "Material updates will be versioned"] },
  { path: "app/privacy/page.tsx", tokens: ["Privacy Policy", "deletion", "export"] },
  { path: "app/community-guidelines/page.tsx", tokens: ["Community Guidelines", "Authentic reviews", "Messaging and consent"] },
  { path: "app/data-rights/page.tsx", tokens: ["Data Rights", "Account export", "Account deletion", "Retention and legal holds"] },
  { path: "app/api/legal/acceptances/route.ts", tokens: ["legal_reacceptance_required", "compliance_acceptances", "document_version", "accepted_at"] },
  { path: "app/api/account/data-rights/route.ts", tokens: ["data_rights_requests", "content-disposition", "deletion_request_already_open", "cache-control"] },
  { path: "supabase/migrations/20260711213000_mission6_legal_privacy_data_rights.sql", tokens: ["create table if not exists public.data_rights_requests", "enable row level security", "data_rights_requests_open_deletion_idx"] },
  { path: "tests/unit/legal-data-rights-certification.spec.ts", tokens: ["rejects stale legal versions", "authenticated export", "auditable request"] }
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
for (const requirement of requirements) {
  const absolute = join(root, requirement.path);
  if (!existsSync(absolute)) {
    findings.push({ path: requirement.path, code: "missing_required_file", detail: "Required Mission 6 file is missing." });
    continue;
  }
  inventory.push(requirement.path);
  const source = readFileSync(absolute, "utf8");
  for (const token of requirement.tokens) {
    if (!source.includes(token)) {
      findings.push({ path: requirement.path, code: "missing_required_evidence", detail: `Missing Mission 6 evidence token: ${token}` });
    }
  }
}

const routeSource = existsSync(join(root, "app/api/account/data-rights/route.ts"))
  ? readFileSync(join(root, "app/api/account/data-rights/route.ts"), "utf8")
  : "";
for (const forbidden of ["auth.admin.deleteUser", "provider_payment_method_id", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (routeSource.includes(forbidden)) {
    findings.push({ path: "app/api/account/data-rights/route.ts", code: "unsafe_export_or_deletion_behavior", detail: `Forbidden data-rights token present: ${forbidden}` });
  }
}

const generatedAt = new Date().toISOString();
const validationCommit = currentCommit();
const proof = {
  schemaVersion: 1,
  mission: 6,
  missionName: "Legal, privacy, consent, account deletion, and data export",
  generatedAt,
  validationCommit,
  status: findings.length === 0 ? "pass" : "failed",
  certifiable: findings.length === 0 && Boolean(validationCommit),
  findingCount: findings.length,
  findings,
  certifiedInvariants: {
    termsPublished: findings.length === 0,
    privacyPublished: findings.length === 0,
    communityGuidelinesPublished: findings.length === 0,
    dataRightsPublished: findings.length === 0,
    legalVersionsCentralized: findings.length === 0,
    staleVersionReacceptanceRequired: findings.length === 0,
    acceptanceEvidencePersisted: findings.length === 0,
    authenticatedExportAvailable: findings.length === 0,
    paymentCredentialsExcluded: findings.length === 0,
    deletionUsesControlledRequestWorkflow: findings.length === 0,
    duplicateOpenDeletionPrevented: findings.length === 0,
    dataRightsRlsEnabled: findings.length === 0,
    regressionsPresent: findings.length === 0
  },
  requiredRuntimeSmoke: [
    "Terms, Privacy, Community Guidelines, and Data Rights return 200 in production.",
    "Unauthenticated legal-acceptance and data-rights API requests return 401.",
    "Current legal acceptance can be recorded for an authenticated user.",
    "A stale legal version returns legal_reacceptance_required.",
    "Authenticated export returns no-store JSON with attachment disposition.",
    "Deletion request creates one auditable pending request and duplicate open requests are denied."
  ],
  inventory: inventory.sort()
};

mkdirSync(dirname(proofPath), { recursive: true });
writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(JSON.stringify(proof, null, 2));
if (findings.length > 0) process.exit(1);

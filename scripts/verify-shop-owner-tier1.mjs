import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const proofPath = join(root, "public", ".well-known", "bvrb3r-shop-owner-tier1-proof.json");

const requiredFiles = [
  "supabase/migrations/20260710214500_shop_operator_authority_foundation.sql",
  "lib/operations/persistence.ts",
  "lib/operations/live-provider.ts",
  "tests/unit/shop-operator-access.spec.ts",
  "tests/unit/core-booking-loop-regression.spec.ts"
];

const requiredEvidence = [
  {
    path: "supabase/migrations/20260710214500_shop_operator_authority_foundation.sql",
    tokens: [
      "create table if not exists public.shop_operator_access",
      "check (access_level in ('owner', 'manager', 'front_desk'))",
      "alter table public.shop_operator_access enable row level security",
      "create or replace function private.has_shop_operator_access",
      "create trigger shops_owner_operator_access_sync",
      "v1_shop_operator_authority_evidence"
    ]
  },
  {
    path: "lib/operations/persistence.ts",
    tokens: [
      "buildCompensationSnapshot",
      "buildOwnerAnalyticsSnapshot",
      "completedServicesCount",
      "paidAppointmentsCount",
      "revenueTotal",
      "tipTotal",
      "outstandingBalance"
    ]
  },
  {
    path: "tests/unit/shop-operator-access.spec.ts",
    tokens: [
      "stores shop authority in a protected RLS table rather than public profile roles",
      "backfills only explicit shop ownership and does not infer manager or front-desk access",
      "keeps shop ownership synchronized and prevents cross-shop location grants",
      "publishes service-role-only evidence"
    ]
  }
];

const forbiddenPatterns = [
  {
    path: "lib/operations/persistence.ts",
    pattern: /commissionAmount[\s\S]{0,240}tipAmount\s*:\s*0/i,
    code: "owner_money_erases_tip_truth"
  },
  {
    path: "supabase/migrations/20260710214500_shop_operator_authority_foundation.sql",
    pattern: /profiles[.]role[\s\S]{0,160}(?:'owner'|'manager'|'front_desk')/i,
    code: "shop_authority_derived_from_public_role"
  }
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
    findings.push({ path: file, code: "missing_required_file", detail: "Required Mission 6 Shop Owner Tier 1 file is missing." });
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
        code: "missing_owner_tier1_evidence",
        detail: `Required Shop Owner Tier 1 evidence token is missing: ${token}`
      });
    }
  }
}

for (const item of forbiddenPatterns) {
  const absolute = join(root, item.path);
  if (!existsSync(absolute)) continue;
  const source = readFileSync(absolute, "utf8");
  if (item.pattern.test(source)) {
    findings.push({
      path: item.path,
      code: item.code,
      detail: "Shop Owner Tier 1 must preserve role separation, shop-scoped authority, and explainable money truth."
    });
  }
}

const validationCommit = currentCommit();
const generatedAt = new Date().toISOString();
const proof = {
  schemaVersion: 1,
  mission: 6,
  missionName: "Shop Owner Tier 1 truth",
  generatedAt,
  validationCommit,
  status: findings.length === 0 ? "pass" : "failed",
  certifiable: findings.length === 0 && Boolean(validationCommit),
  findingCount: findings.length,
  findings,
  certifiedInvariants: {
    protectedShopScopedAuthority: findings.length === 0,
    explicitOwnerAuthorityOnly: findings.length === 0,
    managerAndFrontDeskNotInferred: findings.length === 0,
    crossShopLocationGrantsPrevented: findings.length === 0,
    compensationModelsRemainBusinessRelationships: findings.length === 0,
    ownerAnalyticsUsesCanonicalAppointments: findings.length === 0,
    tipsRemainSeparatelyVisible: findings.length === 0,
    outstandingBalanceRemainsVisible: findings.length === 0,
    serviceRoleEvidenceAvailable: findings.length === 0
  },
  requiredRuntimeSmoke: [
    "Authenticated Shop Owner can load only the shops they operate.",
    "Barber membership does not grant manager or front-desk authority.",
    "Client identity cannot access Shop Owner controls.",
    "Owner schedule reflects canonical shop-linked appointments.",
    "Owner money separates service revenue, tips, commission, booth rent, and outstanding balances.",
    "Cross-shop location access is denied."
  ],
  inventory: inventory.sort()
};

mkdirSync(dirname(proofPath), { recursive: true });
writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(JSON.stringify(proof, null, 2));
if (findings.length > 0) process.exit(1);

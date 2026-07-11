import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const proofPath = join(root, "public", ".well-known", "bvrb3r-deployment-regression-proof.json");

const commands = [
  { label: "lint", command: "npm run lint" },
  { label: "typecheck", command: "npm run typecheck" },
  {
    label: "identity, booking, money, owner, kiosk, legal, public conversion, and Architect regression tests",
    command:
      "npx vitest run tests/unit/internal-operator-access.spec.ts tests/unit/shop-operator-access.spec.ts tests/unit/kiosk-mode-screen.spec.tsx tests/unit/kiosk-service-eligibility.spec.ts tests/unit/fintech-domain.spec.ts tests/unit/money-routing-lifecycle.spec.ts tests/unit/money-routing-service-contract.spec.ts tests/unit/core-booking-loop-regression.spec.ts tests/unit/money-readiness-proof.spec.ts tests/unit/marketplace-discover-route.spec.ts tests/unit/public-conversion-routes.spec.ts tests/unit/post-auth-return.spec.ts tests/unit/architect-mission-control-foundation.spec.ts tests/unit/architect-mission-control.spec.tsx tests/unit/architect-incident-detection.spec.ts tests/unit/legal-data-rights-certification.spec.ts",
    env: {
      NODE_ENV: "test",
      VITEST: "true"
    }
  },
  { label: "public discovery and conversion source audit", command: "npm run verify:public-conversion" },
  { label: "client booking truth certification", command: "npm run verify:client-booking" },
  { label: "barber service-completion truth certification", command: "npm run verify:barber-completion" },
  { label: "Shop Owner Tier 1 truth certification", command: "npm run verify:shop-owner-tier1" },
  { label: "Shop Owner and kiosk loop certification", command: "npm run verify:owner-kiosk" },
  { label: "legal, privacy, consent, deletion, and export certification", command: "npm run verify:legal-data-rights" },
  { label: "aggregate-only production money proof", command: "npm run verify:money" }
];

function currentCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

for (const item of commands) {
  console.log(`[verify:deployment] running ${item.label}`);
  const result = spawnSync(item.command, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...item.env }
  });

  if (result.status !== 0) {
    console.error(`[verify:deployment] ${item.label} failed`);
    process.exit(result.status ?? 1);
  }
}

const generatedAt = new Date().toISOString();
const validationCommand = commands.map((item) => item.command).join(" && ");
const proof = {
  schemaVersion: 8,
  generatedAt,
  validationTimestamp: generatedAt,
  validationCommit: currentCommit(),
  validationSource: "package.json prebuild -> verify:deployment",
  validationCommand,
  regressionSuiteName: "identity-client-booking-barber-completion-shop-owner-kiosk-legal-data-rights-money-public-conversion-and-architect-mandatory-regression",
  regressionTestCount: null,
  lintStatus: "pass",
  typecheckStatus: "pass",
  targetedTestStatus: "pass",
  clientBookingProofPath: "/.well-known/bvrb3r-client-booking-proof.json",
  barberCompletionProofPath: "/.well-known/bvrb3r-barber-completion-proof.json",
  shopOwnerTier1ProofPath: "/.well-known/bvrb3r-shop-owner-tier1-proof.json",
  ownerKioskProofPath: "/.well-known/bvrb3r-owner-kiosk-proof.json",
  legalDataRightsProofPath: "/.well-known/bvrb3r-legal-data-rights-proof.json",
  moneyProofPath: "/.well-known/bvrb3r-money-readiness-proof.json",
  publicConversionProofPath: "/.well-known/bvrb3r-public-conversion-proof.json"
};

mkdirSync(dirname(proofPath), { recursive: true });
writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(`[verify:deployment] wrote ${proofPath}`);

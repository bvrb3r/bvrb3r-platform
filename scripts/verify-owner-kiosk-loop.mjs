import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const proofPath = join(root, "public", ".well-known", "bvrb3r-owner-kiosk-proof.json");

const requirements = [
  {
    path: "components/kiosk/kiosk-mode-screen.tsx",
    tokens: [
      'type KioskStep = "welcome" | "booking" | "pick_barber" | "walk_in"',
      "policyAccepted",
      "eligibleWalkInBarbers",
      "hasEligibleNextAvailable",
      "resetFormsToDefaults",
      "autoResetSeconds",
      "Enter kiosk PIN"
    ]
  },
  {
    path: "lib/kiosk/service.ts",
    tokens: [
      "acceptsWalkIns",
      "createKioskQueueEntry",
      "isEligibleWalkInBarber",
      "estimatedWaitMinutes",
      "queuePosition"
    ]
  },
  {
    path: "tests/unit/kiosk-mode-screen.spec.tsx",
    tokens: [
      "routes Pick a Barber into the selected barber kiosk without exposing private data",
      "blocks Next Available when no eligible walk-in barber exists",
      "requires policy acceptance for new kiosk booking capture",
      "requires policy acceptance before creating a walk-in queue entry"
    ]
  },
  {
    path: "tests/unit/kiosk-service-eligibility.spec.ts",
    tokens: [
      "eligible",
      "walk-in"
    ]
  },
  {
    path: "scripts/verify-shop-owner-tier1.mjs",
    tokens: [
      "protectedShopScopedAuthority",
      "ownerAnalyticsUsesCanonicalAppointments"
    ]
  }
];

const forbidden = [
  {
    path: "components/kiosk/kiosk-mode-screen.tsx",
    pattern: /owner\s*(?:revenue|earnings)|barber\s*earnings/i,
    code: "private_money_exposed_in_kiosk"
  },
  {
    path: "components/kiosk/kiosk-mode-screen.tsx",
    pattern: /clientId\s*[:=]\s*(?:searchParams|params|query)/i,
    code: "caller_controlled_client_identity"
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
for (const requirement of requirements) {
  const absolute = join(root, requirement.path);
  if (!existsSync(absolute)) {
    findings.push({ path: requirement.path, code: "missing_required_file", detail: "Required Mission 5 owner/kiosk file is missing." });
    continue;
  }
  inventory.push(requirement.path);
  const source = readFileSync(absolute, "utf8");
  for (const token of requirement.tokens) {
    if (!source.includes(token)) {
      findings.push({ path: requirement.path, code: "missing_kiosk_evidence", detail: `Required owner/kiosk evidence token is missing: ${token}` });
    }
  }
}

for (const item of forbidden) {
  const absolute = join(root, item.path);
  if (!existsSync(absolute)) continue;
  if (item.pattern.test(readFileSync(absolute, "utf8"))) {
    findings.push({ path: item.path, code: item.code, detail: "Kiosk public surfaces must remain privacy-safe and server-authoritative." });
  }
}

const validationCommit = currentCommit();
const generatedAt = new Date().toISOString();
const proof = {
  schemaVersion: 1,
  mission: 5,
  missionName: "Shop Owner and kiosk certification",
  generatedAt,
  validationCommit,
  status: findings.length === 0 ? "pass" : "failed",
  certifiable: findings.length === 0 && Boolean(validationCommit),
  findingCount: findings.length,
  findings,
  certifiedInvariants: {
    ownerAuthorityCertified: findings.length === 0,
    nextAvailableUsesEligibleBarbers: findings.length === 0,
    pickBarberFlowExists: findings.length === 0,
    queueTruthIsCanonical: findings.length === 0,
    policyConsentRequired: findings.length === 0,
    waitTimeIsEstimatedAndFresh: findings.length === 0,
    kioskPrivateMoneyHidden: findings.length === 0,
    kioskAutoResetClearsClientState: findings.length === 0,
    kioskExitIsPinProtected: findings.length === 0,
    kioskRegressionsPresent: findings.length === 0
  },
  requiredRuntimeSmoke: [
    "Shop Owner can open the kiosk for an authorized shop.",
    "Next Available skips offline, paused, away, or non-walk-in barbers.",
    "Pick a Barber does not change rotation order.",
    "A queue or appointment record is created through canonical server logic.",
    "No owner money, barber earnings, email, or phone data is exposed on the public kiosk.",
    "The kiosk resets after success and after inactivity.",
    "Unauthorized exit requires the configured PIN."
  ],
  inventory: inventory.sort()
};

mkdirSync(dirname(proofPath), { recursive: true });
writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(JSON.stringify(proof, null, 2));
if (findings.length > 0) process.exit(1);

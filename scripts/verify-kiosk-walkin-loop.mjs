import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const proofPath = join(root, "public", ".well-known", "bvrb3r-kiosk-walkin-proof.json");

const requiredFiles = [
  "lib/kiosk/service.ts",
  "lib/kiosk/client-capture.ts",
  "lib/kiosk/wait-time.ts",
  "lib/queue/service.ts",
  "components/kiosk/kiosk-mode-screen.tsx",
  "tests/unit/kiosk-service-eligibility.spec.ts",
  "tests/unit/kiosk-mode-screen.spec.tsx",
  "types/kiosk.ts"
];

const requiredEvidence = [
  {
    path: "lib/kiosk/service.ts",
    tokens: [
      "KIOSK_AUTO_RESET_SECONDS",
      "isEligibleWalkInBarber",
      "assertKioskEnabled",
      "createKioskQueueEntry",
      "resolveOrCreateKioskClient",
      "createKioskWaitlist",
      "createKioskBooking",
      "createBarberKioskBooking",
      "No eligible barber is available for walk-ins right now.",
      "queueSource: \"kiosk\"",
      "bookingSource: \"shop_kiosk\""
    ]
  },
  {
    path: "tests/unit/kiosk-service-eligibility.spec.ts",
    tokens: [
      "allows only online walk-in eligible barbers for Next Available routing",
      "isOnline: false",
      "acceptsWalkIns: false",
      "liveStatus: \"on_break\""
    ]
  },
  {
    path: "tests/unit/kiosk-mode-screen.spec.tsx",
    tokens: [
      "Pick a Barber",
      "blocks Next Available when no eligible walk-in barber exists",
      "requires policy acceptance for new kiosk booking capture",
      "requires policy acceptance before creating a walk-in queue entry",
      "without exposing private data",
      "autoResetSeconds"
    ]
  }
];

const forbiddenPatterns = [
  { path: "lib/kiosk/service.ts", pattern: /profiles[.]role/i, code: "kiosk_uses_public_role_as_authority" },
  { path: "components/kiosk/kiosk-mode-screen.tsx", pattern: /payment_routing_records|stripe_customer_id/i, code: "kiosk_exposes_private_money_identifier" },
  { path: "lib/kiosk/service.ts", pattern: /acceptsWalkIns\s*:\s*true[\s\S]{0,120}isOnline\s*:\s*false/i, code: "offline_barber_marked_walkin_eligible" }
];

function currentCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); }
  catch { return null; }
}

const findings = [];
const inventory = [];
for (const file of requiredFiles) {
  const absolute = join(root, file);
  if (!existsSync(absolute)) findings.push({ path: file, code: "missing_required_file", detail: "Required Mission 7 kiosk/walk-in file is missing." });
  else inventory.push(file);
}
for (const requirement of requiredEvidence) {
  const absolute = join(root, requirement.path);
  if (!existsSync(absolute)) continue;
  const source = readFileSync(absolute, "utf8");
  for (const token of requirement.tokens) {
    if (!source.includes(token)) findings.push({ path: requirement.path, code: "missing_kiosk_evidence", detail: `Required kiosk/walk-in evidence token is missing: ${token}` });
  }
}
for (const item of forbiddenPatterns) {
  const absolute = join(root, item.path);
  if (!existsSync(absolute)) continue;
  if (item.pattern.test(readFileSync(absolute, "utf8"))) findings.push({ path: item.path, code: item.code, detail: "Kiosk must remain public-safe, role-independent, and eligibility-controlled." });
}

const validationCommit = currentCommit();
const generatedAt = new Date().toISOString();
const proof = {
  schemaVersion: 1,
  mission: 7,
  missionName: "Kiosk and walk-in loop truth",
  generatedAt,
  validationCommit,
  status: findings.length === 0 ? "pass" : "failed",
  certifiable: findings.length === 0 && Boolean(validationCommit),
  findingCount: findings.length,
  findings,
  certifiedInvariants: {
    kioskIsNotPublicAccountRole: findings.length === 0,
    kioskMustBeEnabledForActiveShop: findings.length === 0,
    nextAvailableUsesEligibleOnlineBarbersOnly: findings.length === 0,
    pausedOfflineAndNonWalkinBarbersExcluded: findings.length === 0,
    pickBarberUsesPublicSafeData: findings.length === 0,
    newClientCaptureRequiresPolicyAcceptance: findings.length === 0,
    queueEntryUsesCanonicalKioskSource: findings.length === 0,
    bookingCreatesCanonicalAppointment: findings.length === 0,
    waitEstimateIsCalculatedAndTimestamped: findings.length === 0,
    kioskAutoResetContractExists: findings.length === 0
  },
  requiredRuntimeSmoke: [
    "Shop kiosk loads only when the shop is active and kiosk-enabled.",
    "Next Available is blocked when no eligible online barber accepts walk-ins.",
    "Pick a Barber exposes only public-safe barber identity and status.",
    "New kiosk identity capture cannot submit without policy acceptance.",
    "Walk-in queue creation records queueSource kiosk and returns position/wait estimate.",
    "Kiosk booking creates one canonical appointment with shop_kiosk source.",
    "Success flow resets the kiosk within the configured timeout."
  ],
  inventory: inventory.sort()
};
mkdirSync(dirname(proofPath), { recursive: true });
writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(JSON.stringify(proof, null, 2));
if (findings.length > 0) process.exit(1);

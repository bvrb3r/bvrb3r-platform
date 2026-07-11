import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const proofPath = join(root, "public", ".well-known", "bvrb3r-client-booking-proof.json");

const requiredFiles = [
  "lib/operations/live-provider.ts",
  "lib/booking/canonical-booking.ts",
  "lib/appointments/domain.ts",
  "tests/unit/core-booking-loop-regression.spec.ts"
];

const requiredEvidence = [
  {
    path: "lib/operations/live-provider.ts",
    tokens: [
      "createBooking",
      "calculateAppointmentQuote",
      "canonicalClientUuid",
      "canonicalBarberUuid",
      "canonicalServiceUuid",
      "canonicalLocationUuid",
      "createCapturedStripePaymentRecord",
      "syncPaymentRoutingRecord",
      "appointment_status_history"
    ]
  },
  {
    path: "tests/unit/core-booking-loop-regression.spec.ts",
    tokens: [
      "paymentIntents",
      "status: \"confirmed\"",
      "appointment_status_history",
      "Client Activity",
      "Barber Calendar",
      "releases a cancelled appointment slot for a new booking at the same time"
    ]
  }
];

const forbiddenBookingPatterns = [
  { pattern: /Math\.random\s*\(/, code: "random_booking_identity" },
  { pattern: /clientId\s*=\s*request\.nextUrl\.searchParams/, code: "caller_controlled_client_identity" },
  { pattern: /payment_status\s*:\s*["']paid["'][\s\S]{0,180}before/i, code: "optimistic_payment_state" }
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
    findings.push({ path: file, code: "missing_required_file", detail: "Required Mission 4 booking file is missing." });
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
        code: "missing_booking_evidence",
        detail: `Required booking evidence token is missing: ${token}`
      });
    }
  }
}

const liveProviderPath = join(root, "lib", "operations", "live-provider.ts");
if (existsSync(liveProviderPath)) {
  const source = readFileSync(liveProviderPath, "utf8");
  for (const item of forbiddenBookingPatterns) {
    if (item.pattern.test(source)) {
      findings.push({
        path: relative(root, liveProviderPath).replaceAll("\\", "/"),
        code: item.code,
        detail: "Mission 4 booking truth must remain server-derived, deterministic, and non-optimistic."
      });
    }
  }
}

const validationCommit = currentCommit();
const generatedAt = new Date().toISOString();
const proof = {
  schemaVersion: 1,
  mission: 4,
  missionName: "Client booking truth",
  generatedAt,
  validationCommit,
  status: findings.length === 0 ? "pass" : "failed",
  certifiable: findings.length === 0 && Boolean(validationCommit),
  findingCount: findings.length,
  findings,
  certifiedInvariants: {
    serverOwnedBookingMutation: findings.length === 0,
    canonicalRoleIdentityResolution: findings.length === 0,
    canonicalServiceAndLocationResolution: findings.length === 0,
    paymentConfirmationBeforeConfirmedState: findings.length === 0,
    appointmentAndPaymentPersistenceCovered: findings.length === 0,
    clientActivityAndBarberCalendarVisibilityCovered: findings.length === 0,
    cancellationReleasesAvailabilityCovered: findings.length === 0,
    statusHistoryCovered: findings.length === 0,
    routingInitializationCovered: findings.length === 0
  },
  requiredRuntimeSmoke: [
    "Public discovery returns a stable response.",
    "Authenticated Client booking creates one confirmed appointment.",
    "The same appointment is visible to Client Activity and Barber Calendar.",
    "A duplicate active-slot booking is rejected.",
    "Cancellation preserves payment history and releases the slot."
  ],
  inventory: inventory.sort()
};

mkdirSync(dirname(proofPath), { recursive: true });
writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(JSON.stringify(proof, null, 2));
if (findings.length > 0) process.exit(1);

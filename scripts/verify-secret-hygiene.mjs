import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

const sensitiveEnvironmentNames = new Set([
  "ANDROID_SIGNING_SHA256",
  "FCM_CLIENT_EMAIL",
  "FCM_PRIVATE_KEY",
  "FCM_SENDER_ID",
  "GOOGLE_MAPS_API_KEY",
  "IOS_KEY_ID",
  "IOS_PRIVATE_KEY",
  "IOS_TEAM_ID",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_PHONE_NUMBER",
  "WEB_PUSH_PRIVATE_KEY"
]);

const sensitiveEnvironmentSuffix =
  /(?:_API_KEY|_AUTH_TOKEN|_CLIENT_SECRET|_CREDENTIAL|_PASSWORD|_PRIVATE_KEY|_SECRET|_SERVICE_ROLE_KEY|_TOKEN)$/;

const privateKeyMarker = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
const credentialPatterns = [
  new RegExp(["sk", "(?:live|test)", "[A-Za-z0-9]{16,}"].join("_")),
  new RegExp(["rk", "live", "[A-Za-z0-9]{16,}"].join("_")),
  new RegExp(["whsec", "[A-Za-z0-9]{16,}"].join("_")),
  new RegExp(["sb", "secret", "[A-Za-z0-9_-]{16,}"].join("_")),
  new RegExp(["ghp", "[A-Za-z0-9]{20,}"].join("_")),
  /AKIA[A-Z0-9]{16}/,
  /AIza[A-Za-z0-9_-]{24,}/
];

function trackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Unable to list tracked files.");
  }

  return result.stdout.split("\0").filter(Boolean);
}

function isPlaceholder(value) {
  const normalized = value
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();

  return (
    normalized === "" ||
    normalized.includes("placeholder") ||
    normalized.startsWith("your-") ||
    normalized.startsWith("your_") ||
    normalized.includes("example.com") ||
    normalized.includes("dummy") ||
    normalized.includes("fake") ||
    normalized.includes("fixture") ||
    normalized.includes("mock") ||
    normalized.includes("test") ||
    normalized.includes("127.0.0.1") ||
    normalized.includes("localhost")
  );
}

function isTextFile(path) {
  const size = statSync(path).size;
  if (size > MAX_TEXT_FILE_BYTES) return false;

  const sample = readFileSync(path).subarray(0, 8_192);
  return !sample.includes(0);
}

const findings = [];

for (const path of trackedFiles()) {
  if (!isTextFile(path)) continue;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    const assignment = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (assignment) {
      const [, name, value] = assignment;
      const sensitiveName =
        sensitiveEnvironmentNames.has(name) || sensitiveEnvironmentSuffix.test(name);

      if (sensitiveName && !isPlaceholder(value)) {
        findings.push(`${path}:${index + 1}:${name}`);
      }
    }

    const safeSample = isPlaceholder(line);
    if (!safeSample && line.includes(privateKeyMarker)) {
      findings.push(`${path}:${index + 1}:private-key-material`);
    }

    if (!safeSample && credentialPatterns.some((pattern) => pattern.test(line))) {
      findings.push(`${path}:${index + 1}:credential-token`);
    }
  });
}

if (findings.length > 0) {
  console.error("Tracked credential material detected:");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log("Secret hygiene check passed: tracked files contain placeholders only.");

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ENV_PATH = path.join(process.cwd(), ".env.local");
const REQUIRED_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET"
];

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return new Map();
  }

  const values = new Map();
  const text = fs.readFileSync(filePath, "utf8");

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    values.set(key, value);
  }

  return values;
}

function resolveStripeExecutable() {
  const configured = process.env.STRIPE_CLI_PATH?.trim();
  if (configured && fs.existsSync(configured)) {
    return configured;
  }

  const home = os.homedir();
  const candidates = [
    path.join(home, "Downloads", "stripe_1.38.1_windows_x86_64", "stripe.exe"),
    path.join(home, "scoop", "shims", "stripe.exe"),
    path.join(home, "AppData", "Roaming", "npm", "stripe.cmd"),
    "stripe.exe",
    "stripe"
  ];

  for (const candidate of candidates) {
    if (candidate.includes("\\") && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates.at(-1) ?? "stripe";
}

function checkStripeCli() {
  const command = resolveStripeExecutable();

  try {
    const output = execFileSync(command, ["version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: process.platform === "win32" && !command.includes("\\")
    }).trim();

    return { ok: true, output, command };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, output: message, command };
  }
}

function maskSecret(secret) {
  if (!secret) {
    return "(missing)";
  }

  if (secret.length <= 10) {
    return secret;
  }

  return `${secret.slice(0, 7)}...${secret.slice(-4)}`;
}

function printSection(title) {
  console.log(`\n${title}`);
}

function main() {
  const env = readEnvFile(ENV_PATH);
  const missingKeys = REQUIRED_KEYS.filter((key) => !env.get(key));
  const stripeCli = checkStripeCli();
  const appUrl = env.get("NEXT_PUBLIC_APP_URL") ?? "";
  const appUrlIsExpected = appUrl === "http://localhost:3000";

  console.log("BVRB3R local QA check");
  console.log(`Env file: ${ENV_PATH}`);

  printSection("Environment");
  for (const key of REQUIRED_KEYS) {
    const value = env.get(key);
    if (key === "STRIPE_SECRET_KEY" || key === "STRIPE_WEBHOOK_SECRET") {
      console.log(`- ${key}: ${value ? maskSecret(value) : "(missing)"}`);
    } else {
      console.log(`- ${key}: ${value ?? "(missing)"}`);
    }
  }

  printSection("QA URLs");
  console.log("- Browser QA: http://localhost:3000");
  console.log("- Stripe webhook: http://localhost:3000/api/stripe/webhook");
  console.log("- Android emulator later: http://10.0.2.2:3000");

  printSection("Stripe CLI");
  if (stripeCli.ok) {
    console.log(`- Installed: ${stripeCli.output}`);
    console.log(`- Command: ${stripeCli.command}`);
  } else {
    console.log(`- Missing or unavailable: ${stripeCli.output}`);
    console.log(`- Command tried: ${stripeCli.command}`);
  }

  printSection("Next steps");
  console.log("- Terminal 1: npm run qa:app");
  console.log("- Terminal 2: npm run qa:stripe");
  console.log("- Verify the app responds on http://localhost:3000 before mobile or Stripe QA");
  console.log("- When qa:stripe starts, copy the printed whsec_... value into .env.local if it changed, then restart the app");

  if (missingKeys.length) {
    console.error(`\nERROR: Missing required .env.local keys: ${missingKeys.join(", ")}`);
    process.exit(1);
  }

  if (!appUrlIsExpected) {
    console.error(`\nERROR: NEXT_PUBLIC_APP_URL must be http://localhost:3000 for local QA. Current value: ${appUrl || "(missing)"}`);
    process.exit(1);
  }

  if (!stripeCli.ok) {
    console.error("\nERROR: Stripe CLI is required for qa:stripe.");
    process.exit(1);
  }

  console.log("\nOK: Local QA check passed");
}

main();

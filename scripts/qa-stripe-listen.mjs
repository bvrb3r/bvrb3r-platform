import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_URL = "http://localhost:3000";
const WEBHOOK_PATH = "/api/stripe/webhook";
const WEBHOOK_URL = `${APP_URL}${WEBHOOK_PATH}`;

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

console.log("BVRB3R Stripe local QA listener");
console.log(`- Forwarding standard Stripe events to ${WEBHOOK_URL}`);
console.log(`- Forwarding Connect events to ${WEBHOOK_URL}`);
console.log("- Keep the app running on http://localhost:3000 in the other terminal");
console.log("- Stripe will print a webhook signing secret below");
console.log("- If the printed whsec_... value changed, update STRIPE_WEBHOOK_SECRET in .env.local and restart the app");

const command = resolveStripeExecutable();
const child = spawn(
  command,
  [
    "listen",
    "--forward-to",
    WEBHOOK_URL,
    "--forward-connect-to",
    WEBHOOK_URL
  ],
  {
    stdio: "inherit",
    shell: process.platform === "win32" && !command.includes("\\"),
    windowsHide: false
  }
);

child.on("error", (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("ERROR: Unable to start Stripe CLI listener.");
  console.error(`Command: ${command}`);
  console.error(message);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

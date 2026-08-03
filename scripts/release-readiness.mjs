import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");

function readEnv(filePath) {
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

    values.set(trimmed.slice(0, separatorIndex).trim(), trimmed.slice(separatorIndex + 1).trim());
  }

  return values;
}

function hasFile(relativePath) {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

function printCheck(label, ok, detail) {
  console.log(`- ${ok ? "OK" : "ATTN"} ${label}: ${detail}`);
}

function main() {
  const env = readEnv(envPath);
  const appUrl = env.get("NEXT_PUBLIC_APP_URL") ?? "";
  const checks = [
    {
      label: "App URL",
      ok: /^https:\/\/|^http:\/\/localhost:3000$/i.test(appUrl),
      detail: appUrl || "(missing)"
    },
    {
      label: "Supabase env",
      ok: Boolean(env.get("NEXT_PUBLIC_SUPABASE_URL") && env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")),
      detail: env.get("NEXT_PUBLIC_SUPABASE_URL") ? "present" : "missing"
    },
    {
      label: "Stripe secrets",
      ok: Boolean(env.get("STRIPE_SECRET_KEY") && env.get("STRIPE_WEBHOOK_SECRET")),
      detail: env.get("STRIPE_SECRET_KEY") && env.get("STRIPE_WEBHOOK_SECRET") ? "present" : "missing"
    },
    {
      label: "Automation secret",
      ok: Boolean(env.get("AUTOMATION_PROCESS_SECRET")),
      detail: env.get("AUTOMATION_PROCESS_SECRET") ? "present" : "missing"
    },
    {
      label: "Android wrapper",
      ok: hasFile("android/app/build.gradle") || hasFile("android/app/build.gradle.kts"),
      detail: "android/app"
    },
    {
      label: "Mobile QA docs",
      ok: hasFile("MOBILE_DEVICE_QA.md") && hasFile("RELEASE_CANDIDATE_CERTIFICATION.md") && hasFile("STORE_LAUNCH_CHECKLIST.md"),
      detail: "MOBILE_DEVICE_QA.md + RELEASE_CANDIDATE_CERTIFICATION.md + STORE_LAUNCH_CHECKLIST.md"
    }
  ];

  console.log("BVRB3R release readiness");
  console.log(`Env file: ${envPath}`);

  for (const check of checks) {
    printCheck(check.label, check.ok, check.detail);
  }

  const attentionCount = checks.filter((check) => !check.ok).length;
  console.log(`\nSummary: ${checks.length - attentionCount} ready, ${attentionCount} attention`);

  if (attentionCount) {
    process.exit(1);
  }
}

main();

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
    label: "targeted regression tests",
    command:
      "npx vitest run tests/unit/internal-operator-access.spec.ts tests/unit/shop-operator-access.spec.ts tests/unit/architect-mission-control-foundation.spec.ts tests/unit/architect-mission-control.spec.tsx tests/unit/architect-incident-detection.spec.ts",
    env: {
      NODE_ENV: "test",
      VITEST: "true"
    }
  }
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
  schemaVersion: 1,
  generatedAt,
  validationTimestamp: generatedAt,
  validationCommit: currentCommit(),
  validationSource: "package.json prebuild -> verify:deployment",
  validationCommand,
  regressionSuiteName: "architect-identity-and-shop-authority-targeted-regression",
  regressionTestCount: null,
  lintStatus: "pass",
  typecheckStatus: "pass",
  targetedTestStatus: "pass"
};

mkdirSync(dirname(proofPath), { recursive: true });
writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(`[verify:deployment] wrote ${proofPath}`);

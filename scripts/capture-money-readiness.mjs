import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const proofPath = join(root, "public", ".well-known", "bvrb3r-money-readiness-proof.json");
const enforce = process.argv.includes("--enforce") || process.env.BVRB3R_ENFORCE_MONEY_READINESS === "true";
const generatedAt = new Date().toISOString();
const validationCommit = process.env.VERCEL_GIT_COMMIT_SHA?.trim()
  || process.env.GITHUB_SHA?.trim()
  || null;

function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function numeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function positiveFindings(value) {
  const record = asRecord(value);
  if (!record) return [];
  return Object.entries(record).flatMap(([metric, rawValue]) => {
    const parsed = numeric(rawValue);
    return parsed !== null && parsed > 0 ? [{ metric, value: parsed }] : [];
  });
}

function normalizeStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pass" || normalized === "ready") return "pass";
  if (["needs_review", "needs review", "warning"].includes(normalized)) return "needs_review";
  if (["fail", "failed", "critical_failed"].includes(normalized)) return "failed";
  return null;
}

function buildProof(snapshot, errorMessage = null) {
  const snapshotRecord = asRecord(snapshot);
  const schemaVersion = snapshotRecord ? numeric(snapshotRecord.schema_version) : null;
  const snapshotStatus = normalizeStatus(snapshotRecord?.status);
  const criticalFindings = positiveFindings(snapshotRecord?.critical);
  const reviewFindings = positiveFindings(snapshotRecord?.review);
  const reasons = [];

  if (errorMessage) reasons.push(errorMessage);
  if (!snapshotRecord) reasons.push("The production money snapshot was unavailable or malformed.");
  if (schemaVersion === null || schemaVersion < 2) reasons.push("The production money snapshot is not on the Mission 2 schema-v2 contract.");
  if (!snapshotStatus) reasons.push("The production money snapshot did not return a recognized status.");
  if (!validationCommit) reasons.push("The proof is not bound to a Git commit.");
  if (criticalFindings.length) reasons.push(`${criticalFindings.length} critical money invariant(s) are failing.`);
  if (reviewFindings.length) reasons.push(`${reviewFindings.length} money evidence item(s) need review.`);

  const certifiable = Boolean(
    snapshotRecord
      && schemaVersion !== null
      && schemaVersion >= 2
      && snapshotStatus === "pass"
      && validationCommit
      && criticalFindings.length === 0
      && reviewFindings.length === 0
  );
  const status = certifiable
    ? "pass"
    : snapshotStatus === "failed" || criticalFindings.length > 0
      ? "failed"
      : "needs_review";

  return {
    schemaVersion: 1,
    generatedAt,
    validationCommit,
    validationSource: "package.json prebuild -> verify:deployment -> bvrb3r_v1_money_readiness_snapshot RPC",
    snapshotSchemaVersion: schemaVersion,
    snapshotGeneratedAt: typeof snapshotRecord?.generated_at === "string" ? snapshotRecord.generated_at : null,
    status,
    certifiable,
    criticalFindings,
    reviewFindings,
    reasons,
    snapshot: snapshotRecord
  };
}

let proof;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceRoleKey) {
  proof = buildProof(null, "Supabase service-role configuration is unavailable to the money certification capture.");
} else {
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const result = await supabase.rpc("bvrb3r_v1_money_readiness_snapshot");
  proof = result.error
    ? buildProof(null, `The production money snapshot RPC failed: ${result.error.message}`)
    : buildProof(result.data);
}

mkdirSync(dirname(proofPath), { recursive: true });
writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(`[verify:money] wrote ${proofPath}`);
console.log(`[verify:money] status=${proof.status} certifiable=${proof.certifiable}`);

if (enforce && !proof.certifiable) {
  console.error("[verify:money] Mission 2 certification failed closed.");
  for (const reason of proof.reasons) console.error(`[verify:money] ${reason}`);
  process.exit(1);
}

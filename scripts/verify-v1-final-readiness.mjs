import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const proofPath = join(root, "public", ".well-known", "bvrb3r-v1-final-certification.json");
const componentProofs = [
  ["public_conversion", "bvrb3r-public-conversion-proof.json"],
  ["client_booking", "bvrb3r-client-booking-proof.json"],
  ["barber_completion", "bvrb3r-barber-completion-proof.json"],
  ["shop_owner", "bvrb3r-shop-owner-tier1-proof.json"],
  ["owner_kiosk", "bvrb3r-owner-kiosk-proof.json"],
  ["legal_data_rights", "bvrb3r-legal-data-rights-proof.json"],
  ["money", "bvrb3r-money-readiness-proof.json"]
];

function currentCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA?.trim()) return process.env.VERCEL_GIT_COMMIT_SHA.trim();
  if (process.env.GITHUB_SHA?.trim()) return process.env.GITHUB_SHA.trim();
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function positiveMetrics(value, prefix = "") {
  const candidate = record(value);
  if (!candidate) return [];
  return Object.entries(candidate).flatMap(([key, raw]) => {
    const metric = prefix ? `${prefix}.${key}` : key;
    const numeric = numberValue(raw);
    if (numeric !== null) return numeric > 0 ? [{ metric, value: numeric }] : [];
    return record(raw) ? positiveMetrics(raw, metric) : [];
  });
}

function statusValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function proofFindingCount(proof) {
  const explicit = numberValue(proof?.findingCount);
  if (explicit !== null) return explicit;
  return Array.isArray(proof?.findings) ? proof.findings.length : 0;
}

function readComponentProof(name, filename, commit, findings) {
  const absolute = join(root, "public", ".well-known", filename);
  if (!existsSync(absolute)) {
    findings.push({ code: "missing_component_proof", gate: name, detail: `${filename} was not generated.` });
    return { gate: name, status: "failed", certifiable: false, validationCommit: null, findingCount: 1 };
  }

  let proof;
  try {
    proof = JSON.parse(readFileSync(absolute, "utf8"));
  } catch {
    findings.push({ code: "malformed_component_proof", gate: name, detail: `${filename} is not valid JSON.` });
    return { gate: name, status: "failed", certifiable: false, validationCommit: null, findingCount: 1 };
  }

  const status = statusValue(proof.status);
  const certifiable = proof.certifiable === true;
  const validationCommit = typeof proof.validationCommit === "string" ? proof.validationCommit : null;
  const findingCount = proofFindingCount(proof);

  if (status !== "pass") findings.push({ code: "component_not_pass", gate: name, detail: `${filename} reported ${status || "unknown"}.` });
  if (!certifiable) findings.push({ code: "component_not_certifiable", gate: name, detail: `${filename} is not certifiable.` });
  if (!commit || validationCommit !== commit) findings.push({ code: "component_commit_mismatch", gate: name, detail: `${filename} is bound to ${validationCommit ?? "no commit"}, expected ${commit ?? "no deployed commit"}.` });
  if (findingCount > 0) findings.push({ code: "component_findings_present", gate: name, detail: `${filename} contains ${findingCount} finding(s).` });

  if (name === "money") {
    const critical = Array.isArray(proof.criticalFindings) ? proof.criticalFindings : [];
    const review = Array.isArray(proof.reviewFindings) ? proof.reviewFindings : [];
    if (critical.length) findings.push({ code: "money_critical_findings", gate: name, detail: `${critical.length} critical money finding(s) remain.` });
    if (review.length) findings.push({ code: "money_review_findings", gate: name, detail: `${review.length} money review finding(s) remain.` });
  }

  return { gate: name, status, certifiable, validationCommit, findingCount };
}

function extractMetric(snapshot, keys) {
  const candidate = record(snapshot);
  if (!candidate) return null;
  for (const key of keys) {
    const value = numberValue(candidate[key]);
    if (value !== null) return value;
  }
  for (const value of Object.values(candidate)) {
    if (record(value)) {
      const nested = extractMetric(value, keys);
      if (nested !== null) return nested;
    }
  }
  return null;
}

async function loadLiveSnapshots(findings) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    findings.push({ code: "supabase_service_configuration_missing", gate: "live_snapshots", detail: "Mission 7 cannot read live aggregate snapshots." });
    return { money: null, identity: null, security: null };
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [moneyResult, identityResult, securityResult] = await Promise.all([
    supabase.rpc("bvrb3r_v1_money_readiness_snapshot"),
    supabase.rpc("bvrb3r_v1_identity_readiness_snapshot"),
    supabase.rpc("bvrb3r_v1_security_readiness_snapshot")
  ]);

  const results = { money: moneyResult, identity: identityResult, security: securityResult };
  for (const [name, result] of Object.entries(results)) {
    if (result.error) findings.push({ code: "live_snapshot_failed", gate: name, detail: result.error.message });
    else if (!record(result.data)) findings.push({ code: "live_snapshot_malformed", gate: name, detail: `${name} snapshot did not return an object.` });
  }

  return {
    money: record(moneyResult.data),
    identity: record(identityResult.data),
    security: record(securityResult.data)
  };
}

const validationCommit = currentCommit();
const findings = [];
if (!validationCommit) findings.push({ code: "validation_commit_missing", gate: "deployment", detail: "The final certificate is not bound to a Git commit." });

const componentGates = componentProofs.map(([name, filename]) => readComponentProof(name, filename, validationCommit, findings));
const snapshots = await loadLiveSnapshots(findings);

if (snapshots.money) {
  const status = statusValue(snapshots.money.status);
  const critical = positiveMetrics(snapshots.money.critical);
  const review = positiveMetrics(snapshots.money.review);
  if (status !== "pass") findings.push({ code: "live_money_not_pass", gate: "money", detail: `Live money snapshot reported ${status || "unknown"}.` });
  if (critical.length) findings.push({ code: "live_money_critical", gate: "money", detail: `${critical.length} critical live money metric(s) remain.` });
  if (review.length) findings.push({ code: "live_money_review", gate: "money", detail: `${review.length} live money metric(s) need review.` });
}

if (snapshots.identity) {
  const status = statusValue(snapshots.identity.status);
  const noncanonicalRoles = extractMetric(snapshots.identity, ["noncanonical_public_role_count", "noncanonical_public_roles", "noncanonical_role_count"]);
  const critical = positiveMetrics(snapshots.identity.critical);
  if (status && status !== "pass") findings.push({ code: "live_identity_not_pass", gate: "identity", detail: `Live identity snapshot reported ${status}.` });
  if (noncanonicalRoles !== null && noncanonicalRoles > 0) findings.push({ code: "noncanonical_public_roles", gate: "identity", detail: `${noncanonicalRoles} noncanonical public role(s) remain.` });
  if (critical.length) findings.push({ code: "live_identity_critical", gate: "identity", detail: `${critical.length} critical identity metric(s) remain.` });
}

if (snapshots.security) {
  const status = statusValue(snapshots.security.status);
  const critical = positiveMetrics(snapshots.security.critical);
  const criticalCount = extractMetric(snapshots.security, ["critical_finding_count", "critical_security_finding_count", "critical_rls_finding_count"]);
  if (status && status !== "pass") findings.push({ code: "live_security_not_pass", gate: "security", detail: `Live security snapshot reported ${status}.` });
  if (criticalCount !== null && criticalCount > 0) findings.push({ code: "critical_security_findings", gate: "security", detail: `${criticalCount} critical security/RLS finding(s) remain.` });
  if (critical.length) findings.push({ code: "live_security_critical", gate: "security", detail: `${critical.length} critical security metric(s) remain.` });
}

const generatedAt = new Date().toISOString();
const status = findings.length === 0 ? "pass" : "failed";
const exitMatrix = {
  criticalBlockers: findings.filter((finding) => /critical|missing|failed|mismatch|malformed/.test(finding.code)).length,
  failedGates: findings.length,
  needsReviewGates: findings.filter((finding) => /review|not_pass|not_certifiable/.test(finding.code)).length,
  noncanonicalPublicRoles: snapshots.identity ? extractMetric(snapshots.identity, ["noncanonical_public_role_count", "noncanonical_public_roles", "noncanonical_role_count"]) ?? 0 : null,
  criticalRlsSecurityFindings: snapshots.security ? extractMetric(snapshots.security, ["critical_finding_count", "critical_security_finding_count", "critical_rls_finding_count"]) ?? positiveMetrics(snapshots.security.critical).length : null,
  openMoneyAnomalies: snapshots.money ? positiveMetrics(snapshots.money.critical).length : null,
  moneyNeedsReview: snapshots.money ? positiveMetrics(snapshots.money.review).length : null,
  componentProofFailures: componentGates.filter((gate) => gate.status !== "pass" || !gate.certifiable || gate.findingCount > 0).length,
  deploymentCommitMismatch: componentGates.filter((gate) => gate.validationCommit !== validationCommit).length
};

const unsignedCertificate = {
  schemaVersion: 1,
  mission: 7,
  missionName: "Final production soak and V1 sign-off",
  generatedAt,
  validationCommit,
  status,
  certifiable: status === "pass" && Boolean(validationCommit),
  v1ReadyPercent: status === "pass" ? 100 : 0,
  findingCount: findings.length,
  findings,
  exitMatrix,
  componentGates,
  liveSnapshots: snapshots,
  certificationStatement: status === "pass"
    ? "BVRB3R V1 READY — 100%. All required release gates passed against the deployed commit and live aggregate production truth."
    : "BVRB3R V1 is not certified. One or more final release gates failed closed."
};
const certificateHash = createHash("sha256").update(JSON.stringify(unsignedCertificate)).digest("hex");
const proof = { ...unsignedCertificate, signature: { algorithm: "sha256", certificateHash, signer: "BVRB3R Architect release gate" } };

mkdirSync(dirname(proofPath), { recursive: true });
writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(JSON.stringify(proof, null, 2));
if (!proof.certifiable) process.exit(1);

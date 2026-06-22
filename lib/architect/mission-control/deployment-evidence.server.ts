import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readArchitectDebugEnvironment } from "@/lib/architect/debug/env";
import {
  deploymentCommitsCompatible,
  isReadyDeploymentState,
  isValidDeploymentValidationProof,
  normalizeDeploymentEvidenceText,
  type DeploymentRuntimeEnvironment,
  type DeploymentRuntimeEvidence,
  type DeploymentValidationProof
} from "@/lib/architect/mission-control/deployment-evidence";
import type { DeploymentRegressionEvidenceFreshness } from "@/lib/architect/mission-control/types";

const PROOF_FILE_PATH = join(process.cwd(), "public", ".well-known", "bvrb3r-deployment-regression-proof.json");
const DEFAULT_REPO_OWNER = "bvrb3r";
const DEFAULT_REPO_SLUG = "bvrb3r-platform";
const DEFAULT_MAIN_BRANCH = "main";

function deploymentUrl() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NEXT_PUBLIC_VERCEL_URL) return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  return null;
}

function inferDeploymentStatus(deploymentId: string | null) {
  const explicit = normalizeDeploymentEvidenceText(process.env.BVRB3R_DEPLOYMENT_STATUS)
    ?? normalizeDeploymentEvidenceText(process.env.NEXT_PUBLIC_DEPLOYMENT_STATUS);
  if (explicit) return explicit;
  if (process.env.VERCEL === "1" && deploymentId) return "READY";
  return null;
}

async function readValidationProofFile(): Promise<{ proof: DeploymentValidationProof | null; state: DeploymentRuntimeEvidence["validationProofFileState"] }> {
  try {
    const raw = await readFile(PROOF_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidDeploymentValidationProof(parsed)) {
      return { proof: null, state: "malformed" };
    }
    return { proof: parsed, state: "present" };
  } catch (error) {
    if (error instanceof SyntaxError) return { proof: null, state: "malformed" };
    return { proof: null, state: "missing" };
  }
}

async function fetchGithubMainCommit(branch: string): Promise<{ commit: string | null; source: string }> {
  const owner = normalizeDeploymentEvidenceText(process.env.VERCEL_GIT_REPO_OWNER) ?? DEFAULT_REPO_OWNER;
  const repo = normalizeDeploymentEvidenceText(process.env.VERCEL_GIT_REPO_SLUG) ?? DEFAULT_REPO_SLUG;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`, {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "bvrb3r-architect-deployment-evidence"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return { commit: null, source: `public GitHub commit API returned ${response.status}` };
    }

    const body = await response.json() as { sha?: string };
    return {
      commit: normalizeDeploymentEvidenceText(body.sha),
      source: `public GitHub commit API ${owner}/${repo}@${branch}`
    };
  } catch {
    return { commit: null, source: "public GitHub commit API unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveExpectedMainCommit() {
  const explicit = normalizeDeploymentEvidenceText(process.env.BVRB3R_EXPECTED_MAIN_COMMIT)
    ?? normalizeDeploymentEvidenceText(process.env.NEXT_PUBLIC_EXPECTED_MAIN_COMMIT);
  if (explicit) {
    return { commit: explicit, source: "explicit BVRB3R_EXPECTED_MAIN_COMMIT environment metadata" };
  }

  const branch = normalizeDeploymentEvidenceText(process.env.BVRB3R_EXPECTED_MAIN_BRANCH)
    ?? normalizeDeploymentEvidenceText(process.env.NEXT_PUBLIC_EXPECTED_MAIN_BRANCH)
    ?? DEFAULT_MAIN_BRANCH;
  return fetchGithubMainCommit(branch);
}

export async function readDeploymentRuntimeEvidence(checkedAt = new Date().toISOString()): Promise<DeploymentRuntimeEvidence> {
  const debugEnvironment = readArchitectDebugEnvironment();
  const expected = await resolveExpectedMainCommit();
  const { proof, state: proofFileState } = await readValidationProofFile();
  const runtimeCommit = normalizeDeploymentEvidenceText(debugEnvironment.commitHash);
  const validationCommit = normalizeDeploymentEvidenceText(proof?.validationCommit);
  const validationTimestamp = normalizeDeploymentEvidenceText(proof?.validationTimestamp) ?? normalizeDeploymentEvidenceText(proof?.generatedAt);
  const validationSource = normalizeDeploymentEvidenceText(proof?.validationSource);
  const validationCommand = normalizeDeploymentEvidenceText(proof?.validationCommand);
  const deploymentStatus = inferDeploymentStatus(debugEnvironment.deploymentId);
  const proofCommitMatchesRuntime = Boolean(validationCommit && runtimeCommit && deploymentCommitsCompatible(validationCommit, runtimeCommit));
  const evidenceFreshness: DeploymentRegressionEvidenceFreshness = proof
    ? proofCommitMatchesRuntime ? "fresh" : "stale"
    : "missing";
  const validationProofConnected = Boolean(
    proof
      && proofCommitMatchesRuntime
      && validationTimestamp
      && validationSource
      && validationCommand
  );
  const readyDeployment = isReadyDeploymentState(deploymentStatus);

  const environment: DeploymentRuntimeEnvironment = {
    ...debugEnvironment,
    expectedMainCommit: expected.commit,
    expectedMainCommitSource: expected.source,
    deploymentUrl: deploymentUrl(),
    deploymentStatus,
    branch: normalizeDeploymentEvidenceText(process.env.VERCEL_GIT_COMMIT_REF) ?? normalizeDeploymentEvidenceText(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF),
    buildTime: normalizeDeploymentEvidenceText(process.env.NEXT_PUBLIC_BUILD_TIME) ?? normalizeDeploymentEvidenceText(process.env.BUILD_TIME),
    lastValidatedAt: validationTimestamp
  };

  return {
    checkedAt,
    environment,
    validationProofConnected,
    validationProofFilePresent: Boolean(proof),
    validationProofFileState: proofFileState,
    evidenceInput: {
      expectedMainCommit: expected.commit,
      runtimeCommit,
      deploymentId: debugEnvironment.deploymentId,
      deploymentEnvironment: debugEnvironment.appEnv,
      deploymentTarget: normalizeDeploymentEvidenceText(process.env.VERCEL_ENV) ?? debugEnvironment.appEnv,
      deploymentUrl: environment.deploymentUrl,
      deploymentState: deploymentStatus,
      buildEvidenceStatus: readyDeployment && proofCommitMatchesRuntime ? "pass" : null,
      lintEvidenceStatus: proofCommitMatchesRuntime ? proof?.lintStatus : proof?.lintStatus ?? null,
      typecheckEvidenceStatus: proofCommitMatchesRuntime ? proof?.typecheckStatus : proof?.typecheckStatus ?? null,
      testEvidenceStatus: proofCommitMatchesRuntime ? proof?.targetedTestStatus : proof?.targetedTestStatus ?? null,
      regressionSuiteName: normalizeDeploymentEvidenceText(proof?.regressionSuiteName),
      regressionTestCount: Number.isFinite(proof?.regressionTestCount) ? proof?.regressionTestCount ?? null : null,
      validationCommand,
      validationSource,
      validationCommit,
      validationTimestamp,
      lastValidatedAt: validationTimestamp,
      verifiedAt: checkedAt,
      evidenceSource: [
        "Vercel runtime environment variables",
        expected.source,
        proof ? "generated verify:deployment proof file" : `verify:deployment proof file ${proofFileState}`
      ].join("; "),
      evidenceFreshness,
      proofConnected: validationProofConnected
    }
  };
}

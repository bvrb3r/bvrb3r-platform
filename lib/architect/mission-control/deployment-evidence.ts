import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readArchitectDebugEnvironment } from "@/lib/architect/debug/env";
import type { DeploymentRegressionEvidenceFreshness } from "@/lib/architect/mission-control/types";

const PROOF_FILE_PATH = join(process.cwd(), "public", ".well-known", "bvrb3r-deployment-regression-proof.json");
const DEFAULT_REPO_OWNER = "bvrb3r";
const DEFAULT_REPO_SLUG = "bvrb3r-platform";
const DEFAULT_MAIN_BRANCH = "main";

type DeploymentValidationProof = {
  schemaVersion?: number;
  generatedAt?: string | null;
  validationTimestamp?: string | null;
  validationCommit?: string | null;
  validationSource?: string | null;
  validationCommand?: string | null;
  regressionSuiteName?: string | null;
  regressionTestCount?: number | null;
  lintStatus?: string | null;
  typecheckStatus?: string | null;
  targetedTestStatus?: string | null;
};

export type DeploymentRegressionEvidenceInputPayload = {
  expectedMainCommit?: string | null;
  runtimeCommit?: string | null;
  deploymentId?: string | null;
  deploymentEnvironment?: string | null;
  deploymentTarget?: string | null;
  deploymentUrl?: string | null;
  deploymentState?: string | null;
  buildEvidenceStatus?: string | null;
  lintEvidenceStatus?: string | null;
  typecheckEvidenceStatus?: string | null;
  testEvidenceStatus?: string | null;
  regressionSuiteName?: string | null;
  regressionTestCount?: number | null;
  validationCommand?: string | null;
  validationSource?: string | null;
  validationCommit?: string | null;
  validationTimestamp?: string | null;
  lastValidatedAt?: string | null;
  verifiedAt?: string | null;
  evidenceSource?: string;
  evidenceFreshness?: DeploymentRegressionEvidenceFreshness;
  proofConnected?: boolean;
};

export type DeploymentRuntimeEnvironment = ReturnType<typeof readArchitectDebugEnvironment> & {
  expectedMainCommit: string | null;
  expectedMainCommitSource: string;
  deploymentUrl: string | null;
  deploymentStatus: string | null;
  branch: string | null;
  buildTime: string | null;
  lastValidatedAt: string | null;
};

export type DeploymentRuntimeEvidence = {
  checkedAt: string;
  environment: DeploymentRuntimeEnvironment;
  evidenceInput: DeploymentRegressionEvidenceInputPayload;
  validationProofConnected: boolean;
  validationProofFilePresent: boolean;
};

function normalize(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function commitsCompatible(left: string, right: string) {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  return normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(normalizedRight)
    || normalizedRight.startsWith(normalizedLeft);
}

function deploymentUrl() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NEXT_PUBLIC_VERCEL_URL) return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  return null;
}

function inferDeploymentStatus(deploymentId: string | null) {
  const explicit = normalize(process.env.BVRB3R_DEPLOYMENT_STATUS)
    ?? normalize(process.env.NEXT_PUBLIC_DEPLOYMENT_STATUS);
  if (explicit) return explicit;
  if (process.env.VERCEL === "1" && deploymentId) return "READY";
  return null;
}

async function readValidationProofFile(): Promise<DeploymentValidationProof | null> {
  try {
    const raw = await readFile(PROOF_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as DeploymentValidationProof;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchGithubMainCommit(branch: string): Promise<{ commit: string | null; source: string }> {
  const owner = normalize(process.env.VERCEL_GIT_REPO_OWNER) ?? DEFAULT_REPO_OWNER;
  const repo = normalize(process.env.VERCEL_GIT_REPO_SLUG) ?? DEFAULT_REPO_SLUG;
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
      commit: normalize(body.sha),
      source: `public GitHub commit API ${owner}/${repo}@${branch}`
    };
  } catch {
    return { commit: null, source: "public GitHub commit API unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveExpectedMainCommit() {
  const explicit = normalize(process.env.BVRB3R_EXPECTED_MAIN_COMMIT)
    ?? normalize(process.env.NEXT_PUBLIC_EXPECTED_MAIN_COMMIT);
  if (explicit) {
    return { commit: explicit, source: "explicit BVRB3R_EXPECTED_MAIN_COMMIT environment metadata" };
  }

  const branch = normalize(process.env.BVRB3R_EXPECTED_MAIN_BRANCH)
    ?? normalize(process.env.NEXT_PUBLIC_EXPECTED_MAIN_BRANCH)
    ?? DEFAULT_MAIN_BRANCH;
  return fetchGithubMainCommit(branch);
}

function isReadyDeployment(status: string | null) {
  const normalized = status?.toLowerCase() ?? "";
  return ["ready", "success", "succeeded", "passed", "pass"].some((token) => normalized.includes(token));
}

export async function readDeploymentRuntimeEvidence(checkedAt = new Date().toISOString()): Promise<DeploymentRuntimeEvidence> {
  const debugEnvironment = readArchitectDebugEnvironment();
  const expected = await resolveExpectedMainCommit();
  const proof = await readValidationProofFile();
  const runtimeCommit = normalize(debugEnvironment.commitHash);
  const validationCommit = normalize(proof?.validationCommit);
  const validationTimestamp = normalize(proof?.validationTimestamp) ?? normalize(proof?.generatedAt);
  const validationSource = normalize(proof?.validationSource);
  const validationCommand = normalize(proof?.validationCommand);
  const deploymentStatus = inferDeploymentStatus(debugEnvironment.deploymentId);
  const proofCommitMatchesRuntime = Boolean(validationCommit && runtimeCommit && commitsCompatible(validationCommit, runtimeCommit));
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
  const readyDeployment = isReadyDeployment(deploymentStatus);

  const environment: DeploymentRuntimeEnvironment = {
    ...debugEnvironment,
    expectedMainCommit: expected.commit,
    expectedMainCommitSource: expected.source,
    deploymentUrl: deploymentUrl(),
    deploymentStatus,
    branch: normalize(process.env.VERCEL_GIT_COMMIT_REF) ?? normalize(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF),
    buildTime: normalize(process.env.NEXT_PUBLIC_BUILD_TIME) ?? normalize(process.env.BUILD_TIME),
    lastValidatedAt: validationTimestamp
  };

  return {
    checkedAt,
    environment,
    validationProofConnected,
    validationProofFilePresent: Boolean(proof),
    evidenceInput: {
      expectedMainCommit: expected.commit,
      runtimeCommit,
      deploymentId: debugEnvironment.deploymentId,
      deploymentEnvironment: debugEnvironment.appEnv,
      deploymentTarget: normalize(process.env.VERCEL_ENV) ?? debugEnvironment.appEnv,
      deploymentUrl: environment.deploymentUrl,
      deploymentState: deploymentStatus,
      buildEvidenceStatus: readyDeployment && proofCommitMatchesRuntime ? "pass" : null,
      lintEvidenceStatus: proofCommitMatchesRuntime ? proof?.lintStatus : proof?.lintStatus ?? null,
      typecheckEvidenceStatus: proofCommitMatchesRuntime ? proof?.typecheckStatus : proof?.typecheckStatus ?? null,
      testEvidenceStatus: proofCommitMatchesRuntime ? proof?.targetedTestStatus : proof?.targetedTestStatus ?? null,
      regressionSuiteName: normalize(proof?.regressionSuiteName),
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
        proof ? "generated verify:deployment proof file" : "verify:deployment proof file missing"
      ].join("; "),
      evidenceFreshness,
      proofConnected: validationProofConnected
    }
  };
}

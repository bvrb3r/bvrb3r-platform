import type { DeploymentRegressionEvidenceFreshness } from "@/lib/architect/mission-control/types";

export type DeploymentValidationProof = {
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

export type DeploymentRuntimeEnvironment = {
  appEnv: string;
  commitHash: string | null;
  deploymentId: string | null;
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
  validationProofFileState: "present" | "missing" | "malformed";
};

export function normalizeDeploymentEvidenceText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

export function deploymentCommitsCompatible(left: string, right: string) {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  return normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(normalizedRight)
    || normalizedRight.startsWith(normalizedLeft);
}

export function isReadyDeploymentState(status: string | null) {
  const normalized = status?.toLowerCase() ?? "";
  return ["ready", "success", "succeeded", "passed", "pass"].some((token) => normalized.includes(token));
}

export function isValidDeploymentValidationProof(value: unknown): value is DeploymentValidationProof {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

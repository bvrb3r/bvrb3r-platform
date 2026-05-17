import { readArchitectDebugEnvironment } from "@/lib/architect/debug/env";

export function buildDeploymentDebugPacket() {
  const environment = readArchitectDebugEnvironment();
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    debugType: "deployment",
    targetType: "deployment",
    targetId: environment.deploymentId ?? environment.commitHash ?? "local",
    environment,
    summary: {
      health: environment.commitHash ? "healthy" : "warning",
      diagnosisCode: environment.commitHash ? "deployment_metadata_loaded" : "deployment_commit_unknown",
      headline: environment.commitHash ? "Deployment metadata is available." : "Commit hash is not exposed in this runtime.",
      confidence: "medium",
      recommendedAction: environment.commitHash ? "Compare this commit with the expected GitHub commit." : "Expose VERCEL_GIT_COMMIT_SHA or NEXT_PUBLIC_COMMIT_SHA if commit verification is needed.",
      canRepair: false,
      repairType: null,
      codexRequired: false
    }
  };
}

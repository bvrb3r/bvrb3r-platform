import { NextResponse } from "next/server";
import { readDeploymentRuntimeEvidence } from "@/lib/architect/mission-control/deployment-evidence.server";
import { buildDeploymentRegressionEvidence } from "@/lib/architect/mission-control/foundation";

export async function GET() {
  const runtimeEvidence = await readDeploymentRuntimeEvidence();
  const evidence = buildDeploymentRegressionEvidence(runtimeEvidence.evidenceInput);

  return NextResponse.json({
    ok: true,
    checkedAt: runtimeEvidence.checkedAt,
    status: evidence.status,
    environment: runtimeEvidence.environment,
    deploymentEvidence: {
      runtimeCommit: evidence.runtimeCommit,
      expectedMainCommit: evidence.expectedMainCommit,
      productionDeploymentId: evidence.deploymentId,
      deploymentStatus: evidence.deploymentState,
      productionCommitMatchesMain: evidence.productionCommitMatchesMain,
      deploymentEnvironment: evidence.deploymentEnvironment,
      deploymentUrl: evidence.deploymentUrl,
      verifiedAt: evidence.verifiedAt,
      evidenceSource: evidence.evidenceSource,
      evidenceFreshness: evidence.evidenceFreshness,
      proofConnected: evidence.proofConnected,
      missingProof: evidence.staleOrMissingState,
      failedProof: evidence.failingState
    },
    regressionEvidence: {
      buildStatus: evidence.buildEvidenceStatus,
      lintStatus: evidence.lintEvidenceStatus,
      typecheckStatus: evidence.typecheckEvidenceStatus,
      targetedTestStatus: evidence.testEvidenceStatus,
      regressionSuiteName: evidence.regressionSuiteName,
      regressionTestCount: evidence.regressionTestCount,
      validationCommand: evidence.validationCommand,
      validationSource: evidence.validationSource,
      validationCommit: evidence.validationCommit,
      validationTimestamp: evidence.validationTimestamp,
      proofConnected: runtimeEvidence.validationProofConnected,
      proofFilePresent: runtimeEvidence.validationProofFilePresent,
      proofFileState: runtimeEvidence.validationProofFileState,
      missingProof: evidence.staleOrMissingState.filter((row) => row.toLowerCase().includes("validation")),
      failedProof: evidence.failingState.filter((row) => row.toLowerCase().includes("validation"))
    }
  });
}

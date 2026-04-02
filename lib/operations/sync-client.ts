import { WorkflowPersistenceEnvelope } from "@/lib/operations/persistence";
import { WorkflowPersistenceResult } from "@/lib/operations/persistence-provider";

const demoResult: WorkflowPersistenceResult = {
  provider: "mock",
  persisted: false,
  workflowEventStored: true,
  compensationStored: false,
  ownerAnalyticsStored: true,
  message: "Milestone 8 sync is running in local demo mode."
};

export async function syncWorkflowToPersistence(input: WorkflowPersistenceEnvelope): Promise<WorkflowPersistenceResult> {
  if (typeof window === "undefined" || process.env.NODE_ENV === "test") {
    return demoResult;
  }

  const response = await fetch("/api/operations/workflow-sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    keepalive: true
  });

  if (!response.ok) {
    throw new Error(`Workflow sync failed with status ${response.status}`);
  }

  return response.json() as Promise<WorkflowPersistenceResult>;
}
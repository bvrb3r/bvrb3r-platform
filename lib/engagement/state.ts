import { createInitialEngagementState, type EngagementState } from "@/lib/engagement/engine";

declare global {
  var __bvrb3rEngagementState: EngagementState | undefined;
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getEngagementState() {
  if (!globalThis.__bvrb3rEngagementState) {
    globalThis.__bvrb3rEngagementState = createInitialEngagementState();
  }

  return globalThis.__bvrb3rEngagementState;
}

export function setEngagementState(nextState: EngagementState) {
  globalThis.__bvrb3rEngagementState = cloneState(nextState);
  return globalThis.__bvrb3rEngagementState;
}
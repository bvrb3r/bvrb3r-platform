import { createInitialPointsState } from "@/lib/data/points";
import type { PointsState } from "@/types/points";

declare global {
  var __bvrb3rPointsState: PointsState | undefined;
}

export function getPointsState() {
  if (!globalThis.__bvrb3rPointsState) {
    globalThis.__bvrb3rPointsState = createInitialPointsState();
  }

  return globalThis.__bvrb3rPointsState;
}

export function setPointsState(state: PointsState) {
  globalThis.__bvrb3rPointsState = state;
}

export function resetPointsState() {
  setPointsState(createInitialPointsState());
}

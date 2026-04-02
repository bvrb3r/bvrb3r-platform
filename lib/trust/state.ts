import { createInitialTrustState } from "@/lib/trust/engine";
import type { TrustState } from "@/types/trust";

let trustState: TrustState | null = null;

export function getTrustState() {
  if (!trustState) trustState = createInitialTrustState();
  return trustState;
}

export function setTrustState(nextState: TrustState) {
  trustState = nextState;
}

export function resetTrustState() {
  trustState = createInitialTrustState();
  return trustState;
}

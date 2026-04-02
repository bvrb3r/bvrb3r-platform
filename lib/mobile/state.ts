import { createInitialMobileState } from "@/lib/mobile/engine";
import type { MobileState } from "@/types/mobile";

let mobileState: MobileState = createInitialMobileState();

export function getMobileState() {
  return mobileState;
}

export function setMobileState(nextState: MobileState) {
  mobileState = nextState;
}

export function resetMobileState() {
  mobileState = createInitialMobileState();
}

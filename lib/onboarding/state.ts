import type { OnboardingStateRecord } from "@/types/onboarding";

let onboardingState: OnboardingStateRecord[] = [];

export function getOnboardingStateStore() {
  return onboardingState;
}

export function setOnboardingStateStore(nextState: OnboardingStateRecord[]) {
  onboardingState = nextState;
}

export function resetOnboardingStateStore() {
  onboardingState = [];
  return onboardingState;
}


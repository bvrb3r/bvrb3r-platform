import type { Route } from "next";
import type { ApprovalStatus, BarberSubtype, IdentityOnboardingState } from "@/types/domain";
import type { VerificationSubjectRole, VerificationSubjectProfileView } from "@/types/trust";

export type OnboardingRole = VerificationSubjectRole;
export type OnboardingStepStatus = "not_started" | "in_progress" | "completed";
export type ActivationState = "needs_role" | "onboarding" | "verification" | "active";

export type OnboardingStepKey =
  | "client_profile"
  | "client_preferences"
  | "barber_profile"
  | "barber_services"
  | "barber_availability"
  | "barber_verification"
  | "owner_shop"
  | "owner_structure"
  | "owner_team"
  | "owner_verification";

export interface OnboardingStateRecord {
  id: string;
  userId: string;
  role: OnboardingRole;
  status: OnboardingStepStatus;
  currentStep: OnboardingStepKey;
  completedSteps: OnboardingStepKey[];
  profileData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface OnboardingStepDefinition {
  key: OnboardingStepKey;
  role: OnboardingRole;
  title: string;
  subtitle: string;
  route: Route;
}

export interface OnboardingLaneView {
  role: OnboardingRole;
  status: OnboardingStepStatus;
  currentStep: OnboardingStepKey;
  completedSteps: OnboardingStepKey[];
  resumePath: Route;
  activationState: ActivationState;
  isActive: boolean;
  profileData: Record<string, unknown>;
  verificationProfile?: VerificationSubjectProfileView;
}

export interface OnboardingMePayload {
  lanes: OnboardingLaneView[];
  selectedRole: OnboardingRole | null;
  nextPath: Route;
  warnings: string[];
}

export interface RoleSelectionPayload {
  role: OnboardingRole;
  barberSubtype?: BarberSubtype;
  shopName?: string;
  shop_name?: string;
}

export interface ContactVerificationStatusPayload {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  canContinue: boolean;
  requiresRoleSelection: boolean;
  onboardingState: IdentityOnboardingState;
  missingFields: string[];
  degraded?: boolean;
  nextPath?: Route;
}

export interface ActivationStatusLaneView {
  role: OnboardingRole;
  activationState: ActivationState;
  isActive: boolean;
  requirements: string[];
  verificationProfile?: VerificationSubjectProfileView;
  resumePath: Route;
  dashboardPath: Route;
  appApprovalStatus?: ApprovalStatus;
  shopApprovalStatus?: ApprovalStatus;
}

export interface ActivationStatusPayload {
  selectedRole: OnboardingRole | null;
  nextPath: Route;
  lanes: ActivationStatusLaneView[];
  warnings: string[];
}

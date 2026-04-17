// src/config/onboarding.ts
// No "use server" — this file is imported by both server actions and the Clerk webhook route.

export type OnboardingStepId =
  | "profile"
  | "photo"
  | "address"
  | "id_proof"
  | "emergency_contact"
  | "documents";

export type OnboardingStepConfig = {
  id: OnboardingStepId;
  enabled: boolean;
  required: boolean;
};

export type OnboardingStepStatus = OnboardingStepConfig & {
  label: string;
  complete: boolean;
  actionUrl: string;
};

export type OnboardingStatusResult = {
  steps: OnboardingStepStatus[];
  totalEnabled: number;
  totalComplete: number;
  allRequiredComplete: boolean;
};

export type EmployeeOnboardingSummary = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  department_id: string | null;
  created_at: string;
  totalEnabled: number;
  totalComplete: number;
  allRequiredComplete: boolean;
};

export const DEFAULT_ONBOARDING_STEPS: OnboardingStepConfig[] = [
  { id: "profile",           enabled: true,  required: true  },
  { id: "photo",             enabled: true,  required: false },
  { id: "address",           enabled: true,  required: true  },
  { id: "id_proof",          enabled: true,  required: true  },
  { id: "emergency_contact", enabled: true,  required: false },
  { id: "documents",         enabled: false, required: false },
];

export const STEP_LABELS: Record<OnboardingStepId, string> = {
  profile:           "Complete your profile",
  photo:             "Upload a profile photo",
  address:           "Add your address",
  id_proof:          "Upload ID proof (PAN or Aadhaar)",
  emergency_contact: "Add emergency contact",
  documents:         "Acknowledge company documents",
};

export const STEP_ACTION_URLS: Record<OnboardingStepId, string> = {
  profile:           "/dashboard/profile",
  photo:             "/dashboard/profile",
  address:           "/dashboard/profile",
  id_proof:          "/dashboard/profile",
  emergency_contact: "/dashboard/profile",
  documents:         "/dashboard/documents",
};

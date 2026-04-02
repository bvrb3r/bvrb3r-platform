export type ShopManagerMode = "assist" | "auto";

export type ShopManagerSuggestionPriority = "high" | "medium" | "low";

export type ShopManagerSuggestionType =
  | "walk_in_assignment"
  | "capacity_gap"
  | "fill_slot_recovery"
  | "checkout_risk"
  | "top_performer"
  | "retention_opportunity"
  | "coverage_watch";

export type ShopManagerSuggestionAction =
  | {
      kind: "link";
      label: string;
      href: string;
    }
  | {
      kind: "assign_queue";
      label: string;
      entryId: string;
      barberId: string;
    };

export interface ShopManagerSuggestion {
  id: string;
  type: ShopManagerSuggestionType;
  priority: ShopManagerSuggestionPriority;
  title: string;
  detail: string;
  audience: "owner" | "manager" | "front_desk";
  safeAutomation: boolean;
  action?: ShopManagerSuggestionAction;
}

export interface ShopManagerPayload {
  mode: ShopManagerMode;
  autoModeAvailable: boolean;
  autoModeReason: string;
  generatedAt: string;
  summary: {
    queueEntries: number;
    openChairs: number;
    recoveryOpportunities: number;
  };
  suggestions: ShopManagerSuggestion[];
}

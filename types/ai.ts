import type { HaircutNowMatch, MarketplaceSourceKind } from "@/types/domain";

export type AiRecommendationType =
  | "rebooking_reminder"
  | "available_now"
  | "barber_gap_alert";

export type AiRecommendationAction =
  | "shown"
  | "clicked"
  | "converted"
  | "suppressed";

export type AiRecommendationSurface = "client_home" | "barber_dashboard";

export interface AiBookingActionContext {
  barberId: string;
  username?: string;
  locationId?: string;
  serviceId?: string;
  appointmentTime?: string;
  sourceKind: MarketplaceSourceKind;
  matchedFrom?: HaircutNowMatch["matchedFrom"];
  query?: string;
}

export interface AiRecommendationBase {
  recommendationId: string;
  type: AiRecommendationType;
  title: string;
  reason: string;
  explanation: string;
  actionLabel: string;
}

export interface ClientRebookingReminderView extends AiRecommendationBase {
  type: "rebooking_reminder";
  cadenceSource: "routine" | "history";
  confidence: string;
  lastCompletedAt: string;
  daysSinceLastService: number;
  typicalCadenceDays: number;
  barberName?: string;
  serviceName?: string;
  booking: AiBookingActionContext;
}

export interface ClientAvailableNowSuggestionView extends AiRecommendationBase {
  type: "available_now";
  barberName: string;
  username: string;
  appointmentTime: string;
  locationId: string;
  shopName?: string;
  priceFrom: number;
  rating: number;
  distanceMiles?: number;
  specialties: string[];
  matchedFrom: HaircutNowMatch["matchedFrom"];
  booking: AiBookingActionContext;
}

export interface BarberGapAlertView extends AiRecommendationBase {
  type: "barber_gap_alert";
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  locationId?: string | null;
  locationLabel?: string | null;
  suggestedServiceIds: string[];
  suggestedServiceNames: string[];
}

export interface AiScaffoldDescriptor {
  status: "scaffolded";
  signalKeys: string[];
  notes: string[];
}

export interface AiNextLayerScaffold {
  personalization: AiScaffoldDescriptor;
  pricingSuggestions: AiScaffoldDescriptor;
  churnPrediction: AiScaffoldDescriptor;
}

export interface ClientAiSummary {
  generatedAt: string;
  rebookingReminder: ClientRebookingReminderView | null;
  availableNowSuggestions: ClientAvailableNowSuggestionView[];
  nextLayer: AiNextLayerScaffold;
}

export interface BarberAiSummary {
  generatedAt: string;
  gapAlerts: BarberGapAlertView[];
  nextLayer: AiNextLayerScaffold;
}

export interface TrackAiRecommendationInput {
  recommendationId: string;
  recommendationType: AiRecommendationType;
  action: Exclude<AiRecommendationAction, "shown">;
  surface: AiRecommendationSurface;
  relatedIds?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

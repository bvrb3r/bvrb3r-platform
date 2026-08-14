/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { createEmptyMarketplaceActivationState, getMonetizationEligibility, type MarketplaceActivationState } from "@/lib/marketplace/activation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isBarberAccountRole, isShopOwnerRole } from "@/lib/auth/roles";
import { buildPublicTrustSignal, computeShopVerificationDecision, getVerificationGateDecision } from "@/lib/trust/engine";
import { getTrustProvider } from "@/lib/trust/provider";
import type {
  BoostCampaignRecord,
  FeaturedPlacementRecord,
  MarketplaceMonetizationEvent,
  VerificationUploadRecord,
  CityActivationState
} from "@/types/activation";
import type { Role } from "@/types/domain";
import type { BarberVerificationCategory, ShopVerificationCategory } from "@/types/trust";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export interface ActivationActor {
  role: Role;
  userId?: string;
  barberId?: string;
  userEmail?: string;
}

export class ActivationPermissionError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = "ActivationPermissionError";
  }
}

export class ActivationValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "ActivationValidationError";
  }
}

export interface MarketplaceActivationProvider {
  kind: "supabase";
  readState(): Promise<MarketplaceActivationState>;
  createVerificationUpload(actor: ActivationActor, input: {
    ownerType: "barber" | "shop";
    ownerId?: string;
    category: BarberVerificationCategory | ShopVerificationCategory;
    fileName: string;
    contentType: string;
    fileSizeBytes: number;
    expiresAt?: string;
  }): Promise<{ upload: VerificationUploadRecord; signedUploadUrl: string }>;
  createBoostCampaign(actor: ActivationActor, input: {
    scopeType: "barber" | "shop";
    scopeId?: string;
    placementLabel: string;
    placementScope: BoostCampaignRecord["placementScope"];
    citySlug?: string;
    categorySlug?: string;
    dailyBudgetCents: number;
    spendCents: number;
    startsAt?: string;
    endsAt?: string;
  }): Promise<{ campaign: BoostCampaignRecord }>;
  createFeaturedPlacement(actor: ActivationActor, input: {
    scopeType: "barber" | "shop";
    scopeId: string;
    label: string;
    placementScope: FeaturedPlacementRecord["placementScope"];
    citySlug?: string;
    categorySlug?: string;
    priority: number;
    startsAt: string;
    endsAt: string;
  }): Promise<{ placement: FeaturedPlacementRecord }>;
  updateCityRollout(actor: ActivationActor, input: {
    citySlug: string;
    activationState?: CityActivationState;
    launchVisible?: boolean;
    densityScore?: number;
    marketNotes?: string;
  }): Promise<{ rollout: MarketplaceActivationState["cityRollouts"][number] }>;
  recordMonetizationEvent(input: Omit<MarketplaceMonetizationEvent, "id" | "createdAt">): Promise<void>;
}

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function assertOwner(actor: ActivationActor) {
  if (actor.role !== "owner") {
    throw new ActivationPermissionError("Only the owner can manage this activation control.");
  }
}

async function getTrustSignal(scopeType: "barber" | "shop", scopeId: string) {
  try {
    const trustProvider = await getTrustProvider();
    const trustState = await trustProvider.readState();

    if (scopeType === "barber") {
      return buildPublicTrustSignal(trustState, scopeId);
    }

    const shopDecision = computeShopVerificationDecision(trustState, scopeId);
    const shopGate = getVerificationGateDecision(shopDecision, "shop_activation");
    return shopGate.allowed
      ? { trustScore: 92, verifiedBarber: true, verifiedLicense: true, completionRate: 96, moderationState: "clear" }
      : { trustScore: 0, verifiedBarber: false, verifiedLicense: false, completionRate: 0, moderationState: "watch", publicBadgeLabels: [], verificationDecision: shopDecision };
  } catch (error) {
    console.error("[activation-provider] trust state unavailable for activation gating", {
      scopeType,
      scopeId,
      message: error instanceof Error ? error.message : String(error)
    });
    return undefined;
  }
}

function mapUploadRow(row: any): VerificationUploadRecord {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_reference,
    category: row.category,
    fileName: row.file_name ?? row.storage_path?.split("/").slice(-1)[0] ?? "verification-document",
    contentType: row.content_type ?? "application/octet-stream",
    fileSizeBytes: Number(row.file_size_bytes ?? 0),
    storagePath: row.storage_path,
    secureReference: row.secure_reference ?? `secure://${row.owner_reference}/${row.id}`,
    uploadStatus: row.upload_status ?? "uploaded",
    uploadedByRole: row.uploaded_by_role ?? "owner",
    uploadedAt: row.uploaded_at,
    expiresAt: row.expires_at ?? undefined
  };
}

function campaignToRow(record: BoostCampaignRecord) {
  return {
    id: record.id,
    scope_type: record.scopeType,
    scope_reference: record.scopeId,
    status: record.status,
    placement_label: record.placementLabel,
    placement_scope: record.placementScope,
    city_slug: record.citySlug ?? null,
    category_slug: record.categorySlug ?? null,
    trust_eligible: record.trustEligible,
    trust_reason: record.trustReason,
    spend_cents: record.spendCents,
    daily_budget_cents: record.dailyBudgetCents,
    starts_at: record.startsAt,
    ends_at: record.endsAt,
    created_by_role: record.createdByRole,
    created_by_reference: record.createdById,
    created_at: record.createdAt
  };
}

function placementToRow(record: FeaturedPlacementRecord) {
  return {
    id: record.id,
    scope_type: record.scopeType,
    scope_reference: record.scopeId,
    label: record.label,
    placement_scope: record.placementScope,
    city_slug: record.citySlug ?? null,
    category_slug: record.categorySlug ?? null,
    status: record.status,
    trust_eligible: record.trustEligible,
    starts_at: record.startsAt,
    ends_at: record.endsAt,
    priority: record.priority,
    created_by_role: record.createdByRole,
    created_by_reference: record.createdById,
    created_at: record.createdAt
  };
}

function cityToRow(record: MarketplaceActivationState["cityRollouts"][number]) {
  return {
    id: record.id,
    city_slug: record.citySlug,
    city_label: record.cityLabel,
    state_code: record.stateCode,
    neighborhood_label: record.neighborhoodLabel ?? null,
    activation_state: record.activationState,
    density_score: record.densityScore,
    launch_visible: record.launchVisible,
    featured_barber_ids: record.featuredBarberIds,
    featured_shop_ids: record.featuredShopIds,
    market_notes: record.marketNotes,
    activated_at: record.activatedAt ?? null,
    updated_at: record.updatedAt
  };
}

function monetizationToRow(record: MarketplaceMonetizationEvent) {
  return {
    id: record.id,
    event_type: record.eventType,
    barber_reference: record.barberId ?? null,
    shop_reference: record.shopId ?? null,
    campaign_reference: record.campaignId ?? null,
    placement_reference: record.placementId ?? null,
    city_slug: record.citySlug ?? null,
    source_kind: record.sourceKind,
    reference_id: record.referenceId ?? null,
    metadata: record.metadata,
    created_at: record.createdAt
  };
}

async function readSupabaseState(supabase: SupabaseClient): Promise<MarketplaceActivationState> {
  const [uploads, campaigns, placements, cities, monetizationEvents] = await Promise.all([
    supabase.from("verification_documents").select("*").not("file_name", "is", null).order("uploaded_at", { ascending: false }),
    supabase.from("boost_campaigns").select("*").order("created_at", { ascending: false }),
    supabase.from("featured_placements").select("*").order("priority", { ascending: true }),
    supabase.from("city_rollouts").select("*").order("density_score", { ascending: false }),
    supabase.from("marketplace_monetization_events").select("*").order("created_at", { ascending: false })
  ]);

  for (const result of [uploads, campaigns, placements, cities, monetizationEvents]) {
    if (result.error) {
      throw result.error;
    }
  }

  return {
    verificationUploads: (uploads.data ?? []).map((row: any) => mapUploadRow(row)),
    boostCampaigns: (campaigns.data ?? []).map((row: any) => ({
      id: row.id,
      scopeType: row.scope_type,
      scopeId: row.scope_reference,
      status: row.status,
      placementLabel: row.placement_label,
      placementScope: row.placement_scope,
      citySlug: row.city_slug ?? undefined,
      categorySlug: row.category_slug ?? undefined,
      trustEligible: row.trust_eligible,
      trustReason: row.trust_reason,
      spendCents: Number(row.spend_cents ?? 0),
      dailyBudgetCents: Number(row.daily_budget_cents ?? 0),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      createdByRole: row.created_by_role,
      createdById: row.created_by_reference,
      createdAt: row.created_at
    })),
    featuredPlacements: (placements.data ?? []).map((row: any) => ({
      id: row.id,
      scopeType: row.scope_type,
      scopeId: row.scope_reference,
      label: row.label,
      placementScope: row.placement_scope,
      citySlug: row.city_slug ?? undefined,
      categorySlug: row.category_slug ?? undefined,
      status: row.status,
      trustEligible: row.trust_eligible,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      priority: Number(row.priority ?? 1),
      createdByRole: row.created_by_role,
      createdById: row.created_by_reference,
      createdAt: row.created_at
    })),
    cityRollouts: (cities.data ?? []).map((row: any) => ({
      id: row.id,
      citySlug: row.city_slug,
      cityLabel: row.city_label,
      stateCode: row.state_code,
      neighborhoodLabel: row.neighborhood_label ?? undefined,
      activationState: row.activation_state,
      densityScore: Number(row.density_score ?? 0),
      launchVisible: row.launch_visible,
      featuredBarberIds: row.featured_barber_ids ?? [],
      featuredShopIds: row.featured_shop_ids ?? [],
      marketNotes: row.market_notes,
      activatedAt: row.activated_at ?? undefined,
      updatedAt: row.updated_at
    })),
    monetizationEvents: (monetizationEvents.data ?? []).map((row: any) => ({
      id: row.id,
      eventType: row.event_type,
      barberId: row.barber_reference ?? undefined,
      shopId: row.shop_reference ?? undefined,
      campaignId: row.campaign_reference ?? undefined,
      placementId: row.placement_reference ?? undefined,
      citySlug: row.city_slug ?? undefined,
      sourceKind: row.source_kind,
      referenceId: row.reference_id ?? undefined,
      metadata: row.metadata ?? {},
      createdAt: row.created_at
    }))
  };
}

function createEmptyProvider(): MarketplaceActivationProvider {
  const unavailable = (): never => {
    throw new ActivationValidationError("Marketplace activation data is unavailable because Supabase is not configured.");
  };

  return {
    kind: "supabase",
    async readState() {
      return createEmptyMarketplaceActivationState();
    },
    async createVerificationUpload() {
      return unavailable();
    },
    async createBoostCampaign() {
      return unavailable();
    },
    async createFeaturedPlacement() {
      return unavailable();
    },
    async updateCityRollout() {
      return unavailable();
    },
    async recordMonetizationEvent() {
      unavailable();
    }
  };
}

export function createSupabaseMarketplaceActivationProvider(supabase: SupabaseClient): MarketplaceActivationProvider {
  return {
    kind: "supabase",
    async readState() {
      return readSupabaseState(supabase);
    },
    async createVerificationUpload(actor, input) {
      if (input.ownerType === "shop") {
        assertOwner(actor);
      }
      if (input.ownerType === "barber") {
        if (!isBarberAccountRole(actor.role) || !actor.barberId || actor.barberId !== (input.ownerId ?? actor.barberId)) {
          throw new ActivationPermissionError("Only a barber can upload verification documents for their own profile.");
        }
      }
      if (input.ownerType === "shop" && (
        input.category !== "business_verification"
        && input.category !== "ownership_verification"
      )) {
        throw new ActivationValidationError("Shop documents require a shop verification category.");
      }
      if (input.ownerType === "barber" && (
        input.category === "business_verification"
        || input.category === "ownership_verification"
      )) {
        throw new ActivationValidationError("Barber documents require a barber verification category.");
      }
      const ownerId = input.ownerId ?? actor.barberId;
      if (!ownerId) {
        throw new ActivationValidationError("A real owner reference is required for verification uploads.");
      }
      if (!actor.userId) {
        throw new ActivationPermissionError("A signed-in account is required for verification uploads.");
      }
      if (input.ownerType === "shop") {
        const shopResult = await supabase
          .from("shops")
          .select("id")
          .eq("id", ownerId)
          .eq("owner_profile_id", actor.userId)
          .limit(1)
          .maybeSingle();
        if (shopResult.error) throw shopResult.error;
        if (!shopResult.data) {
          throw new ActivationPermissionError("You can only upload verification documents for your own shop.");
        }
      }
      const uploadId = randomUUID();
      const upload: VerificationUploadRecord = {
        id: uploadId,
        ownerType: input.ownerType,
        ownerId,
        category: input.category,
        fileName: input.fileName,
        contentType: input.contentType,
        fileSizeBytes: input.fileSizeBytes,
        storagePath: `verification/uploads/${randomUUID()}`,
        secureReference: `secure://verification/${randomUUID()}`,
        uploadStatus: "uploaded",
        uploadedByRole: actor.role,
        uploadedAt: nowIso(),
        expiresAt: input.expiresAt
      };
      const result = await supabase.from("verification_documents").insert({
        id: upload.id,
        owner_type: upload.ownerType,
        owner_reference: upload.ownerId,
        user_id: actor.userId,
        shop_id: upload.ownerType === "shop" ? upload.ownerId : null,
        category: upload.category,
        storage_path: upload.storagePath,
        uploaded_at: upload.uploadedAt,
        expires_at: upload.expiresAt ?? null,
        file_name: upload.fileName,
        content_type: upload.contentType,
        file_size_bytes: upload.fileSizeBytes,
        upload_status: upload.uploadStatus,
        uploaded_by_role: upload.uploadedByRole,
        secure_reference: upload.secureReference,
        storage_bucket: "verification-private"
      });
      if (result.error) throw result.error;

      const signedUpload = await supabase.storage
        .from("verification-private")
        .createSignedUploadUrl(upload.storagePath, { upsert: false });
      if (signedUpload.error || !signedUpload.data?.signedUrl) {
        await supabase
          .from("verification_documents")
          .delete()
          .eq("id", upload.id)
          .eq("user_id", actor.userId);
        throw signedUpload.error ?? new Error("Unable to create a secure verification upload capability.");
      }

      return { upload, signedUploadUrl: signedUpload.data.signedUrl };
    },
    async createBoostCampaign(actor, input) {
      if (!(isShopOwnerRole(actor.role) || isBarberAccountRole(actor.role))) {
        throw new ActivationPermissionError("Only owner or barber roles can launch boosted visibility.");
      }
      const scopeType = input.scopeType;
      const scopeId = input.scopeId ?? actor.barberId;
      if (!scopeId) {
        throw new ActivationValidationError("A marketplace scope is required for this boost.");
      }
      if (!isShopOwnerRole(actor.role) && (scopeType !== "barber" || scopeId !== actor.barberId)) {
        throw new ActivationPermissionError("Barbers can only boost their own public profile.");
      }
      const trustSignal = await getTrustSignal(scopeType, scopeId);
      const eligibility = getMonetizationEligibility(trustSignal as any);
      if (!eligibility.canBoostVisibility) {
        throw new ActivationPermissionError(eligibility.reason);
      }
      const campaign: BoostCampaignRecord = {
        id: makeId("boost"),
        scopeType,
        scopeId,
        status: "active",
        placementLabel: input.placementLabel,
        placementScope: input.placementScope,
        citySlug: input.citySlug,
        categorySlug: input.categorySlug,
        trustEligible: true,
        trustReason: eligibility.reason,
        spendCents: input.spendCents,
        dailyBudgetCents: input.dailyBudgetCents,
        startsAt: input.startsAt ?? nowIso(),
        endsAt: input.endsAt ?? new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
        createdByRole: actor.role,
        createdById: actor.barberId ?? actor.userEmail ?? "owner",
        createdAt: nowIso()
      };
      const result = await supabase.from("boost_campaigns").upsert(campaignToRow(campaign), { onConflict: "id" });
      if (result.error) throw result.error;
      return { campaign };
    },
    async createFeaturedPlacement(actor, input) {
      assertOwner(actor);
      const trustSignal = await getTrustSignal(input.scopeType, input.scopeId);
      const eligibility = getMonetizationEligibility(trustSignal as any);
      if ((input.scopeType === "barber" && !eligibility.canUseFeaturedPlacement)
        || (input.scopeType === "shop" && !eligibility.canBoostVisibility)) {
        throw new ActivationPermissionError(eligibility.reason);
      }
      const placement: FeaturedPlacementRecord = {
        id: makeId("featured"),
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        label: input.label,
        placementScope: input.placementScope,
        citySlug: input.citySlug,
        categorySlug: input.categorySlug,
        status: "active",
        trustEligible: true,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        priority: input.priority,
        createdByRole: actor.role,
        createdById: actor.userEmail ?? "owner",
        createdAt: nowIso()
      };
      const result = await supabase.from("featured_placements").upsert(placementToRow(placement), { onConflict: "id" });
      if (result.error) throw result.error;
      return { placement };
    },
    async updateCityRollout(actor, input) {
      assertOwner(actor);
      const current = await readSupabaseState(supabase);
      const existing = current.cityRollouts.find((rollout) => rollout.citySlug === input.citySlug);
      if (!existing) {
        throw new ActivationValidationError("City rollout not found.");
      }
      const rollout = {
        ...existing,
        activationState: input.activationState ?? existing.activationState,
        launchVisible: input.launchVisible ?? existing.launchVisible,
        densityScore: input.densityScore ?? existing.densityScore,
        marketNotes: input.marketNotes ?? existing.marketNotes,
        updatedAt: nowIso()
      };
      const result = await supabase.from("city_rollouts").upsert(cityToRow(rollout), { onConflict: "id" });
      if (result.error) throw result.error;
      return { rollout };
    },
    async recordMonetizationEvent(input) {
      const event: MarketplaceMonetizationEvent = {
        id: makeId("monetize"),
        createdAt: nowIso(),
        ...input
      };
      const result = await supabase.from("marketplace_monetization_events").upsert(monetizationToRow(event), { onConflict: "id" });
      if (result.error) throw result.error;
    }
  };
}

export async function getMarketplaceActivationProvider(): Promise<MarketplaceActivationProvider> {
  if (!isSupabaseEnabled()) {
    return createEmptyProvider();
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return createEmptyProvider();
  }

  return createSupabaseMarketplaceActivationProvider(supabase);
}



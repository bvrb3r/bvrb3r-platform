import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isBarberAccountRole, isShopOwnerRole, normalizeAccountRole } from "@/lib/auth/roles";
import { toPublicMediaUrl } from "@/lib/profile/public-media-url";
import type { Role, UserAccount } from "@/types/domain";

export type CultureSurfaceRole = "client" | "barber" | "owner" | "shop";
export type CultureActorRole = "client_user" | "barber_user" | "shop_owner_user";

export type CultureMediaItem = {
  id: string;
  url: string | null;
  thumbnailUrl: string | null;
  mediaType: "image" | "video";
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

export type CultureFeedReasonCode =
  | "following_author"
  | "saved_similar"
  | "barber_work"
  | "shop_culture"
  | "popular_saved"
  | "recent_public_post"
  | "promoted_native"
  | "bookable_barber";

export type CultureDiscoveryModuleItem = {
  id: string;
  postId: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  route: string;
  ctaLabel: string;
  itemType: "barber_work" | "shop_culture";
  reasonCodes: CultureFeedReasonCode[];
};

export type CultureFeedModule = {
  id: string;
  type: "discovery_grid";
  moduleTitle: string;
  moduleSubtitle: string;
  reason: string;
  reasonCodes: CultureFeedReasonCode[];
  items: CultureDiscoveryModuleItem[];
};

export type CultureFeedItem = {
  id: string;
  authorProfileId: string;
  authorTargetKind: "client" | "barber" | "shop";
  authorTarget: string | null;
  barberId: string | null;
  shopId: string | null;
  serviceId: string | null;
  authorDisplayName: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  authorRoleLabel: string;
  authorVerified: boolean;
  caption: string;
  postType: string;
  media: CultureMediaItem | null;
  createdAt: string;
  serviceName?: string | null;
  shopName?: string | null;
  shopUsername?: string | null;
  profileUrl: string | null;
  bookingUrl: string | null;
  shopUrl: string | null;
  canViewProfile: boolean;
  canViewShop: boolean;
  bookLabel: string | null;
  bookingDisabledReason: string | null;
  canLike: boolean;
  canSave: boolean;
  canShare: boolean;
  canReport: boolean;
  canBook: boolean;
  canComment: boolean;
  isPromoted?: boolean;
  promotionLabel?: string | null;
  reasonCodes?: CultureFeedReasonCode[];
  reasonLabel?: string | null;
};

export type CultureFeedResponse = {
  items: CultureFeedItem[];
  modules?: CultureFeedModule[];
  cursor: string | null;
  hasMore: boolean;
  error?: string;
};

export type CulturePostEngagementAction = "like" | "unlike" | "save" | "unsave" | "share" | "report" | "profile_click" | "book_click" | "shop_click";
export type CultureFollowAction = "follow" | "unfollow";

export type CulturePostCtaState = {
  profileUrl: string | null;
  bookingUrl: string | null;
  shopUrl: string | null;
  canViewProfile: boolean;
  canViewShop: boolean;
  canBook: boolean;
  bookLabel: string | null;
  bookingDisabledReason: string | null;
};

export type CultureComposerRole = "barber" | "owner";
export type CultureProfileMediaRole = CultureComposerRole | "client";
export type CultureProfileMediaSourceType = "client_profile_post" | "barber_portfolio" | "shop_media_asset";

export type CultureComposerPostTypeOption = {
  label: string;
  value: string;
};

export type CultureComposerAccess = {
  role: CultureComposerRole;
  actorRole: Extract<CultureActorRole, "barber_user" | "shop_owner_user">;
  authorProfileId: string;
  barberId: string | null;
  barberReference?: string | null;
  shopId: string | null;
  approvalStatus?: string | null;
  canCompose: boolean;
  blockedReason: string | null;
};

export type CultureComposerInput = {
  role: CultureComposerRole;
  postType: string;
  caption?: string | null;
  barberId?: string | null;
  shopId?: string | null;
  serviceId?: string | null;
  isBookable?: boolean;
  tags?: string[];
  cta?: string | null;
};

export type CultureMediaUploadInput = {
  role: CultureComposerRole;
  postId: string;
  fileName: string;
  contentType: string;
  size: number;
  bytes: ArrayBuffer;
};

export type CultureProfileMediaInput = {
  role: CultureProfileMediaRole;
  sourceType: CultureProfileMediaSourceType;
  sourceId: string;
  caption?: string | null;
  submitForReview?: boolean;
};

export type AutoCultureProfileMediaInput = {
  role: CultureProfileMediaRole;
  sourceTable: CultureProfileMediaSourceType;
  sourceId: string;
  caption?: string | null;
  storagePath?: string | null;
  imageUrl?: string | null;
  mediaAssetId?: string | null;
  barberId?: string | null;
  shopId?: string | null;
  serviceId?: string | null;
  postType?: string | null;
};

export type AutoCultureProfileMediaResult = {
  status: "created" | "updated" | "skipped";
  reason?: string;
  post?: CulturePostRow;
  summary?: CultureMyPostSummary;
  media?: CultureMediaItem;
};

export type CultureMyPostSummary = {
  id: string;
  caption: string;
  postType: string;
  visibility: string;
  moderationStatus: string;
  publishingStatus: string;
  createdAt: string;
};

export type CultureMyPosts = {
  drafts: CultureMyPostSummary[];
  pendingReview: CultureMyPostSummary[];
  published: CultureMyPostSummary[];
  archived: CultureMyPostSummary[];
};

export type CulturePostRow = {
  id: string;
  author_profile_id: string;
  author_role: CultureActorRole | Role | string;
  barber_id?: string | null;
  shop_id?: string | null;
  client_id?: string | null;
  appointment_id?: string | null;
  service_id?: string | null;
  post_type: string;
  caption?: string | null;
  visibility: string;
  moderation_status: string;
  publishing_status: string;
  is_bookable?: boolean | null;
  allow_comments?: boolean | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  deleted_at?: string | null;
};

type CultureMediaRow = {
  id: string;
  post_id: string;
  media_asset_id?: string | null;
  media_url?: string | null;
  thumbnail_url?: string | null;
  media_type: string;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  sort_order?: number | null;
  processing_status?: string | null;
  moderation_status?: string | null;
  source_table?: string | null;
  source_id?: string | null;
  source_surface?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CulturePromotionRow = {
  id: string;
  post_id: string;
  promoter_profile_id?: string | null;
  promoter_role?: CultureActorRole | Role | string | null;
  status: string;
  goal?: string | null;
  budget_cents?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

type PublicProfileRow = {
  id: string;
  full_name?: string | null;
  public_username?: string | null;
  profile_photo_path?: string | null;
  profile_photo_url?: string | null;
  role?: Role | string | null;
};

type PublicShopRow = {
  id: string;
  name?: string | null;
  public_username?: string | null;
};

type PublicServiceRow = {
  id: string;
  name?: string | null;
  active?: boolean | null;
  is_bookable?: boolean | null;
};

type BarberPortfolioSourceRow = {
  id: string;
  barber_reference: string;
  storage_path: string | null;
  image_url?: string | null;
  caption?: string | null;
  featured?: boolean | null;
};

type ShopMediaSourceRow = {
  id: string;
  shop_reference: string;
  storage_path: string | null;
  image_url?: string | null;
  caption?: string | null;
  featured?: boolean | null;
};

type QueryResult<T> = {
  data: T | null;
  error: Error | { message?: string } | null;
};

type QueryLike<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string) => QueryLike<T>;
  eq: (column: string, value: unknown) => QueryLike<T>;
  in: (column: string, values: readonly unknown[]) => QueryLike<T>;
  is: (column: string, value: unknown) => QueryLike<T>;
  or: (filters: string) => QueryLike<T>;
  order: (column: string, options?: Record<string, unknown>) => QueryLike<T>;
  limit: (count: number) => QueryLike<T>;
  insert: (values: unknown) => QueryLike<T>;
  update: (values: unknown) => QueryLike<T>;
  upsert: (values: unknown, options?: Record<string, unknown>) => QueryLike<T>;
  delete: () => QueryLike<T>;
  single: () => QueryLike<T>;
  maybeSingle: () => QueryLike<T>;
};

type SupabaseLike = {
  from: (table: string) => QueryLike;
  storage?: {
    from: (bucket: string) => {
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      createSignedUrl?: (path: string, expiresIn: number) => Promise<{ data: { signedUrl?: string } | null; error: Error | { message?: string } | null }>;
      upload?: (
        path: string,
        body: ArrayBuffer | Uint8Array | Blob,
        options?: { contentType?: string; upsert?: boolean }
      ) => Promise<{ data: unknown; error: Error | { message?: string } | null }>;
    };
  };
};

export type CultureServiceSupabaseClient = SupabaseLike;

type CultureServiceDeps = {
  supabase?: SupabaseLike | null;
};

type LookupMaps = {
  mediaByPost?: Map<string, CultureMediaRow[]>;
  profilesById?: Map<string, PublicProfileRow>;
  shopsById?: Map<string, PublicShopRow>;
  servicesById?: Map<string, PublicServiceRow>;
  promotionsByPost?: Map<string, CulturePromotionRow>;
  storageClient?: {
    storage: {
      from: (bucket: string) => {
        getPublicUrl: (path: string) => { data: { publicUrl: string } };
        createSignedUrl?: (path: string, expiresIn: number) => Promise<{ data: { signedUrl?: string } | null; error: Error | { message?: string } | null }>;
      };
    };
  } | null;
};

type CulturePersonalizationSignals = {
  followedAuthorIds: Set<string>;
  savedPostIds: Set<string>;
  likedPostIds: Set<string>;
  suppressedPostIds: Set<string>;
};

// Culture media storage is server-only; browsers upload through the API route after role checks.
const cultureMediaBucket = process.env.CULTURE_MEDIA_BUCKET ?? "culture-media";
const maxCultureImageBytes = 10 * 1024 * 1024;
const allowedCultureImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

const allowedFeedEvents = new Set([
  "feed_loaded",
  "post_impression",
  "post_view",
  "post_click",
  "like_clicked",
  "save_clicked",
  "share_clicked",
  "profile_clicked",
  "book_clicked",
  "shop_clicked",
  "not_interested",
  "report_clicked",
  "grid_tile_clicked"
]);

const allowedEngagements = new Set([
  "view",
  "watch_complete",
  "like",
  "save",
  "share",
  "comment",
  "profile_click",
  "book_click",
  "shop_click",
  "message_click",
  "not_interested",
  "report"
]);

const barberComposerPostTypes: CultureComposerPostTypeOption[] = [
  { label: "Fresh Cut", value: "barber_cut" },
  { label: "Before / After", value: "barber_before_after" },
  { label: "Availability", value: "barber_availability" },
  { label: "Tutorial", value: "barber_tutorial" },
  { label: "Portfolio Highlight", value: "barber_cut" },
  { label: "Service Spotlight", value: "barber_cut" }
];

const ownerComposerPostTypes: CultureComposerPostTypeOption[] = [
  { label: "Shop Update", value: "shop_update" },
  { label: "Walk-Ins Open", value: "shop_walkins" },
  { label: "Team Highlight", value: "shop_team" },
  { label: "Event", value: "shop_update" },
  { label: "Open Chair", value: "shop_open_chair" },
  { label: "Hiring", value: "shop_open_chair" },
  { label: "Offer", value: "shop_update" },
  { label: "Shop Culture", value: "shop_update" }
];

const demoCultureEvents: Array<Record<string, unknown>> = [];
const demoCultureEngagements = new Map<string, Record<string, unknown>>();

export class CultureComposerError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CultureComposerError";
    this.status = status;
  }
}

function maybeSupabase(deps?: CultureServiceDeps) {
  return (deps?.supabase ?? createSupabaseAdminClient()) as SupabaseLike | null;
}

function cleanLimit(limit?: number) {
  if (!Number.isFinite(limit)) {
    return 20;
  }

  return Math.max(1, Math.min(50, Math.floor(limit ?? 20)));
}

function dbRoleForSurface(role?: CultureSurfaceRole | Role | string): CultureActorRole {
  if (role === "barber" || role === "barber_user") {
    return "barber_user";
  }

  if (role === "owner" || role === "shop" || role === "shop_owner_user") {
    return "shop_owner_user";
  }

  return "client_user";
}

function dbRoleForUser(user: UserAccount): CultureActorRole {
  return dbRoleForSurface(normalizeAccountRole(user.role));
}

export function getCultureComposerPostTypeOptions(role: CultureComposerRole) {
  return role === "barber" ? barberComposerPostTypes : ownerComposerPostTypes;
}

function roleLabel(role: CultureActorRole | Role | string) {
  switch (role) {
    case "barber_user":
    case "barber":
    case "commission_barber":
    case "booth_rent_barber":
    case "freelance_barber":
      return "Barber";
    case "shop_owner_user":
    case "owner":
      return "Shop Owner";
    case "platform_admin":
    case "architect":
      return "BVRB3R";
    default:
      return "Client";
  }
}

function authorTargetKindForPost(post: CulturePostRow): "client" | "barber" | "shop" {
  if (post.barber_id || roleLabel(post.author_role) === "Barber") {
    return "barber";
  }

  if (post.shop_id || post.author_role === "shop_owner_user" || post.author_role === "owner") {
    return "shop";
  }

  return "client";
}

function authorTargetForPost(post: CulturePostRow, profile?: PublicProfileRow | null, shop?: PublicShopRow | null) {
  const targetKind = authorTargetKindForPost(post);
  if (targetKind === "shop") {
    return safeNullableText(shop?.public_username) ?? safeNullableText(post.shop_id);
  }

  return safeNullableText(profile?.public_username);
}

function appendCultureAttribution(
  href: string,
  post: Pick<CulturePostRow, "id" | "author_profile_id">,
  cta: string
) {
  const [path, queryString = ""] = href.split("?");
  const params = new URLSearchParams(queryString);
  params.set("source", "culture");
  params.set("culturePostId", post.id);
  params.set("cultureAuthorId", post.author_profile_id);
  params.set("cultureSurface", "client_culture");
  params.set("cta", cta);

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function buildCultureBookingUrl(post: CulturePostRow, authorTarget: string | null, service: PublicServiceRow | null | undefined, serviceBookable: boolean) {
  if (!post.barber_id || !post.is_bookable) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("source", "culture");
  params.set("culturePostId", post.id);
  params.set("cultureAuthorId", post.author_profile_id);
  params.set("cultureSurface", "client_culture");
  params.set("barberId", post.barber_id);

  if (authorTarget) {
    params.set("barber", authorTarget);
  }

  if (post.shop_id) {
    params.set("locationId", post.shop_id);
    params.set("shopId", post.shop_id);
  }

  if (post.service_id && serviceBookable) {
    params.set("serviceId", post.service_id);
    params.set("cta", "book_service");
  } else {
    params.set("cta", "book_barber");
  }

  if (service?.name && serviceBookable) {
    params.set("query", service.name);
  }

  return `/booking/new?${params.toString()}`;
}

export function getCulturePostTargetRoutes(
  post: CulturePostRow,
  lookups: Pick<LookupMaps, "profilesById" | "shopsById" | "servicesById"> = {}
) {
  const profile = lookups.profilesById?.get(post.author_profile_id);
  const shop = post.shop_id ? lookups.shopsById?.get(post.shop_id) : null;
  const service = post.service_id ? lookups.servicesById?.get(post.service_id) : null;
  const authorTargetKind = authorTargetKindForPost(post);
  const authorTarget = authorTargetForPost(post, profile, shop);
  const serviceBookable = Boolean(post.service_id && service && service.active !== false && service.is_bookable !== false);
  const barberProfileTarget = authorTargetKind === "barber" ? authorTarget ?? safeNullableText(post.barber_id) : null;
  const shopTarget = authorTargetKind === "shop"
    ? authorTarget ?? safeNullableText(post.shop_id)
    : safeNullableText(shop?.public_username) ?? safeNullableText(post.shop_id);
  const profileUrl = barberProfileTarget
    ? appendCultureAttribution(`/barber/${encodeURIComponent(barberProfileTarget)}`, post, "view_profile")
    : null;
  const shopUrl = shopTarget
    ? appendCultureAttribution(`/shop/${encodeURIComponent(shopTarget)}`, post, "view_shop")
    : null;
  const bookingUrl = buildCultureBookingUrl(post, barberProfileTarget, service, serviceBookable);

  return {
    profileUrl,
    bookingUrl,
    shopUrl,
    authorTargetKind,
    authorTarget,
    serviceBookable
  };
}

export function getCulturePostCtaState(
  post: CulturePostRow,
  lookups: Pick<LookupMaps, "profilesById" | "shopsById" | "servicesById"> = {}
): CulturePostCtaState {
  const service = post.service_id ? lookups.servicesById?.get(post.service_id) : null;
  const routes = getCulturePostTargetRoutes(post, lookups);
  const isBarberPost = routes.authorTargetKind === "barber";
  const isShopPost = routes.authorTargetKind === "shop";
  const bookLabel = routes.bookingUrl
    ? routes.serviceBookable
      ? `Book ${safeText(service?.name, "This Cut")}`
      : "Book This Barber"
    : null;

  return {
    profileUrl: isBarberPost ? routes.profileUrl : null,
    bookingUrl: routes.bookingUrl,
    shopUrl: isShopPost ? routes.shopUrl : null,
    canViewProfile: Boolean(isBarberPost && routes.profileUrl),
    canViewShop: Boolean(isShopPost && routes.shopUrl),
    canBook: Boolean(routes.bookingUrl),
    bookLabel,
    bookingDisabledReason: routes.bookingUrl ? null : "Book-from-post requires a public approved bookable barber or service."
  };
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeNullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pushUniqueReason(reasons: CultureFeedReasonCode[], reason: CultureFeedReasonCode) {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function cultureReasonLabel(reasons: CultureFeedReasonCode[]) {
  if (reasons.includes("promoted_native")) {
    return "Promoted";
  }

  if (reasons.includes("following_author")) {
    return "Because you follow this creator";
  }

  if (reasons.includes("bookable_barber")) {
    return "Bookable barber work";
  }

  if (reasons.includes("shop_culture")) {
    return "Shop culture";
  }

  if (reasons.includes("barber_work")) {
    return "Barber work";
  }

  if (reasons.includes("saved_similar")) {
    return "Based on saved Culture signals";
  }

  return "Recent from BVRB3R";
}

function isAbsoluteMediaUrl(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith("/mock-storage/");
}

function normalizeCaption(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 2200) : "";
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeComposerPostType(role: CultureComposerRole, input: string) {
  const normalized = input.trim();
  const options = getCultureComposerPostTypeOptions(role);
  const byValue = options.find((option) => option.value === normalized);
  if (byValue) {
    return byValue.value;
  }

  const byLabel = options.find((option) => option.label.toLowerCase() === normalized.toLowerCase());
  if (byLabel) {
    return byLabel.value;
  }

  throw new CultureComposerError("Unsupported Culture post type.", 400);
}

function cleanTags(tags?: string[]) {
  return [...new Set((tags ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => /^[a-z0-9 _-]{2,40}$/.test(tag))
    .slice(0, 8))];
}

function validateCultureImageUpload(input: Pick<CultureMediaUploadInput, "contentType" | "size">) {
  const normalizedType = input.contentType.trim().toLowerCase();
  const extension = allowedCultureImageTypes.get(normalizedType);
  if (!extension) {
    throw new CultureComposerError("Only JPEG, PNG, and WebP Culture images are supported.", 400);
  }

  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new CultureComposerError("Choose a real image to upload.", 400);
  }

  if (input.size > maxCultureImageBytes) {
    throw new CultureComposerError("Culture image uploads must be 10MB or smaller.", 400);
  }

  return { contentType: normalizedType, extension };
}

function isApprovalBlocked(status?: string | null) {
  return status === "pending" || status === "under_review" || status === "rejected";
}

function assertCanCompose(access: CultureComposerAccess) {
  if (!access.canCompose) {
    throw new CultureComposerError(access.blockedReason ?? "Culture posting is not available for this account.", 403);
  }
}

function summarizeOwnPost(row: CulturePostRow): CultureMyPostSummary {
  return {
    id: row.id,
    caption: safeText(row.caption, "Untitled Culture post"),
    postType: row.post_type,
    visibility: row.visibility,
    moderationStatus: row.moderation_status,
    publishingStatus: row.publishing_status,
    createdAt: row.created_at
  };
}

function emptyMyPosts(): CultureMyPosts {
  return {
    drafts: [],
    pendingReview: [],
    published: [],
    archived: []
  };
}

function encodeCursor(post: CulturePostRow) {
  return Buffer.from(JSON.stringify({ createdAt: post.created_at, id: post.id }), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string | null) {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { createdAt?: string; id?: string };
    if (parsed.createdAt && parsed.id) {
      return parsed as { createdAt: string; id: string };
    }
  } catch {
    return null;
  }

  return null;
}

function throwIfError(result: QueryResult<unknown>, fallback: string) {
  if (result.error) {
    throw new Error(result.error instanceof Error ? result.error.message : result.error.message ?? fallback);
  }
}

function buildMap<T extends { id: string }>(rows: T[] | null | undefined) {
  return new Map((rows ?? []).map((row) => [row.id, row]));
}

function isActiveCulturePromotion(row: CulturePromotionRow, now = new Date()) {
  if (row.status !== "active" && row.status !== "approved") {
    return false;
  }

  const startsAt = safeNullableText(row.starts_at);
  const endsAt = safeNullableText(row.ends_at);
  const nowMs = now.getTime();
  if (startsAt && new Date(startsAt).getTime() > nowMs) {
    return false;
  }

  if (endsAt && new Date(endsAt).getTime() < nowMs) {
    return false;
  }

  return true;
}

function groupActivePromotions(rows: CulturePromotionRow[] | null | undefined) {
  const grouped = new Map<string, CulturePromotionRow>();
  for (const row of rows ?? []) {
    if (!safeNullableText(row.post_id) || !isActiveCulturePromotion(row)) {
      continue;
    }

    const current = grouped.get(row.post_id);
    if (!current || String(row.created_at ?? "").localeCompare(String(current.created_at ?? "")) > 0) {
      grouped.set(row.post_id, row);
    }
  }

  return grouped;
}

function groupMedia(rows: CultureMediaRow[] | null | undefined) {
  const grouped = new Map<string, CultureMediaRow[]>();
  for (const row of rows ?? []) {
    if (row.processing_status && row.processing_status !== "ready") {
      continue;
    }

    if (row.moderation_status && row.moderation_status !== "approved") {
      continue;
    }

    grouped.set(row.post_id, [...(grouped.get(row.post_id) ?? []), row]);
  }

  for (const values of grouped.values()) {
    values.sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
  }

  return grouped;
}

async function signCultureMediaPath(
  supabase: SupabaseLike,
  path: string | null | undefined,
  metadata?: Record<string, unknown> | null
) {
  const cleanPath = safeNullableText(path);
  if (!cleanPath) {
    return null;
  }

  if (isAbsoluteMediaUrl(cleanPath)) {
    return cleanPath;
  }

  const bucket = typeof metadata?.storageBucket === "string" && metadata.storageBucket.trim()
    ? metadata.storageBucket.trim()
    : cultureMediaBucket;
  const signer = supabase.storage?.from(bucket).createSignedUrl;
  if (!signer) {
    return null;
  }

  const result = await signer(cleanPath, 60 * 60);
  if (result.error) {
    return null;
  }

  return result.data?.signedUrl ?? null;
}

async function prepareCultureMediaRows(supabase: SupabaseLike, rows: CultureMediaRow[]) {
  return Promise.all(rows.map(async (row) => ({
    ...row,
    media_url: await signCultureMediaPath(supabase, row.media_url, row.metadata),
    thumbnail_url: await signCultureMediaPath(supabase, row.thumbnail_url, row.metadata)
  })));
}

function cultureLookupErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Unknown Culture feed lookup error.";
}

async function fetchOptionalRows<T>(query: QueryLike, lookup: string) {
  try {
    const result = await query as QueryResult<T[]>;
    if (result.error) {
      console.error("[culture-feed] optional_lookup_failed", {
        lookup,
        error: cultureLookupErrorMessage(result.error)
      });
      return [];
    }

    return result.data ?? [];
  } catch (error) {
    console.error("[culture-feed] optional_lookup_failed", {
      lookup,
      error: cultureLookupErrorMessage(error)
    });
    return [];
  }
}

async function loadFeedLookups(supabase: SupabaseLike, posts: CulturePostRow[]): Promise<LookupMaps> {
  const postIds = posts.map((post) => post.id);
  const authorIds = [...new Set(posts.map((post) => post.author_profile_id).filter(Boolean))];
  const shopIds = [...new Set(posts.map((post) => post.shop_id).filter(Boolean))] as string[];
  const serviceIds = [...new Set(posts.map((post) => post.service_id).filter(Boolean))] as string[];

  const [rawMediaRows, profileRows, shopRows, serviceRows, promotionRows] = await Promise.all([
    postIds.length
      ? fetchOptionalRows<CultureMediaRow>(
        supabase
          .from("culture_media")
          .select("id, post_id, media_url, thumbnail_url, media_type, width, height, duration_seconds, sort_order, processing_status, moderation_status, metadata")
          .in("post_id", postIds)
          .order("sort_order", { ascending: true }),
        "media"
      )
      : Promise.resolve([]),
    authorIds.length
      ? fetchOptionalRows<PublicProfileRow>(
        supabase
          .from("profiles")
          .select("id, full_name, public_username, profile_photo_path, profile_photo_url, role")
          .in("id", authorIds),
        "profiles"
      )
      : Promise.resolve([]),
    shopIds.length
      ? fetchOptionalRows<PublicShopRow>(
        supabase
          .from("shops")
          .select("id, name, public_username")
          .in("id", shopIds),
        "shops"
      )
      : Promise.resolve([]),
    serviceIds.length
      ? fetchOptionalRows<PublicServiceRow>(
        supabase
          .from("services")
          .select("id, name, active, is_bookable")
          .in("id", serviceIds),
        "services"
      )
      : Promise.resolve([]),
    postIds.length
      ? fetchOptionalRows<CulturePromotionRow>(
        supabase
          .from("culture_promotions")
          .select("id, post_id, promoter_profile_id, promoter_role, status, goal, budget_cents, starts_at, ends_at, metadata, created_at")
          .in("post_id", postIds),
        "promotions"
      )
      : Promise.resolve([])
  ]);
  const mediaRows = await prepareCultureMediaRows(supabase, rawMediaRows);

  return {
    mediaByPost: groupMedia(mediaRows),
    profilesById: buildMap(profileRows),
    shopsById: buildMap(shopRows),
    servicesById: buildMap(serviceRows),
    promotionsByPost: groupActivePromotions(promotionRows),
    storageClient: supabase.storage ? { storage: supabase.storage } : null
  };
}

function emptyCulturePersonalizationSignals(): CulturePersonalizationSignals {
  return {
    followedAuthorIds: new Set(),
    savedPostIds: new Set(),
    likedPostIds: new Set(),
    suppressedPostIds: new Set()
  };
}

export async function getCulturePersonalizationSignals(
  supabase: SupabaseLike,
  viewerProfileId?: string | null
): Promise<CulturePersonalizationSignals> {
  const profileId = safeNullableText(viewerProfileId);
  if (!profileId) {
    return emptyCulturePersonalizationSignals();
  }

  const [edgeRows, engagementRows, reportRows] = await Promise.all([
    fetchOptionalRows<Record<string, unknown>>(
      supabase
        .from("user_engagement_edges")
        .select("target_profile_id, target_id, target_type, edge_type, status, deleted_at")
        .eq("actor_profile_id", profileId),
      "viewer_edges"
    ),
    fetchOptionalRows<Record<string, unknown>>(
      supabase
        .from("culture_engagements")
        .select("post_id, engagement_type, metadata")
        .eq("actor_profile_id", profileId),
      "viewer_culture_engagements"
    ),
    fetchOptionalRows<Record<string, unknown>>(
      supabase
        .from("culture_reports")
        .select("post_id, status")
        .eq("reporter_profile_id", profileId),
      "viewer_culture_reports"
    )
  ]);

  const signals = emptyCulturePersonalizationSignals();
  for (const edge of edgeRows) {
    if (edge.edge_type !== "follow" || edge.status === "removed" || edge.deleted_at) {
      continue;
    }

    const targetProfileId = safeNullableText(edge.target_profile_id) ?? (edge.target_type === "profile" ? safeNullableText(edge.target_id) : null);
    if (targetProfileId) {
      signals.followedAuthorIds.add(targetProfileId);
    }
  }

  for (const engagement of engagementRows) {
    const postId = safeNullableText(engagement.post_id);
    if (!postId) {
      continue;
    }

    if (engagement.engagement_type === "save") {
      signals.savedPostIds.add(postId);
    } else if (engagement.engagement_type === "like") {
      signals.likedPostIds.add(postId);
    } else if (engagement.engagement_type === "not_interested" || engagement.engagement_type === "report") {
      signals.suppressedPostIds.add(postId);
    }
  }

  for (const report of reportRows) {
    const postId = safeNullableText(report.post_id);
    if (postId && report.status !== "resolved") {
      signals.suppressedPostIds.add(postId);
    }
  }

  return signals;
}

export function buildCultureReasonCodes(
  post: CulturePostRow,
  lookups: Pick<LookupMaps, "promotionsByPost" | "profilesById" | "shopsById" | "servicesById"> = {},
  signals: CulturePersonalizationSignals = emptyCulturePersonalizationSignals()
): CultureFeedReasonCode[] {
  const reasons: CultureFeedReasonCode[] = [];
  const ctaState = getCulturePostCtaState(post, lookups);

  if (lookups.promotionsByPost?.has(post.id)) {
    pushUniqueReason(reasons, "promoted_native");
  }

  if (signals.followedAuthorIds.has(post.author_profile_id)) {
    pushUniqueReason(reasons, "following_author");
  }

  if (signals.savedPostIds.has(post.id) || signals.likedPostIds.has(post.id)) {
    pushUniqueReason(reasons, "saved_similar");
  }

  if (authorTargetKindForPost(post) === "barber") {
    pushUniqueReason(reasons, "barber_work");
  } else if (authorTargetKindForPost(post) === "shop") {
    pushUniqueReason(reasons, "shop_culture");
  }

  if (ctaState.canBook) {
    pushUniqueReason(reasons, "bookable_barber");
  }

  pushUniqueReason(reasons, "recent_public_post");
  return reasons;
}

function culturePostPersonalizationScore(post: CulturePostRow, lookups: LookupMaps, signals: CulturePersonalizationSignals) {
  let score = 0;
  if (lookups.promotionsByPost?.has(post.id)) {
    score += 100;
  }

  if (signals.followedAuthorIds.has(post.author_profile_id)) {
    score += 50;
  }

  if (signals.savedPostIds.has(post.id)) {
    score += 20;
  }

  if (signals.likedPostIds.has(post.id)) {
    score += 10;
  }

  return score;
}

export function rankCultureFeedItems(
  posts: CulturePostRow[],
  lookups: LookupMaps = {},
  signals: CulturePersonalizationSignals = emptyCulturePersonalizationSignals()
) {
  return [...posts]
    .filter((post) => !signals.suppressedPostIds.has(post.id))
    .sort((left, right) => {
      const scoreDelta = culturePostPersonalizationScore(right, lookups, signals) - culturePostPersonalizationScore(left, lookups, signals);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const createdDelta = String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""));
      if (createdDelta !== 0) {
        return createdDelta;
      }

      return String(right.id).localeCompare(String(left.id));
    });
}

function discoveryItemImage(item: CultureFeedItem) {
  return item.media?.thumbnailUrl ?? item.media?.url ?? null;
}

function barberDiscoveryRoute(item: CultureFeedItem) {
  if (item.canBook && item.bookingUrl) {
    return { route: item.bookingUrl, ctaLabel: item.bookLabel ?? "Book This Barber" };
  }

  if (item.canViewProfile && item.profileUrl) {
    return { route: item.profileUrl, ctaLabel: "View Profile" };
  }

  return null;
}

function shopDiscoveryRoute(item: CultureFeedItem) {
  if (item.canViewShop && item.shopUrl) {
    return { route: item.shopUrl, ctaLabel: "View Shop" };
  }

  return null;
}

export function buildCultureDiscoveryModules(items: CultureFeedItem[], role: CultureSurfaceRole | Role | string = "client"): CultureFeedModule[] {
  const barberItems: CultureDiscoveryModuleItem[] = items
    .filter((item) => item.authorTargetKind === "barber" && discoveryItemImage(item) && barberDiscoveryRoute(item))
    .slice(0, 6)
    .map((item) => {
      const route = barberDiscoveryRoute(item);
      return {
        id: `barber-work-${item.id}`,
        postId: item.id,
        title: item.authorDisplayName,
        subtitle: item.serviceName ?? item.caption,
        imageUrl: discoveryItemImage(item) ?? "",
        route: route?.route ?? "",
        ctaLabel: route?.ctaLabel ?? "View Profile",
        itemType: "barber_work" as const,
        reasonCodes: item.canBook ? ["barber_work", "bookable_barber"] : ["barber_work"]
      };
    });

  const shopItems: CultureDiscoveryModuleItem[] = items
    .filter((item) => item.authorTargetKind === "shop" && discoveryItemImage(item) && shopDiscoveryRoute(item))
    .slice(0, 6)
    .map((item) => {
      const route = shopDiscoveryRoute(item);
      return {
        id: `shop-culture-${item.id}`,
        postId: item.id,
        title: item.shopName ?? item.authorDisplayName,
        subtitle: item.caption,
        imageUrl: discoveryItemImage(item) ?? "",
        route: route?.route ?? "",
        ctaLabel: route?.ctaLabel ?? "View Shop",
        itemType: "shop_culture" as const,
        reasonCodes: ["shop_culture"]
      };
    });

  const modules: CultureFeedModule[] = [];
  const shopModule = shopItems.length ? {
    id: "shop-culture",
    type: "discovery_grid" as const,
    moduleTitle: "Shop Culture",
    moduleSubtitle: "Real shop moments from the BVRB3R community.",
    reason: "Shop culture",
    reasonCodes: ["shop_culture" as const],
    items: shopItems
  } : null;
  const barberModule = barberItems.length ? {
    id: "barber-work",
    type: "discovery_grid" as const,
    moduleTitle: "Barber Work",
    moduleSubtitle: "Approved barber work from the BVRB3R community.",
    reason: "Barber work",
    reasonCodes: ["barber_work" as const],
    items: barberItems
  } : null;

  if (role === "owner" || role === "shop" || role === "shop_owner_user") {
    if (shopModule) modules.push(shopModule);
    if (barberModule) modules.push(barberModule);
  } else {
    if (barberModule) modules.push(barberModule);
    if (shopModule) modules.push(shopModule);
  }

  return modules;
}

async function readOwnedBarberId(user: UserAccount, supabase: SupabaseLike) {
  const result = await supabase
    .from("barbers")
    .select("id, reference_code, app_approval_status")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle() as QueryResult<{ id?: string | null; reference_code?: string | null; app_approval_status?: string | null }>;

  throwIfError(result as QueryResult<unknown>, "Unable to resolve barber Culture ownership.");
  if (!result.data?.id) {
    return { barberId: null, approvalStatus: null };
  }

  return {
    barberId: result.data.id,
    approvalStatus: result.data.app_approval_status ?? user.appApprovalStatus ?? null,
    referenceCode: result.data.reference_code ?? user.barberId ?? null
  };
}

async function readOwnedShopId(user: UserAccount, supabase: SupabaseLike) {
  const ownedShopId = user.ownedShopId ?? null;
  const baseQuery = supabase
    .from("shops")
    .select("id, app_approval_status")
    .eq("owner_profile_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const result = ownedShopId
    ? await baseQuery.eq("id", ownedShopId).maybeSingle() as QueryResult<{ id?: string | null; app_approval_status?: string | null }>
    : await baseQuery.maybeSingle() as QueryResult<{ id?: string | null; app_approval_status?: string | null }>;

  throwIfError(result as QueryResult<unknown>, "Unable to resolve shop Culture ownership.");
  if (!result.data?.id) {
    return { shopId: null, approvalStatus: null };
  }

  return {
    shopId: result.data.id,
    approvalStatus: result.data.app_approval_status ?? user.appApprovalStatus ?? null
  };
}

export async function resolveCultureComposerAccess(
  user: UserAccount,
  role: CultureComposerRole,
  deps?: CultureServiceDeps
): Promise<CultureComposerAccess> {
  const actorRole = role === "barber" ? "barber_user" : "shop_owner_user";
  const base: CultureComposerAccess = {
    role,
    actorRole,
    authorProfileId: user.id,
    barberId: null,
    barberReference: null,
    shopId: null,
    approvalStatus: null,
    canCompose: false,
    blockedReason: null
  };

  if (user.accountStatus && user.accountStatus !== "active") {
    return {
      ...base,
      blockedReason: "Culture posting is locked until this account is active."
    };
  }

  if (role === "barber" && !isBarberAccountRole(user.role)) {
    return {
      ...base,
      blockedReason: "Only barber accounts can create Barber Culture posts."
    };
  }

  if (role === "owner" && !isShopOwnerRole(user.role)) {
    return {
      ...base,
      blockedReason: "Only shop owner accounts can create Shop Culture posts."
    };
  }

  const supabase = maybeSupabase(deps);
  if (!supabase) {
    return {
      ...base,
      barberId: role === "barber" ? user.barberId ?? null : null,
      barberReference: role === "barber" ? user.barberId ?? null : null,
      shopId: role === "owner" ? user.ownedShopId ?? null : null,
      blockedReason: "Culture posting requires the canonical Supabase Culture writer."
    };
  }

  if (role === "barber") {
    const resolved = await readOwnedBarberId(user, supabase);
    if (!resolved.barberId) {
      return {
        ...base,
        blockedReason: "A verified barber record is required before posting to Culture."
      };
    }

    const approvalStatus = resolved.approvalStatus ?? user.appApprovalStatus ?? null;
    if (isApprovalBlocked(approvalStatus)) {
      return {
        ...base,
        barberId: resolved.barberId,
        barberReference: resolved.referenceCode ?? user.barberId ?? resolved.barberId,
        approvalStatus,
        blockedReason: "Culture posting opens after barber approval is complete."
      };
    }

    return {
      ...base,
      barberId: resolved.barberId,
      barberReference: resolved.referenceCode ?? user.barberId ?? resolved.barberId,
      approvalStatus,
      canCompose: true
    };
  }

  const resolved = await readOwnedShopId(user, supabase);
  if (!resolved.shopId) {
    return {
      ...base,
      blockedReason: "An owned shop record is required before posting to Culture."
    };
  }

  const approvalStatus = resolved.approvalStatus ?? user.appApprovalStatus ?? null;
  if (isApprovalBlocked(approvalStatus)) {
    return {
      ...base,
      shopId: resolved.shopId,
      approvalStatus,
      blockedReason: "Shop Culture posting opens after shop approval is complete."
    };
  }

  return {
    ...base,
    shopId: resolved.shopId,
    approvalStatus,
    canCompose: true
  };
}

export async function createCulturePostDraft(
  user: UserAccount,
  input: CultureComposerInput,
  deps?: CultureServiceDeps
) {
  const access = await resolveCultureComposerAccess(user, input.role, deps);
  assertCanCompose(access);

  const supabase = maybeSupabase(deps);
  if (!supabase) {
    throw new CultureComposerError("Culture posting requires the canonical Supabase Culture writer.", 503);
  }

  if (input.role === "barber" && input.barberId && input.barberId !== access.barberId && input.barberId !== user.barberId) {
    throw new CultureComposerError("Barbers can only create Culture posts for their own barber record.", 403);
  }

  if (input.role === "owner" && input.shopId && input.shopId !== access.shopId && input.shopId !== user.ownedShopId) {
    throw new CultureComposerError("Shop owners can only create Culture posts for their own shop.", 403);
  }

  const postType = normalizeComposerPostType(input.role, input.postType);
  const caption = normalizeCaption(input.caption);
  const serviceId = input.role === "barber" ? normalizeOptionalText(input.serviceId) : null;
  const tags = cleanTags(input.tags);
  const metadata = {
    composerVersion: 1,
    cta: normalizeOptionalText(input.cta),
    tags
  };

  const row = {
    author_profile_id: access.authorProfileId,
    author_role: access.actorRole,
    barber_id: access.barberId,
    shop_id: access.shopId,
    service_id: serviceId,
    post_type: postType,
    caption,
    visibility: "private",
    moderation_status: "pending",
    publishing_status: "draft",
    is_bookable: Boolean(input.isBookable && input.role === "barber" && serviceId),
    allow_comments: false,
    metadata
  };

  const result = await supabase
    .from("culture_posts")
    .insert(row)
    .select("id, author_profile_id, author_role, barber_id, shop_id, client_id, appointment_id, service_id, post_type, caption, visibility, moderation_status, publishing_status, is_bookable, allow_comments, metadata, created_at, deleted_at")
    .single() as QueryResult<CulturePostRow>;

  throwIfError(result as QueryResult<unknown>, "Unable to create Culture draft.");
  if (!result.data) {
    throw new CultureComposerError("Culture draft was not returned after save.", 500);
  }

  if (tags.length) {
    const tagRows = tags.map((tag) => ({
      post_id: result.data?.id,
      tag,
      tag_type: "style"
    }));
    const tagResult = await supabase.from("culture_post_tags").insert(tagRows) as QueryResult<unknown>;
    throwIfError(tagResult, "Unable to save Culture post tags.");
  }

  return {
    post: result.data,
    summary: summarizeOwnPost(result.data)
  };
}

async function readOwnCulturePost(supabase: SupabaseLike, user: UserAccount, postId: string) {
  const result = await supabase
    .from("culture_posts")
    .select("id, author_profile_id, author_role, barber_id, shop_id, client_id, appointment_id, service_id, post_type, caption, visibility, moderation_status, publishing_status, is_bookable, allow_comments, metadata, created_at, deleted_at")
    .eq("id", postId)
    .eq("author_profile_id", user.id)
    .maybeSingle() as QueryResult<CulturePostRow>;

  throwIfError(result as QueryResult<unknown>, "Unable to load Culture post.");
  return result.data ?? null;
}

function profileMediaSourceMetadata(sourceTable: CultureProfileMediaSourceType, sourceId: string, extra: Record<string, unknown> = {}) {
  return {
    source_surface: "profile_studio",
    source_table: sourceTable,
    source_id: sourceId,
    ...extra
  };
}

function resolveSourceMediaUrl(supabase: SupabaseLike, storagePath?: string | null, imageUrl?: string | null) {
  return toPublicMediaUrl(supabase.storage ? { storage: supabase.storage } : null, storagePath, imageUrl) ?? null;
}

async function readBarberProfileMediaSource(
  supabase: SupabaseLike,
  access: CultureComposerAccess,
  user: UserAccount,
  sourceId: string
) {
  const result = await supabase
    .from("barber_portfolios")
    .select("id, barber_reference, storage_path, image_url, caption, featured")
    .eq("id", sourceId)
    .maybeSingle() as QueryResult<BarberPortfolioSourceRow>;

  throwIfError(result as QueryResult<unknown>, "Unable to load barber Profile Studio media.");
  if (!result.data) {
    return null;
  }

  const allowedReferences = new Set([access.barberId, access.barberReference, user.barberId].filter(Boolean));
  if (!allowedReferences.has(result.data.barber_reference)) {
    throw new CultureComposerError("Barbers can only share their own portfolio media to Culture.", 403);
  }

  return result.data;
}

async function readShopProfileMediaSource(
  supabase: SupabaseLike,
  access: CultureComposerAccess,
  user: UserAccount,
  sourceId: string
) {
  const result = await supabase
    .from("shop_media_assets")
    .select("id, shop_reference, storage_path, image_url, caption, featured")
    .eq("id", sourceId)
    .maybeSingle() as QueryResult<ShopMediaSourceRow>;

  throwIfError(result as QueryResult<unknown>, "Unable to load shop Profile Studio media.");
  if (!result.data) {
    return null;
  }

  const allowedShops = new Set([access.shopId, user.ownedShopId].filter(Boolean));
  if (!allowedShops.has(result.data.shop_reference)) {
    throw new CultureComposerError("Shop owners can only share media from their own shop.", 403);
  }

  return result.data;
}

async function readCultureMediaForProfileSource(
  supabase: SupabaseLike,
  sourceTable: CultureProfileMediaSourceType,
  sourceId: string
) {
  const sourceColumnResult = await supabase
    .from("culture_media")
    .select("id, post_id, media_asset_id, media_url, thumbnail_url, media_type, width, height, duration_seconds, sort_order, processing_status, moderation_status, source_table, source_id, source_surface, metadata")
    .eq("source_surface", "profile_studio")
    .eq("source_table", sourceTable)
    .eq("source_id", sourceId)
    .limit(1)
    .maybeSingle() as QueryResult<CultureMediaRow>;

  if (!sourceColumnResult.error && sourceColumnResult.data) {
    return sourceColumnResult.data;
  }

  const metadataResult = await supabase
    .from("culture_media")
    .select("id, post_id, media_asset_id, media_url, thumbnail_url, media_type, width, height, duration_seconds, sort_order, processing_status, moderation_status, metadata")
    .eq("metadata->>source_surface", "profile_studio")
    .eq("metadata->>source_table", sourceTable)
    .eq("metadata->>source_id", sourceId)
    .limit(1)
    .maybeSingle() as QueryResult<CultureMediaRow>;

  throwIfError(metadataResult as QueryResult<unknown>, "Unable to check existing Profile Studio Culture media.");
  return metadataResult.data ?? null;
}

function mapCultureMediaRow(row: CultureMediaRow): CultureMediaItem {
  return {
    id: row.id,
    url: safeNullableText(row.media_url),
    thumbnailUrl: safeNullableText(row.thumbnail_url),
    mediaType: row.media_type === "video" ? "video" : "image",
    width: row.width ?? null,
    height: row.height ?? null,
    durationSeconds: row.duration_seconds ?? null
  };
}

function isAutoPublishApproved(access: CultureComposerAccess) {
  return access.canCompose && access.approvalStatus === "approved";
}

function normalizeAutoPostType(role: CultureComposerRole, postType?: string | null) {
  if (postType) {
    return normalizeComposerPostType(role, postType);
  }

  return role === "barber" ? "barber_cut" : "shop_update";
}

async function upsertCulturePostFromProfileSource({
  user,
  access,
  sourceTable,
  sourceId,
  caption,
  storagePath,
  imageUrl,
  mediaAssetId,
  postType,
  serviceId,
  autoShared
}: {
  user: UserAccount;
  access: CultureComposerAccess;
  sourceTable: CultureProfileMediaSourceType;
  sourceId: string;
  caption?: string | null;
  storagePath?: string | null;
  imageUrl?: string | null;
  mediaAssetId?: string | null;
  postType: string;
  serviceId?: string | null;
  autoShared: boolean;
}, deps?: CultureServiceDeps) {
  const supabase = maybeSupabase(deps);
  if (!supabase) {
    throw new CultureComposerError("Culture posting requires the canonical Supabase Culture writer.", 503);
  }

  const sourceImageUrl = resolveSourceMediaUrl(supabase, storagePath, imageUrl);
  const safeStoragePath = normalizeOptionalText(storagePath);
  if (!sourceImageUrl && !safeStoragePath && !mediaAssetId) {
    throw new CultureComposerError("Profile Studio media is missing a renderable image.", 400);
  }

  const now = new Date().toISOString();
  const sourceMetadata = profileMediaSourceMetadata(sourceTable, sourceId, {
    source_storage_path: safeStoragePath,
    autoShared,
    ...(autoShared ? { autoSharedAt: now } : {}),
    roleContext: access.role
  });
  const existingMedia = await readCultureMediaForProfileSource(supabase, sourceTable, sourceId);
  const postPayload = {
    author_profile_id: user.id,
    author_role: access.actorRole,
    barber_id: access.barberId,
    shop_id: access.shopId,
    client_id: null,
    appointment_id: null,
    service_id: normalizeOptionalText(serviceId),
    post_type: postType,
    caption: normalizeCaption(caption),
    visibility: "public",
    moderation_status: "approved",
    publishing_status: "published",
    is_bookable: Boolean(access.role === "barber" && serviceId),
    allow_comments: false,
    metadata: {
      composerVersion: 1,
      createdFrom: "profile_studio_media",
      autoShared,
      ...(autoShared ? { autoSharedAt: now } : {}),
      ...sourceMetadata
    },
    updated_at: now
  };

  const postResult = existingMedia?.post_id
    ? await supabase
        .from("culture_posts")
        .update(postPayload)
        .eq("id", existingMedia.post_id)
        .eq("author_profile_id", user.id)
        .select("id, author_profile_id, author_role, barber_id, shop_id, client_id, appointment_id, service_id, post_type, caption, visibility, moderation_status, publishing_status, is_bookable, allow_comments, metadata, created_at, deleted_at")
        .single() as QueryResult<CulturePostRow>
    : await supabase
        .from("culture_posts")
        .insert(postPayload)
        .select("id, author_profile_id, author_role, barber_id, shop_id, client_id, appointment_id, service_id, post_type, caption, visibility, moderation_status, publishing_status, is_bookable, allow_comments, metadata, created_at, deleted_at")
        .single() as QueryResult<CulturePostRow>;

  throwIfError(postResult as QueryResult<unknown>, existingMedia ? "Unable to update auto-shared Culture post." : "Unable to create auto-shared Culture post.");
  if (!postResult.data) {
    throw new CultureComposerError("Culture post was not returned after Profile Studio auto-share.", 500);
  }

  const mediaPayload = {
    post_id: postResult.data.id,
    media_asset_id: mediaAssetId ?? null,
    media_url: sourceImageUrl ?? safeStoragePath,
    thumbnail_url: sourceImageUrl ?? safeStoragePath,
    media_type: "image",
    sort_order: 0,
    processing_status: "ready",
    moderation_status: "approved",
    source_table: sourceTable,
    source_id: sourceId,
    source_surface: "profile_studio",
    metadata: sourceMetadata
  };

  const mediaResult = existingMedia
    ? await supabase
        .from("culture_media")
        .update(mediaPayload)
        .eq("id", existingMedia.id)
        .select("id, post_id, media_asset_id, media_url, thumbnail_url, media_type, width, height, duration_seconds, sort_order, processing_status, moderation_status, source_table, source_id, source_surface, metadata")
        .single() as QueryResult<CultureMediaRow>
    : await supabase
        .from("culture_media")
        .insert(mediaPayload)
        .select("id, post_id, media_asset_id, media_url, thumbnail_url, media_type, width, height, duration_seconds, sort_order, processing_status, moderation_status, source_table, source_id, source_surface, metadata")
        .single() as QueryResult<CultureMediaRow>;

  throwIfError(mediaResult as QueryResult<unknown>, existingMedia ? "Unable to update auto-shared Culture media." : "Unable to attach auto-shared Culture media.");
  if (!mediaResult.data) {
    throw new CultureComposerError("Culture media was not returned after Profile Studio auto-share.", 500);
  }

  return {
    status: existingMedia ? "updated" as const : "created" as const,
    post: postResult.data,
    summary: summarizeOwnPost(postResult.data),
    media: mapCultureMediaRow(mediaResult.data)
  };
}

export async function autoCreateCulturePostFromProfileMedia(
  user: UserAccount,
  input: AutoCultureProfileMediaInput,
  deps?: CultureServiceDeps
): Promise<AutoCultureProfileMediaResult> {
  const sourceId = normalizeOptionalText(input.sourceId);
  if (!sourceId) {
    throw new CultureComposerError("Choose Profile Studio media to publish to Culture.", 400);
  }

  if (input.role === "client") {
    return { status: "skipped", reason: "Client Culture posting unlocks later." };
  }

  if (input.role === "barber" && input.sourceTable !== "barber_portfolio") {
    throw new CultureComposerError("Barber Culture auto-share requires barber portfolio media.", 400);
  }

  if (input.role === "owner" && input.sourceTable !== "shop_media_asset") {
    throw new CultureComposerError("Shop Culture auto-share requires shop gallery media.", 400);
  }

  const access = await resolveCultureComposerAccess(user, input.role, deps);
  if (!access.canCompose) {
    return { status: "skipped", reason: access.blockedReason ?? "Culture posting is not available for this account." };
  }

  if (!isAutoPublishApproved(access)) {
    return { status: "skipped", reason: "Culture auto-publishing requires an approved account." };
  }

  if (input.role === "barber") {
    const allowedReferences = new Set([access.barberId, access.barberReference, user.barberId].filter(Boolean));
    if (input.barberId && !allowedReferences.has(input.barberId)) {
      throw new CultureComposerError("Barbers can only auto-share their own portfolio media to Culture.", 403);
    }
  }

  if (input.role === "owner") {
    const allowedShops = new Set([access.shopId, user.ownedShopId].filter(Boolean));
    if (input.shopId && !allowedShops.has(input.shopId)) {
      throw new CultureComposerError("Shop owners can only auto-share media from their own shop.", 403);
    }
  }

  return upsertCulturePostFromProfileSource({
    user,
    access,
    sourceTable: input.sourceTable,
    sourceId,
    caption: input.caption,
    storagePath: input.storagePath,
    imageUrl: input.imageUrl,
    mediaAssetId: input.mediaAssetId,
    postType: normalizeAutoPostType(input.role, input.postType),
    serviceId: input.serviceId,
    autoShared: true
  }, deps);
}

export async function createCulturePostFromProfileMedia(
  user: UserAccount,
  input: CultureProfileMediaInput,
  deps?: CultureServiceDeps
) {
  if (input.role === "client") {
    throw new CultureComposerError("Client Culture posting unlocks later.", 403);
  }

  const access = await resolveCultureComposerAccess(user, input.role, deps);
  assertCanCompose(access);

  const supabase = maybeSupabase(deps);
  if (!supabase) {
    throw new CultureComposerError("Culture posting requires the canonical Supabase Culture writer.", 503);
  }

  const sourceId = normalizeOptionalText(input.sourceId);
  if (!sourceId) {
    throw new CultureComposerError("Choose Profile Studio media to share to Culture.", 400);
  }

  let postType: string;
  let sourceCaption = "";
  let sourceStoragePath: string | null = null;
  let sourceImageUrl: string | null = null;
  let sourceMetadata: Record<string, unknown>;

  if (input.role === "barber") {
    if (input.sourceType !== "barber_portfolio") {
      throw new CultureComposerError("Barber Culture posts can only share barber portfolio media.", 400);
    }

    const source = await readBarberProfileMediaSource(supabase, access, user, sourceId);
    if (!source) {
      throw new CultureComposerError("Barber portfolio media was not found.", 404);
    }

    postType = "barber_cut";
    sourceCaption = source.caption ?? "";
    sourceStoragePath = source.storage_path ?? null;
    sourceImageUrl = resolveSourceMediaUrl(supabase, source.storage_path, source.image_url);
    sourceMetadata = profileMediaSourceMetadata("barber_portfolio", source.id, {
      source_barber_reference: source.barber_reference,
      source_storage_path: source.storage_path ?? null
    });
  } else {
    if (input.sourceType !== "shop_media_asset") {
      throw new CultureComposerError("Shop Culture posts can only share shop gallery media.", 400);
    }

    const source = await readShopProfileMediaSource(supabase, access, user, sourceId);
    if (!source) {
      throw new CultureComposerError("Shop gallery media was not found.", 404);
    }

    postType = "shop_update";
    sourceCaption = source.caption ?? "";
    sourceStoragePath = source.storage_path ?? null;
    sourceImageUrl = resolveSourceMediaUrl(supabase, source.storage_path, source.image_url);
    sourceMetadata = profileMediaSourceMetadata("shop_media_asset", source.id, {
      source_shop_reference: source.shop_reference,
      source_storage_path: source.storage_path ?? null
    });
  }

  if (!sourceImageUrl && !sourceStoragePath) {
    throw new CultureComposerError("Profile Studio media is missing a renderable image.", 400);
  }

  const existingMedia = await readCultureMediaForProfileSource(supabase, input.sourceType, sourceId);
  if (existingMedia?.post_id) {
    const existingPost = await readOwnCulturePost(supabase, user, existingMedia.post_id);
    if (existingPost) {
      return {
        post: existingPost,
        summary: summarizeOwnPost(existingPost),
        media: mapCultureMediaRow(existingMedia),
        message: "Culture post settings opened from Profile Studio media."
      };
    }
  }

  const caption = normalizeCaption(input.caption ?? sourceCaption);
  if (input.submitForReview && !caption) {
    throw new CultureComposerError("Caption is required before submitting for review.", 400);
  }

  const isSubmittedForReview = Boolean(input.submitForReview);
  if (!isSubmittedForReview && isAutoPublishApproved(access)) {
    const liveResult = await upsertCulturePostFromProfileSource({
      user,
      access,
      sourceTable: input.sourceType,
      sourceId,
      caption,
      storagePath: sourceStoragePath,
      imageUrl: sourceImageUrl,
      mediaAssetId: null,
      postType,
      serviceId: null,
      autoShared: false
    }, deps);

    if (liveResult.post && liveResult.summary && liveResult.media) {
      return {
        post: liveResult.post,
        summary: liveResult.summary,
        media: liveResult.media,
        message: "Culture post settings opened from Profile Studio media."
      };
    }
  }

  const postInsert = await supabase
    .from("culture_posts")
    .insert({
      author_profile_id: user.id,
      author_role: access.actorRole,
      barber_id: access.barberId,
      shop_id: access.shopId,
      client_id: null,
      appointment_id: null,
      service_id: null,
      post_type: postType,
      caption,
      visibility: isSubmittedForReview ? "unlisted" : "private",
      moderation_status: "pending",
      publishing_status: isSubmittedForReview ? "published" : "draft",
      is_bookable: false,
      allow_comments: false,
      metadata: {
        composerVersion: 1,
        createdFrom: "profile_studio_media",
        ...(isSubmittedForReview ? { submittedForReview: true, submittedAt: new Date().toISOString() } : {}),
        ...sourceMetadata
      }
    })
    .select("id, author_profile_id, author_role, barber_id, shop_id, client_id, appointment_id, service_id, post_type, caption, visibility, moderation_status, publishing_status, is_bookable, allow_comments, metadata, created_at, deleted_at")
    .single() as QueryResult<CulturePostRow>;

  throwIfError(postInsert as QueryResult<unknown>, "Unable to create Culture draft from Profile Studio media.");
  if (!postInsert.data) {
    throw new CultureComposerError("Culture draft was not returned after save.", 500);
  }

  const mediaInsert = await supabase
    .from("culture_media")
    .insert({
      post_id: postInsert.data.id,
      media_asset_id: null,
      media_url: sourceImageUrl ?? sourceStoragePath,
      thumbnail_url: sourceImageUrl ?? sourceStoragePath,
      media_type: "image",
      sort_order: 0,
      processing_status: "ready",
      moderation_status: "pending",
      source_table: input.sourceType,
      source_id: sourceId,
      source_surface: "profile_studio",
      metadata: sourceMetadata
    })
    .select("id, post_id, media_asset_id, media_url, thumbnail_url, media_type, width, height, duration_seconds, sort_order, processing_status, moderation_status, source_table, source_id, source_surface, metadata")
    .single() as QueryResult<CultureMediaRow>;

  throwIfError(mediaInsert as QueryResult<unknown>, "Unable to attach Profile Studio media to Culture draft.");
  if (!mediaInsert.data) {
    throw new CultureComposerError("Culture media was not returned after save.", 500);
  }

  return {
    post: postInsert.data,
    summary: summarizeOwnPost(postInsert.data),
    media: {
      id: mediaInsert.data.id,
      url: safeNullableText(mediaInsert.data.media_url),
      thumbnailUrl: safeNullableText(mediaInsert.data.thumbnail_url),
      mediaType: "image" as const,
      width: mediaInsert.data.width ?? null,
      height: mediaInsert.data.height ?? null,
      durationSeconds: mediaInsert.data.duration_seconds ?? null
    },
    message: isSubmittedForReview
      ? "Culture post submitted for review from Profile Studio media."
      : "Culture draft created from Profile Studio media."
  };
}

export async function submitCulturePostForReview(
  user: UserAccount,
  input: { role: CultureComposerRole; postId: string },
  deps?: CultureServiceDeps
) {
  const access = await resolveCultureComposerAccess(user, input.role, deps);
  assertCanCompose(access);

  const supabase = maybeSupabase(deps);
  if (!supabase) {
    throw new CultureComposerError("Culture posting requires the canonical Supabase Culture writer.", 503);
  }

  const existing = await readOwnCulturePost(supabase, user, input.postId);
  if (!existing) {
    throw new CultureComposerError("Culture post was not found for this account.", 404);
  }

  if (input.role === "barber" && existing.barber_id !== access.barberId) {
    throw new CultureComposerError("Barbers can only submit their own Culture posts.", 403);
  }

  if (input.role === "owner" && existing.shop_id !== access.shopId) {
    throw new CultureComposerError("Shop owners can only submit posts for their own shop.", 403);
  }

  normalizeComposerPostType(input.role, existing.post_type);
  if (!normalizeCaption(existing.caption)) {
    throw new CultureComposerError("Caption is required before submitting for review.", 400);
  }

  const result = await supabase
    .from("culture_posts")
    .update({
      publishing_status: "published",
      moderation_status: "pending",
      visibility: "unlisted",
      metadata: {
        ...(existing.metadata ?? {}),
        submittedForReview: true,
        submittedAt: new Date().toISOString()
      }
    })
    .eq("id", existing.id)
    .eq("author_profile_id", user.id)
    .select("id, author_profile_id, author_role, barber_id, shop_id, client_id, appointment_id, service_id, post_type, caption, visibility, moderation_status, publishing_status, is_bookable, allow_comments, metadata, created_at, deleted_at")
    .single() as QueryResult<CulturePostRow>;

  throwIfError(result as QueryResult<unknown>, "Unable to submit Culture post for review.");
  if (!result.data) {
    throw new CultureComposerError("Culture post was not returned after submit.", 500);
  }

  return {
    post: result.data,
    summary: summarizeOwnPost(result.data),
    message: "Post submitted for review."
  };
}

export async function attachCulturePostImageMedia(
  user: UserAccount,
  input: CultureMediaUploadInput,
  deps?: CultureServiceDeps
) {
  const access = await resolveCultureComposerAccess(user, input.role, deps);
  assertCanCompose(access);

  const supabase = maybeSupabase(deps);
  if (!supabase) {
    throw new CultureComposerError("Culture media uploads require the canonical Supabase Culture writer.", 503);
  }

  const existing = await readOwnCulturePost(supabase, user, input.postId);
  if (!existing) {
    throw new CultureComposerError("Culture post was not found for this account.", 404);
  }

  if (existing.deleted_at || existing.publishing_status === "archived" || existing.publishing_status === "deleted") {
    throw new CultureComposerError("Archived or deleted Culture posts cannot accept media.", 400);
  }

  if (input.role === "barber" && existing.barber_id !== access.barberId) {
    throw new CultureComposerError("Barbers can only attach media to their own Culture posts.", 403);
  }

  if (input.role === "owner" && existing.shop_id !== access.shopId) {
    throw new CultureComposerError("Shop owners can only attach media to their own shop Culture posts.", 403);
  }

  const { contentType, extension } = validateCultureImageUpload(input);
  const storage = supabase.storage?.from(cultureMediaBucket);
  if (!storage?.upload) {
    throw new CultureComposerError("Culture media storage is not configured.", 503);
  }

  const mediaId = crypto.randomUUID();
  const storagePath = `culture/${user.id}/${existing.id}/${mediaId}.${extension}`;
  const upload = await storage.upload(storagePath, input.bytes, { contentType, upsert: false });
  if (upload.error) {
    throw new CultureComposerError(upload.error instanceof Error ? upload.error.message : upload.error.message ?? "Unable to upload Culture media.", 500);
  }

  const metadata = {
    storageBucket: cultureMediaBucket,
    storagePath,
    originalFileName: safeText(input.fileName, "culture-image"),
    mimeType: contentType,
    fileSizeBytes: input.size
  };
  const insert = await supabase
    .from("culture_media")
    .insert({
      post_id: existing.id,
      media_url: storagePath,
      thumbnail_url: storagePath,
      media_type: "image",
      sort_order: 0,
      processing_status: "ready",
      moderation_status: "pending",
      metadata
    })
    .select("id, post_id, media_url, thumbnail_url, media_type, width, height, duration_seconds, sort_order, processing_status, moderation_status, metadata")
    .single() as QueryResult<CultureMediaRow>;

  throwIfError(insert as QueryResult<unknown>, "Unable to attach Culture media.");
  if (!insert.data) {
    throw new CultureComposerError("Culture media was not returned after upload.", 500);
  }

  const mediaUrl = await signCultureMediaPath(supabase, insert.data.media_url, insert.data.metadata);
  const thumbnailUrl = await signCultureMediaPath(supabase, insert.data.thumbnail_url, insert.data.metadata);

  return {
    row: insert.data,
    media: {
      id: insert.data.id,
      url: mediaUrl,
      thumbnailUrl,
      mediaType: "image" as const,
      width: insert.data.width ?? null,
      height: insert.data.height ?? null,
      durationSeconds: null
    }
  };
}

export async function listMyCulturePosts(
  user: UserAccount,
  role: CultureComposerRole,
  deps?: CultureServiceDeps
): Promise<CultureMyPosts> {
  const access = await resolveCultureComposerAccess(user, role, deps);
  if (!access.canCompose) {
    return emptyMyPosts();
  }

  const supabase = maybeSupabase(deps);
  if (!supabase) {
    return emptyMyPosts();
  }

  let query = supabase
    .from("culture_posts")
    .select("id, author_profile_id, author_role, barber_id, shop_id, client_id, appointment_id, service_id, post_type, caption, visibility, moderation_status, publishing_status, is_bookable, allow_comments, metadata, created_at, deleted_at")
    .eq("author_profile_id", user.id)
    .eq("author_role", access.actorRole)
    .order("created_at", { ascending: false })
    .limit(40);

  query = role === "barber"
    ? query.eq("barber_id", access.barberId)
    : query.eq("shop_id", access.shopId);

  const result = await query as QueryResult<CulturePostRow[]>;
  throwIfError(result as QueryResult<unknown>, "Unable to load your Culture posts.");

  const grouped = emptyMyPosts();
  for (const post of result.data ?? []) {
    const summary = summarizeOwnPost(post);
    if (post.deleted_at || post.publishing_status === "archived" || post.publishing_status === "deleted") {
      grouped.archived.push(summary);
    } else if (post.publishing_status === "draft") {
      grouped.drafts.push(summary);
    } else if (post.publishing_status === "published" && post.moderation_status === "approved" && post.visibility === "public") {
      grouped.published.push(summary);
    } else {
      grouped.pendingReview.push(summary);
    }
  }

  return grouped;
}

export function mapCulturePostToSafeFeedItem(
  post: CulturePostRow,
  lookups: LookupMaps = {},
  signals: CulturePersonalizationSignals = emptyCulturePersonalizationSignals()
): CultureFeedItem {
  const profile = lookups.profilesById?.get(post.author_profile_id);
  const media = lookups.mediaByPost?.get(post.id)?.[0] ?? null;
  const shop = post.shop_id ? lookups.shopsById?.get(post.shop_id) : null;
  const service = post.service_id ? lookups.servicesById?.get(post.service_id) : null;
  const authorDisplayName = safeText(profile?.full_name, roleLabel(post.author_role));
  const username = safeText(profile?.public_username);
  const authorTargetKind = authorTargetKindForPost(post);
  const authorTarget = authorTargetForPost(post, profile, shop);
  const ctaState = getCulturePostCtaState(post, lookups);
  const reasonCodes = buildCultureReasonCodes(post, lookups, signals);
  const mediaUrl = safeNullableText(media?.media_url);
  const thumbnailUrl = safeNullableText(media?.thumbnail_url);
  const authorAvatarUrl = toPublicMediaUrl(lookups.storageClient ?? null, profile?.profile_photo_path, profile?.profile_photo_url) ?? null;
  const isPromoted = Boolean(lookups.promotionsByPost?.has(post.id));

  return {
    id: post.id,
    authorProfileId: post.author_profile_id,
    authorTargetKind,
    authorTarget,
    barberId: post.barber_id ?? null,
    shopId: post.shop_id ?? null,
    serviceId: post.service_id ?? null,
    authorDisplayName,
    authorUsername: username ? `@${username.replace(/^@/, "")}` : null,
    authorAvatarUrl,
    authorRoleLabel: roleLabel(post.author_role),
    authorVerified: false,
    caption: safeText(post.caption, ""),
    postType: post.post_type,
    media: media ? {
      id: media.id,
      url: mediaUrl,
      thumbnailUrl,
      mediaType: media.media_type === "video" ? "video" : "image",
      width: media.width ?? null,
      height: media.height ?? null,
      durationSeconds: media.duration_seconds ?? null
    } : null,
    createdAt: post.created_at,
    serviceName: service?.name ?? null,
    shopName: shop?.name ?? null,
    shopUsername: safeNullableText(shop?.public_username),
    profileUrl: ctaState.profileUrl,
    bookingUrl: ctaState.bookingUrl,
    shopUrl: ctaState.shopUrl,
    canViewProfile: ctaState.canViewProfile,
    canViewShop: ctaState.canViewShop,
    bookLabel: ctaState.bookLabel,
    bookingDisabledReason: ctaState.bookingDisabledReason,
    canLike: true,
    canSave: true,
    canShare: true,
    canReport: true,
    canBook: ctaState.canBook,
    canComment: Boolean(post.allow_comments),
    isPromoted,
    promotionLabel: isPromoted ? "Promoted" : null,
    reasonCodes,
    reasonLabel: cultureReasonLabel(reasonCodes)
  };
}

export async function listCulturePostsForFeed({
  cursor,
  limit
}: {
  viewerProfileId?: string;
  viewerRole?: CultureSurfaceRole | Role | string;
  cursor?: string | null;
  limit?: number;
}, deps?: CultureServiceDeps): Promise<{ posts: CulturePostRow[]; hasMore: boolean; cursor: string | null }> {
  const supabase = maybeSupabase(deps);
  const pageSize = cleanLimit(limit);

  if (!supabase) {
    return { posts: [], hasMore: false, cursor: null };
  }

  const decodedCursor = decodeCursor(cursor);
  let query = supabase
    .from("culture_posts")
    .select("id, author_profile_id, author_role, barber_id, shop_id, client_id, appointment_id, service_id, post_type, caption, visibility, moderation_status, publishing_status, is_bookable, allow_comments, metadata, created_at, deleted_at")
    .eq("publishing_status", "published")
    .eq("moderation_status", "approved")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (decodedCursor) {
    query = query.or(`created_at.lt.${decodedCursor.createdAt},and(created_at.eq.${decodedCursor.createdAt},id.lt.${decodedCursor.id})`);
  }

  const result = await query as QueryResult<CulturePostRow[]>;
  throwIfError(result as QueryResult<unknown>, "Unable to load Culture feed.");

  const rows = result.data ?? [];
  const posts = rows.slice(0, pageSize);
  const nextCursor = rows.length > pageSize && posts.length > 0 ? encodeCursor(posts[posts.length - 1]) : null;

  return {
    posts,
    hasMore: Boolean(nextCursor),
    cursor: nextCursor
  };
}

export async function listCultureFeed(input: {
  role?: CultureSurfaceRole | Role | string;
  viewerProfileId?: string;
  cursor?: string | null;
  limit?: number;
} = {}, deps?: CultureServiceDeps): Promise<CultureFeedResponse> {
  const supabase = maybeSupabase(deps);
  if (!supabase) {
    return { items: [], cursor: null, hasMore: false };
  }

  const result = await listCulturePostsForFeed({
    viewerProfileId: input.viewerProfileId,
    viewerRole: input.role,
    cursor: input.cursor,
    limit: input.limit
  }, { supabase });

  if (!result.posts.length) {
    return { items: [], cursor: null, hasMore: false };
  }

  const lookups = await loadFeedLookups(supabase, result.posts);
  const signals = await getCulturePersonalizationSignals(supabase, input.viewerProfileId);
  const rankedPosts = rankCultureFeedItems(result.posts, lookups, signals);
  const items = rankedPosts.map((post) => mapCulturePostToSafeFeedItem(post, lookups, signals));

  return {
    items,
    modules: buildCultureDiscoveryModules(items, input.role),
    cursor: result.cursor,
    hasMore: result.hasMore
  };
}

export async function getCulturePostSafeDisplay(postId: string, deps?: CultureServiceDeps) {
  const supabase = maybeSupabase(deps);
  if (!supabase) {
    return null;
  }

  const result = await supabase
    .from("culture_posts")
    .select("id, author_profile_id, author_role, barber_id, shop_id, client_id, appointment_id, service_id, post_type, caption, visibility, moderation_status, publishing_status, is_bookable, allow_comments, metadata, created_at, deleted_at")
    .eq("id", postId)
    .eq("publishing_status", "published")
    .eq("moderation_status", "approved")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .maybeSingle() as QueryResult<CulturePostRow>;

  throwIfError(result as QueryResult<unknown>, "Unable to load Culture post.");
  if (!result.data) {
    return null;
  }

  const lookups = await loadFeedLookups(supabase, [result.data]);
  return mapCulturePostToSafeFeedItem(result.data, lookups);
}

function assertCultureEngagementUser(user: UserAccount) {
  if (!user?.id || user.id === "guest-user") {
    throw new CultureComposerError("A signed-in account is required for Culture engagement.", 401);
  }
}

async function readPublicCulturePostForAction(supabase: SupabaseLike, postId: string) {
  const result = await supabase
    .from("culture_posts")
    .select("id, author_profile_id, author_role, barber_id, shop_id, client_id, appointment_id, service_id, post_type, caption, visibility, moderation_status, publishing_status, is_bookable, allow_comments, metadata, created_at, deleted_at")
    .eq("id", postId)
    .eq("publishing_status", "published")
    .eq("moderation_status", "approved")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .maybeSingle() as QueryResult<CulturePostRow>;

  throwIfError(result as QueryResult<unknown>, "Unable to load Culture post for engagement.");
  if (!result.data) {
    throw new CultureComposerError("Culture engagement is only available for public approved posts.", 404);
  }

  return result.data;
}

function cultureEngagementTypeForAction(action: CulturePostEngagementAction) {
  switch (action) {
    case "unlike":
      return "like";
    case "unsave":
      return "save";
    case "profile_click":
      return "profile_click";
    default:
      return action;
  }
}

function cultureFeedEventTypeForAction(action: CulturePostEngagementAction) {
  switch (action) {
    case "like":
    case "unlike":
      return "like_clicked";
    case "save":
    case "unsave":
      return "save_clicked";
    case "share":
      return "share_clicked";
    case "report":
      return "report_clicked";
    case "profile_click":
      return "profile_clicked";
    case "book_click":
      return "book_clicked";
    case "shop_click":
      return "shop_clicked";
    default:
      return "post_click";
  }
}

async function deleteCultureEngagement(payload: {
  postId: string;
  actorProfileId: string;
  engagementType: string;
}, deps?: CultureServiceDeps) {
  const supabase = maybeSupabase(deps);
  if (!supabase) {
    demoCultureEngagements.delete(`${payload.postId}:${payload.actorProfileId}:${payload.engagementType}`);
    return { removed: true };
  }

  const result = await supabase
    .from("culture_engagements")
    .delete()
    .eq("post_id", payload.postId)
    .eq("actor_profile_id", payload.actorProfileId)
    .eq("engagement_type", payload.engagementType) as QueryResult<unknown>;

  throwIfError(result, "Unable to remove Culture engagement.");
  return { removed: true };
}

async function recordCultureReport(payload: {
  postId: string;
  reporterProfileId: string;
  reporterRole: CultureActorRole;
  reason: string;
  details?: string | null;
  metadata?: Record<string, unknown>;
}, deps?: CultureServiceDeps) {
  const supabase = maybeSupabase(deps);
  const row = {
    post_id: payload.postId,
    reporter_profile_id: payload.reporterProfileId,
    reporter_role: payload.reporterRole,
    reason: payload.reason,
    details: payload.details ?? null,
    status: "open",
    metadata: payload.metadata ?? {}
  };

  if (!supabase) {
    return { id: crypto.randomUUID(), ...row, created_at: new Date().toISOString() };
  }

  const result = await supabase
    .from("culture_reports")
    .insert(row)
    .select("id, post_id, reporter_profile_id, reporter_role, reason, details, status, metadata, created_at")
    .single() as QueryResult<Record<string, unknown>>;

  throwIfError(result as QueryResult<unknown>, "Unable to submit Culture report.");
  return result.data;
}

export async function performCulturePostEngagementAction(
  user: UserAccount,
  input: {
    postId: string;
    action: CulturePostEngagementAction;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
  deps?: CultureServiceDeps
) {
  assertCultureEngagementUser(user);
  const supabase = maybeSupabase(deps);
  if (!supabase) {
    throw new CultureComposerError("Culture engagement requires the canonical Supabase Culture writer.", 503);
  }

  const postId = normalizeOptionalText(input.postId);
  if (!postId) {
    throw new CultureComposerError("Culture engagement requires a post id.", 400);
  }

  const action = input.action;
  const actorRole = dbRoleForUser(user);
  const post = await readPublicCulturePostForAction(supabase, postId);
  const lookups = await loadFeedLookups(supabase, [post]);
  const ctaState = getCulturePostCtaState(post, lookups);
  if (action === "book_click" && !ctaState.canBook) {
    throw new CultureComposerError("Book-from-post is not available for this Culture post.", 400);
  }

  if (action === "profile_click" && !ctaState.canViewProfile && authorTargetKindForPost(post) !== "barber") {
    throw new CultureComposerError("Profile click is not available for this Culture post.", 400);
  }

  if (action === "shop_click" && !ctaState.canViewShop && authorTargetKindForPost(post) !== "shop") {
    throw new CultureComposerError("Shop click is not available for this Culture post.", 400);
  }

  const engagementType = cultureEngagementTypeForAction(action);
  const eventType = cultureFeedEventTypeForAction(action);
  const metadata = {
    source: "culture",
    surface: "culture_feed",
    action,
    post_id: postId,
    target_author_profile_id: post.author_profile_id,
    target_barber_id: post.barber_id ?? null,
    target_shop_id: post.shop_id ?? null,
    service_id: post.service_id ?? null,
    ...(input.metadata ?? {})
  };

  if (action === "report") {
    const reason = normalizeOptionalText(input.reason);
    if (!reason) {
      throw new CultureComposerError("Choose a reason before reporting this Culture post.", 400);
    }

    const [engagement, report, event] = await Promise.all([
      recordCultureEngagement({
        postId,
        actorProfileId: user.id,
        actorRole,
        engagementType,
        metadata: { ...metadata, reason }
      }, deps),
      recordCultureReport({
        postId,
        reporterProfileId: user.id,
        reporterRole: actorRole,
        reason,
        metadata
      }, deps),
      recordCultureFeedEvent({
        actorProfileId: user.id,
        actorRole,
        eventType,
        postId,
        metadata: { ...metadata, reason }
      }, deps)
    ]);

    return { ok: true, action, postId, engagement, report, event, reported: true };
  }

  if (action === "unlike" || action === "unsave") {
    const [removed, event] = await Promise.all([
      deleteCultureEngagement({
        postId,
        actorProfileId: user.id,
        engagementType
      }, deps),
      recordCultureFeedEvent({
        actorProfileId: user.id,
        actorRole,
        eventType,
        postId,
        metadata
      }, deps)
    ]);

    return {
      ok: true,
      action,
      postId,
      removed,
      event,
      liked: action === "unlike" ? false : undefined,
      saved: action === "unsave" ? false : undefined
    };
  }

  const [engagement, event] = await Promise.all([
    recordCultureEngagement({
      postId,
      actorProfileId: user.id,
      actorRole,
      engagementType,
      metadata
    }, deps),
    recordCultureFeedEvent({
      actorProfileId: user.id,
      actorRole,
      eventType,
      postId,
      metadata
    }, deps)
  ]);

  return {
    ok: true,
    action,
    postId,
    targetProfileId: post.author_profile_id,
    engagement,
    event,
    liked: action === "like" ? true : undefined,
    saved: action === "save" ? true : undefined,
    shared: action === "share" ? true : undefined
  };
}

export async function performCultureFollowAction(
  user: UserAccount,
  input: {
    targetProfileId: string;
    action: CultureFollowAction;
    sourcePostId?: string | null;
    metadata?: Record<string, unknown>;
  },
  deps?: CultureServiceDeps
) {
  assertCultureEngagementUser(user);
  const supabase = maybeSupabase(deps);
  if (!supabase) {
    throw new CultureComposerError("Culture follows require the canonical Supabase engagement graph.", 503);
  }

  const targetProfileId = normalizeOptionalText(input.targetProfileId);
  if (!targetProfileId) {
    throw new CultureComposerError("Choose a profile to follow.", 400);
  }

  if (targetProfileId === user.id) {
    throw new CultureComposerError("You cannot follow your own Culture profile.", 400);
  }

  const sourcePostId = normalizeOptionalText(input.sourcePostId);
  let sourcePost: CulturePostRow | null = null;
  if (sourcePostId) {
    sourcePost = await readPublicCulturePostForAction(supabase, sourcePostId);
    if (sourcePost.author_profile_id !== targetProfileId) {
      throw new CultureComposerError("Culture follow target does not match the source post author.", 400);
    }
  }

  const now = new Date().toISOString();
  const status = input.action === "follow" ? "active" : "removed";
  const row = {
    actor_profile_id: user.id,
    actor_role: dbRoleForUser(user),
    edge_type: "follow",
    target_type: "profile",
    target_id: targetProfileId,
    target_profile_id: targetProfileId,
    visibility: "private",
    status,
    metadata: {
      source: "culture_feed",
      sourcePostId,
      sourcePostRole: sourcePost?.author_role ?? null,
      ...(input.metadata ?? {})
    },
    updated_at: now,
    deleted_at: status === "removed" ? now : null
  };

  const result = await supabase
    .from("user_engagement_edges")
    .upsert(row, { onConflict: "actor_profile_id,edge_type,target_type,target_id" })
    .select("id, actor_profile_id, actor_role, edge_type, target_type, target_id, target_profile_id, visibility, status, metadata, created_at, updated_at, deleted_at")
    .single() as QueryResult<Record<string, unknown>>;

  throwIfError(result as QueryResult<unknown>, input.action === "follow" ? "Unable to follow Culture profile." : "Unable to unfollow Culture profile.");
  return {
    ok: true,
    action: input.action,
    following: status === "active",
    targetProfileId,
    edge: result.data
  };
}

export function recordCultureBookClick(
  user: UserAccount,
  input: { postId: string; metadata?: Record<string, unknown> },
  deps?: CultureServiceDeps
) {
  return performCulturePostEngagementAction(user, {
    postId: input.postId,
    action: "book_click",
    metadata: {
      cta: "book_from_post",
      ...(input.metadata ?? {})
    }
  }, deps);
}

export function recordCultureProfileClick(
  user: UserAccount,
  input: { postId: string; metadata?: Record<string, unknown> },
  deps?: CultureServiceDeps
) {
  return performCulturePostEngagementAction(user, {
    postId: input.postId,
    action: "profile_click",
    metadata: {
      cta: "view_profile",
      ...(input.metadata ?? {})
    }
  }, deps);
}

export function recordCultureShopClick(
  user: UserAccount,
  input: { postId: string; metadata?: Record<string, unknown> },
  deps?: CultureServiceDeps
) {
  return performCulturePostEngagementAction(user, {
    postId: input.postId,
    action: "shop_click",
    metadata: {
      cta: "view_shop",
      ...(input.metadata ?? {})
    }
  }, deps);
}

export async function recordCultureFeedEvent(payload: {
  actorProfileId: string;
  actorRole: CultureActorRole;
  eventType: string;
  postId?: string | null;
  feedSessionId?: string | null;
  surface?: string;
  position?: number | null;
  reasonCodes?: string[];
  metadata?: Record<string, unknown>;
}, deps?: CultureServiceDeps) {
  if (!allowedFeedEvents.has(payload.eventType)) {
    throw new Error("Unsupported Culture feed event type.");
  }

  const row = {
    actor_profile_id: payload.actorProfileId,
    actor_role: payload.actorRole,
    event_type: payload.eventType,
    post_id: payload.postId ?? null,
    feed_session_id: payload.feedSessionId ?? undefined,
    surface: payload.surface ?? "culture_feed",
    position: payload.position ?? null,
    reason_codes: payload.reasonCodes ?? [],
    metadata: payload.metadata ?? {}
  };
  const supabase = maybeSupabase(deps);

  if (!supabase) {
    const record = { id: crypto.randomUUID(), ...row, created_at: new Date().toISOString() };
    demoCultureEvents.unshift(record);
    return record;
  }

  const result = await supabase
    .from("culture_feed_events")
    .insert(row)
    .select("id, feed_session_id, actor_profile_id, actor_role, post_id, event_type, surface, position, reason_codes, metadata, created_at")
    .single() as QueryResult<Record<string, unknown>>;

  throwIfError(result as QueryResult<unknown>, "Unable to record Culture feed event.");
  return result.data;
}

export async function recordCultureEngagement(payload: {
  postId: string;
  actorProfileId: string;
  actorRole: CultureActorRole;
  engagementType: string;
  metadata?: Record<string, unknown>;
}, deps?: CultureServiceDeps) {
  if (!allowedEngagements.has(payload.engagementType)) {
    throw new Error("Unsupported Culture engagement type.");
  }

  const row = {
    post_id: payload.postId,
    actor_profile_id: payload.actorProfileId,
    actor_role: payload.actorRole,
    engagement_type: payload.engagementType,
    metadata: payload.metadata ?? {}
  };
  const supabase = maybeSupabase(deps);

  if (!supabase) {
    const key = `${payload.postId}:${payload.actorProfileId}:${payload.engagementType}`;
    const record = { id: crypto.randomUUID(), ...row, created_at: new Date().toISOString() };
    demoCultureEngagements.set(key, record);
    return record;
  }

  const result = await supabase
    .from("culture_engagements")
    .upsert(row, { onConflict: "post_id,actor_profile_id,engagement_type" })
    .select("id, post_id, actor_profile_id, actor_role, engagement_type, metadata, created_at")
    .single() as QueryResult<Record<string, unknown>>;

  throwIfError(result as QueryResult<unknown>, "Unable to record Culture engagement.");
  return result.data;
}

export function buildCultureEventPayloadForUser(user: UserAccount, input: {
  eventType: string;
  postId?: string | null;
  feedSessionId?: string | null;
  surface?: string;
  position?: number | null;
  reasonCodes?: string[];
  metadata?: Record<string, unknown>;
}) {
  return {
    actorProfileId: user.id,
    actorRole: dbRoleForUser(user),
    ...input
  };
}

export function buildCultureEngagementPayloadForUser(user: UserAccount, input: {
  postId: string;
  engagementType: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    postId: input.postId,
    actorProfileId: user.id,
    actorRole: dbRoleForUser(user),
    engagementType: input.engagementType,
    metadata: input.metadata
  };
}

export function __resetDemoCultureStateForTests() {
  demoCultureEvents.splice(0, demoCultureEvents.length);
  demoCultureEngagements.clear();
}

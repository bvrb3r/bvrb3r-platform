import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeAccountRole } from "@/lib/auth/roles";
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

export type CultureFeedItem = {
  id: string;
  authorDisplayName: string;
  authorUsername: string | null;
  authorRoleLabel: string;
  caption: string;
  postType: string;
  media: CultureMediaItem | null;
  createdAt: string;
  serviceName?: string | null;
  shopName?: string | null;
  canLike: boolean;
  canSave: boolean;
  canShare: boolean;
  canReport: boolean;
  canBook: boolean;
  canComment: boolean;
};

export type CultureFeedResponse = {
  items: CultureFeedItem[];
  cursor: string | null;
  hasMore: boolean;
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
  media_url?: string | null;
  thumbnail_url?: string | null;
  media_type: string;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  sort_order?: number | null;
  processing_status?: string | null;
  moderation_status?: string | null;
};

type PublicProfileRow = {
  id: string;
  full_name?: string | null;
  public_username?: string | null;
  role?: Role | string | null;
};

type PublicShopRow = {
  id: string;
  name?: string | null;
  public_username?: string | null;
  shop_username?: string | null;
};

type PublicServiceRow = {
  id: string;
  name?: string | null;
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
  upsert: (values: unknown, options?: Record<string, unknown>) => QueryLike<T>;
  single: () => QueryLike<T>;
  maybeSingle: () => QueryLike<T>;
};

type SupabaseLike = {
  from: (table: string) => QueryLike;
};

type CultureServiceDeps = {
  supabase?: SupabaseLike | null;
};

type LookupMaps = {
  mediaByPost?: Map<string, CultureMediaRow[]>;
  profilesById?: Map<string, PublicProfileRow>;
  shopsById?: Map<string, PublicShopRow>;
  servicesById?: Map<string, PublicServiceRow>;
};

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

const demoCultureEvents: Array<Record<string, unknown>> = [];
const demoCultureEngagements = new Map<string, Record<string, unknown>>();

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

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeNullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

async function fetchRows<T>(query: QueryLike, fallback: string) {
  const result = await query as QueryResult<T[]>;
  throwIfError(result as QueryResult<unknown>, fallback);
  return result.data ?? [];
}

async function loadFeedLookups(supabase: SupabaseLike, posts: CulturePostRow[]): Promise<LookupMaps> {
  const postIds = posts.map((post) => post.id);
  const authorIds = [...new Set(posts.map((post) => post.author_profile_id).filter(Boolean))];
  const shopIds = [...new Set(posts.map((post) => post.shop_id).filter(Boolean))] as string[];
  const serviceIds = [...new Set(posts.map((post) => post.service_id).filter(Boolean))] as string[];

  const [mediaRows, profileRows, shopRows, serviceRows] = await Promise.all([
    postIds.length
      ? fetchRows<CultureMediaRow>(
        supabase
          .from("culture_media")
          .select("id, post_id, media_url, thumbnail_url, media_type, width, height, duration_seconds, sort_order, processing_status, moderation_status")
          .in("post_id", postIds)
          .order("sort_order", { ascending: true }),
        "Unable to load Culture media."
      )
      : Promise.resolve([]),
    authorIds.length
      ? fetchRows<PublicProfileRow>(
        supabase
          .from("profiles")
          .select("id, full_name, public_username, role")
          .in("id", authorIds),
        "Unable to load Culture authors."
      )
      : Promise.resolve([]),
    shopIds.length
      ? fetchRows<PublicShopRow>(
        supabase
          .from("shops")
          .select("id, name, public_username, shop_username")
          .in("id", shopIds),
        "Unable to load Culture shops."
      )
      : Promise.resolve([]),
    serviceIds.length
      ? fetchRows<PublicServiceRow>(
        supabase
          .from("services")
          .select("id, name")
          .in("id", serviceIds),
        "Unable to load Culture services."
      )
      : Promise.resolve([])
  ]);

  return {
    mediaByPost: groupMedia(mediaRows),
    profilesById: buildMap(profileRows),
    shopsById: buildMap(shopRows),
    servicesById: buildMap(serviceRows)
  };
}

export function mapCulturePostToSafeFeedItem(post: CulturePostRow, lookups: LookupMaps = {}): CultureFeedItem {
  const profile = lookups.profilesById?.get(post.author_profile_id);
  const media = lookups.mediaByPost?.get(post.id)?.[0] ?? null;
  const shop = post.shop_id ? lookups.shopsById?.get(post.shop_id) : null;
  const service = post.service_id ? lookups.servicesById?.get(post.service_id) : null;
  const authorDisplayName = safeText(profile?.full_name, roleLabel(post.author_role));
  const username = safeText(profile?.public_username);
  const mediaUrl = safeNullableText(media?.media_url);
  const thumbnailUrl = safeNullableText(media?.thumbnail_url);

  return {
    id: post.id,
    authorDisplayName,
    authorUsername: username ? `@${username.replace(/^@/, "")}` : null,
    authorRoleLabel: roleLabel(post.author_role),
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
    canLike: true,
    canSave: true,
    canShare: true,
    canReport: true,
    canBook: Boolean(post.is_bookable && (post.service_id || post.barber_id || post.shop_id)),
    canComment: Boolean(post.allow_comments)
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

  return {
    items: result.posts.map((post) => mapCulturePostToSafeFeedItem(post, lookups)),
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

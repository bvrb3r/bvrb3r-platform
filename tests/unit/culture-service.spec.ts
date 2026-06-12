import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetDemoCultureStateForTests,
  createCulturePostDraft,
  getCulturePostSafeDisplay,
  listCultureFeed,
  listMyCulturePosts,
  mapCulturePostToSafeFeedItem,
  recordCultureEngagement,
  recordCultureFeedEvent,
  submitCulturePostForReview,
  type CulturePostRow
} from "@/lib/culture/service";
import type { UserAccount } from "@/types/domain";

type Row = Record<string, unknown>;
type QueryChain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: <TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => PromiseLike<TResult1 | TResult2>;
};

function createQuery(rows: Row[], tableWrites: Row[]) {
  const filters: Array<(row: Row) => boolean> = [];
  let limitCount: number | null = null;
  let singleMode = false;
  let maybeSingleMode = false;
  let writeRow: Row | null = null;
  let updateRow: Row | null = null;

  const chain = {} as QueryChain;
  Object.assign(chain, {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return chain;
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return chain;
    }),
    is: vi.fn((column: string, value: unknown) => {
      filters.push((row) => (value === null ? row[column] == null : row[column] === value));
      return chain;
    }),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn((count: number) => {
      limitCount = count;
      return chain;
    }),
    insert: vi.fn((value: Row) => {
      writeRow = value;
      if (Array.isArray(value)) {
        tableWrites.push(...value);
      } else {
        tableWrites.push(value);
      }
      return chain;
    }),
    update: vi.fn((value: Row) => {
      updateRow = value;
      return chain;
    }),
    upsert: vi.fn((value: Row) => {
      writeRow = value;
      tableWrites.push(value);
      return chain;
    }),
    single: vi.fn(() => {
      singleMode = true;
      return chain;
    }),
    maybeSingle: vi.fn(() => {
      maybeSingleMode = true;
      return chain;
    }),
    then: <TResult1 = { data: unknown; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) => {
      if (updateRow) {
        const matchedRows = rows.filter((row) => filters.every((filter) => filter(row)));
        for (const row of matchedRows) {
          Object.assign(row, updateRow);
        }
        const data = matchedRows
          .sort((left, right) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")))
          .slice(0, limitCount ?? undefined);
        const result = {
          data: singleMode || maybeSingleMode ? data[0] ?? null : data,
          error: null
        };

        return Promise.resolve(result).then(onfulfilled ?? undefined, onrejected ?? undefined);
      }

      const data = writeRow
        ? { id: "write-row", ...writeRow, created_at: "2026-06-12T12:00:00.000Z" }
        : rows
          .filter((row) => filters.every((filter) => filter(row)))
          .sort((left, right) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")))
          .slice(0, limitCount ?? undefined);

      const result = {
        data: singleMode || maybeSingleMode ? (Array.isArray(data) ? data[0] ?? null : data) : data,
        error: null
      };

      return Promise.resolve(result).then(onfulfilled ?? undefined, onrejected ?? undefined);
    }
  });

  return chain;
}

function createSupabaseStub(tables: Record<string, Row[]>) {
  const writes: Record<string, Row[]> = {};

  return {
    writes,
    client: {
      from: vi.fn((table: string) => {
        writes[table] ??= [];
        return createQuery(tables[table] ?? [], writes[table]);
      })
    }
  };
}

const publishedPost: CulturePostRow = {
  id: "11111111-1111-4111-8111-111111111111",
  author_profile_id: "22222222-2222-4222-8222-222222222222",
  author_role: "barber_user",
  barber_id: "33333333-3333-4333-8333-333333333333",
  shop_id: "shop-ybor",
  service_id: "44444444-4444-4444-8444-444444444444",
  post_type: "barber_cut",
  caption: "Clean taper.",
  visibility: "public",
  moderation_status: "approved",
  publishing_status: "published",
  is_bookable: true,
  allow_comments: false,
  created_at: "2026-06-12T12:00:00.000Z",
  deleted_at: null
};

const barberUser: UserAccount = {
  id: "22222222-2222-4222-8222-222222222222",
  role: "barber_user",
  email: "blaze@bvrb3r.demo",
  password: "",
  name: "Blaze King",
  title: "Barber",
  locationIds: [],
  barberId: "barber-blaze",
  accountStatus: "active" as const
};

const ownerUser: UserAccount = {
  id: "66666666-6666-4666-8666-666666666666",
  role: "shop_owner_user",
  email: "owner@bvrb3r.demo",
  password: "",
  name: "Owner",
  title: "Shop Owner",
  locationIds: [],
  ownedShopId: "shop-ybor",
  accountStatus: "active" as const
};

const clientUser: UserAccount = {
  id: "77777777-7777-4777-8777-777777777777",
  role: "client_user",
  email: "client@bvrb3r.demo",
  password: "",
  name: "Client",
  title: "Client",
  locationIds: [],
  accountStatus: "active" as const
};

describe("Culture service", () => {
  beforeEach(() => {
    __resetDemoCultureStateForTests();
  });

  it("returns an empty feed when no Supabase client is configured", async () => {
    await expect(listCultureFeed({ role: "client" }, { supabase: null })).resolves.toEqual({
      items: [],
      cursor: null,
      hasMore: false
    });
  });

  it("returns only published public approved posts and maps safe display payloads", async () => {
    const supabase = createSupabaseStub({
      culture_posts: [
        publishedPost,
        { ...publishedPost, id: "private-post", visibility: "private" },
        { ...publishedPost, id: "draft-post", publishing_status: "draft" },
        { ...publishedPost, id: "deleted-post", deleted_at: "2026-06-12T12:10:00.000Z" }
      ],
      culture_media: [{
        id: "media-1",
        post_id: publishedPost.id,
        media_url: "https://cdn.bvrb3r.test/post.jpg",
        thumbnail_url: "https://cdn.bvrb3r.test/post-thumb.jpg",
        media_type: "image",
        processing_status: "ready",
        moderation_status: "approved",
        sort_order: 0
      }],
      profiles: [{
        id: publishedPost.author_profile_id,
        full_name: "Blaze King",
        public_username: "blaze",
        profile_photo_url: "https://cdn.bvrb3r.test/avatar.jpg",
        email: "private@example.com",
        phone: "555-0100"
      }],
      shops: [{ id: "shop-ybor", name: "BVRB3R Ybor" }],
      services: [{ id: publishedPost.service_id, name: "Signature Cut" }]
    });

    const feed = await listCultureFeed({ role: "client", limit: 10 }, { supabase: supabase.client });

    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({
      id: publishedPost.id,
      authorDisplayName: "Blaze King",
      authorUsername: "@blaze",
      authorAvatarUrl: "https://cdn.bvrb3r.test/avatar.jpg",
      authorRoleLabel: "Barber",
      authorVerified: false,
      caption: "Clean taper.",
      serviceName: "Signature Cut",
      shopName: "BVRB3R Ybor",
      canBook: true,
      canReport: true
    });
    expect(JSON.stringify(feed.items[0])).not.toContain("private@example.com");
    expect(JSON.stringify(feed.items[0])).not.toContain("555-0100");
    expect(supabase.client.from).toHaveBeenCalledWith("culture_posts");
  });

  it("sets a stable cursor without duplicating the final page item", async () => {
    const supabase = createSupabaseStub({
      culture_posts: [
        publishedPost,
        { ...publishedPost, id: "55555555-5555-4555-8555-555555555555", created_at: "2026-06-11T12:00:00.000Z" }
      ],
      culture_media: [],
      profiles: [],
      shops: [],
      services: []
    });

    const feed = await listCultureFeed({ role: "client", limit: 1 }, { supabase: supabase.client });

    expect(feed.items).toHaveLength(1);
    expect(feed.hasMore).toBe(true);
    expect(feed.cursor).toBeTruthy();
    expect(feed.items.map((item) => item.id)).toEqual([publishedPost.id]);
  });

  it("maps a single safe display item without private fields", () => {
    const item = mapCulturePostToSafeFeedItem(publishedPost, {
      profilesById: new Map([[publishedPost.author_profile_id, {
        id: publishedPost.author_profile_id,
        full_name: "Blaze King",
        public_username: "blaze",
        role: "barber_user"
      }]])
    });

    expect(item.authorDisplayName).toBe("Blaze King");
    expect(item.authorUsername).toBe("@blaze");
    expect(item.canLike).toBe(true);
    expect(item.canComment).toBe(false);
    expect(JSON.stringify(item)).not.toMatch(/email|phone|stripe|tax/i);
  });

  it("loads one safe display post by id", async () => {
    const supabase = createSupabaseStub({
      culture_posts: [publishedPost],
      culture_media: [],
      profiles: [{ id: publishedPost.author_profile_id, full_name: "Blaze King", public_username: "blaze" }],
      shops: [],
      services: []
    });

    const item = await getCulturePostSafeDisplay(publishedPost.id, { supabase: supabase.client });

    expect(item).toMatchObject({ id: publishedPost.id, authorDisplayName: "Blaze King" });
  });

  it("records feed events and engagement rows through canonical Culture tables", async () => {
    const supabase = createSupabaseStub({});

    await recordCultureFeedEvent({
      actorProfileId: "22222222-2222-4222-8222-222222222222",
      actorRole: "client_user",
      eventType: "feed_loaded",
      metadata: { source: "unit" }
    }, { supabase: supabase.client });
    await recordCultureEngagement({
      postId: publishedPost.id,
      actorProfileId: "22222222-2222-4222-8222-222222222222",
      actorRole: "client_user",
      engagementType: "save"
    }, { supabase: supabase.client });

    expect(supabase.writes.culture_feed_events[0]).toMatchObject({ event_type: "feed_loaded" });
    expect(supabase.writes.culture_engagements[0]).toMatchObject({
      post_id: publishedPost.id,
      engagement_type: "save"
    });
  });

  it("lets a barber create an owned draft without publishing it to the public feed", async () => {
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: "barber-blaze",
        app_approval_status: "approved",
        created_at: "2026-06-10T12:00:00.000Z"
      }],
      culture_posts: [],
      culture_post_tags: []
    });

    const result = await createCulturePostDraft(barberUser, {
      role: "barber",
      postType: "Fresh Cut",
      caption: "Fresh taper.",
      tags: ["fade", "fade", "Ybor"]
    }, { supabase: supabase.client });

    expect(result.post).toMatchObject({
      author_profile_id: barberUser.id,
      author_role: "barber_user",
      barber_id: publishedPost.barber_id,
      post_type: "barber_cut",
      visibility: "private",
      publishing_status: "draft",
      moderation_status: "pending"
    });
    expect(supabase.writes.culture_post_tags).toHaveLength(2);
  });

  it("blocks clients from creating barber drafts", async () => {
    const supabase = createSupabaseStub({ barbers: [], culture_posts: [] });

    await expect(createCulturePostDraft(clientUser, {
      role: "barber",
      postType: "barber_cut",
      caption: "No access."
    }, { supabase: supabase.client })).rejects.toThrow("Only barber accounts");
  });

  it("blocks clients from creating owner drafts", async () => {
    const supabase = createSupabaseStub({ shops: [], culture_posts: [] });

    await expect(createCulturePostDraft(clientUser, {
      role: "owner",
      postType: "shop_update",
      caption: "No owner access."
    }, { supabase: supabase.client })).rejects.toThrow("Only shop owner accounts");
  });

  it("blocks barbers from creating a draft for another barber id", async () => {
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: "barber-blaze",
        app_approval_status: "approved",
        created_at: "2026-06-10T12:00:00.000Z"
      }],
      culture_posts: []
    });

    await expect(createCulturePostDraft(barberUser, {
      role: "barber",
      postType: "barber_cut",
      caption: "Wrong owner.",
      barberId: "33333333-3333-4333-8333-999999999999"
    }, { supabase: supabase.client })).rejects.toThrow("own barber record");
  });

  it("lets an owner create an owned shop draft", async () => {
    const supabase = createSupabaseStub({
      shops: [{
        id: "shop-ybor",
        owner_profile_id: ownerUser.id,
        app_approval_status: "approved",
        created_at: "2026-06-10T12:00:00.000Z"
      }],
      culture_posts: []
    });

    const result = await createCulturePostDraft(ownerUser, {
      role: "owner",
      postType: "Walk-Ins Open",
      caption: "Walk-ins open this afternoon."
    }, { supabase: supabase.client });

    expect(result.post).toMatchObject({
      author_profile_id: ownerUser.id,
      author_role: "shop_owner_user",
      shop_id: "shop-ybor",
      post_type: "shop_walkins",
      visibility: "private",
      publishing_status: "draft"
    });
  });

  it("blocks owners from creating a draft for an unowned shop id", async () => {
    const supabase = createSupabaseStub({
      shops: [{
        id: "shop-ybor",
        owner_profile_id: ownerUser.id,
        app_approval_status: "approved",
        created_at: "2026-06-10T12:00:00.000Z"
      }],
      culture_posts: []
    });

    await expect(createCulturePostDraft(ownerUser, {
      role: "owner",
      postType: "shop_update",
      caption: "Wrong shop.",
      shopId: "shop-unowned"
    }, { supabase: supabase.client })).rejects.toThrow("own shop");
  });

  it("submits an owned draft for review without making it public feed eligible", async () => {
    const draftPost = {
      ...publishedPost,
      id: "draft-review",
      author_profile_id: barberUser.id,
      publishing_status: "draft",
      moderation_status: "pending",
      visibility: "private",
      caption: "Ready for review."
    };
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: "barber-blaze",
        app_approval_status: "approved",
        created_at: "2026-06-10T12:00:00.000Z"
      }],
      culture_posts: [draftPost],
      culture_media: [],
      profiles: [],
      shops: [],
      services: []
    });

    const submitted = await submitCulturePostForReview(barberUser, {
      role: "barber",
      postId: "draft-review"
    }, { supabase: supabase.client });
    const feed = await listCultureFeed({ role: "client" }, { supabase: supabase.client });

    expect(submitted.message).toBe("Post submitted for review.");
    expect(submitted.post).toMatchObject({
      publishing_status: "published",
      moderation_status: "pending",
      visibility: "unlisted"
    });
    expect(feed.items).toHaveLength(0);
  });

  it("lists own drafts, pending review, published, and archived Culture posts", async () => {
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: "barber-blaze",
        app_approval_status: "approved",
        created_at: "2026-06-10T12:00:00.000Z"
      }],
      culture_posts: [
        { ...publishedPost, id: "own-draft", author_profile_id: barberUser.id, publishing_status: "draft", moderation_status: "pending", visibility: "private" },
        { ...publishedPost, id: "own-pending", author_profile_id: barberUser.id, publishing_status: "published", moderation_status: "pending", visibility: "unlisted" },
        { ...publishedPost, id: "own-published", author_profile_id: barberUser.id, publishing_status: "published", moderation_status: "approved", visibility: "public" },
        { ...publishedPost, id: "own-archived", author_profile_id: barberUser.id, publishing_status: "archived", moderation_status: "approved", visibility: "private" },
        { ...publishedPost, id: "someone-else", author_profile_id: "another-profile", publishing_status: "draft", moderation_status: "pending", visibility: "private" }
      ]
    });

    const posts = await listMyCulturePosts(barberUser, "barber", { supabase: supabase.client });

    expect(posts.drafts.map((post) => post.id)).toEqual(["own-draft"]);
    expect(posts.pendingReview.map((post) => post.id)).toEqual(["own-pending"]);
    expect(posts.published.map((post) => post.id)).toEqual(["own-published"]);
    expect(posts.archived.map((post) => post.id)).toEqual(["own-archived"]);
  });
});

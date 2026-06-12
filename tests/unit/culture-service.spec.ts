import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetDemoCultureStateForTests,
  autoCreateCulturePostFromProfileMedia,
  createCulturePostDraft,
  createCulturePostFromProfileMedia,
  attachCulturePostImageMedia,
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
  then: <TResult1 = { data: unknown; error: Error | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => PromiseLike<TResult1 | TResult2>;
};

function createQuery(rows: Row[], tableWrites: Row[], error: Error | null = null, selectCalls?: string[]) {
  const filters: Array<(row: Row) => boolean> = [];
  let limitCount: number | null = null;
  let singleMode = false;
  let maybeSingleMode = false;
  let writeRow: Row | null = null;
  let updateRow: Row | null = null;

  function readColumn(row: Row, column: string) {
    const metadataMatch = column.match(/^metadata->>(.+)$/);
    if (metadataMatch) {
      const metadata = row.metadata as Record<string, unknown> | undefined;
      return metadata?.[metadataMatch[1] ?? ""];
    }

    return row[column];
  }

  const chain = {} as QueryChain;
  Object.assign(chain, {
    select: vi.fn((columns?: string) => {
      if (columns) {
        selectCalls?.push(columns);
      }
      return chain;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push((row) => readColumn(row, column) === value);
      return chain;
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      filters.push((row) => values.includes(readColumn(row, column)));
      return chain;
    }),
    is: vi.fn((column: string, value: unknown) => {
      filters.push((row) => {
        const columnValue = readColumn(row, column);
        return value === null ? columnValue == null : columnValue === value;
      });
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
    then: <TResult1 = { data: unknown; error: Error | null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) => {
      if (error) {
        const result = { data: null, error };
        return Promise.resolve(result).then(onfulfilled ?? undefined, onrejected ?? undefined);
      }

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

function createSupabaseStub(tables: Record<string, Row[]>, tableErrors: Record<string, Error> = {}) {
  const writes: Record<string, Row[]> = {};
  const selects: Record<string, string[]> = {};
  const uploadMock = vi.fn((_path: string) => Promise.resolve({ data: { path: _path }, error: null }));
  const createSignedUrlMock = vi.fn((path: string) => Promise.resolve({
    data: { signedUrl: `https://signed.bvrb3r.test/${path}` },
    error: null
  }));
  const getPublicUrlMock = vi.fn((path: string) => ({ data: { publicUrl: `https://public.bvrb3r.test/${path}` } }));

  return {
    writes,
    selects,
    storage: {
      uploadMock,
      createSignedUrlMock,
      getPublicUrlMock
    },
    client: {
      storage: {
        from: vi.fn(() => ({
          upload: uploadMock,
          createSignedUrl: createSignedUrlMock,
          getPublicUrl: getPublicUrlMock
        }))
      },
      from: vi.fn((table: string) => {
        writes[table] ??= [];
        selects[table] ??= [];
        return createQuery(tables[table] ?? [], writes[table], tableErrors[table] ?? null, selects[table]);
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
      shops: [{ id: "shop-ybor", name: "BVRB3R Ybor", public_username: "bvrb3r-ybor" }],
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
      shopUsername: "bvrb3r-ybor",
      canBook: true,
      canReport: true
    });
    expect(JSON.stringify(feed.items[0])).not.toContain("private@example.com");
    expect(JSON.stringify(feed.items[0])).not.toContain("555-0100");
    expect(supabase.client.from).toHaveBeenCalledWith("culture_posts");
    expect(supabase.selects.shops.join(" ")).toContain("public_username");
    expect(supabase.selects.shops.join(" ")).not.toContain("shop_username");
  });

  it("returns approved auto-created Barber and Owner Profile Studio posts in the public feed", async () => {
    const barberAutoPost = {
      ...publishedPost,
      id: "auto-feed-barber",
      author_profile_id: barberUser.id,
      barber_id: publishedPost.barber_id,
      shop_id: null,
      caption: "Auto-live barber portfolio media.",
      metadata: {
        createdFrom: "profile_studio_media",
        source_surface: "profile_studio",
        source_table: "barber_portfolio",
        source_id: "portfolio-feed-auto"
      }
    } satisfies CulturePostRow;
    const ownerAutoPost = {
      ...publishedPost,
      id: "auto-feed-owner",
      author_profile_id: ownerUser.id,
      author_role: "shop_owner_user",
      barber_id: null,
      shop_id: "shop-ybor",
      service_id: null,
      post_type: "shop_update",
      caption: "Auto-live shop gallery media.",
      created_at: "2026-06-12T11:55:00.000Z",
      metadata: {
        createdFrom: "profile_studio_media",
        source_surface: "profile_studio",
        source_table: "shop_media_asset",
        source_id: "shop-feed-auto"
      }
    } satisfies CulturePostRow;
    const supabase = createSupabaseStub({
      culture_posts: [barberAutoPost, ownerAutoPost],
      culture_media: [
        {
          id: "auto-feed-barber-media",
          post_id: "auto-feed-barber",
          media_url: "https://cdn.bvrb3r.test/barber-auto.jpg",
          thumbnail_url: "https://cdn.bvrb3r.test/barber-auto.jpg",
          media_type: "image",
          processing_status: "ready",
          moderation_status: "approved",
          sort_order: 0,
          source_table: "barber_portfolio",
          source_id: "portfolio-feed-auto",
          source_surface: "profile_studio"
        },
        {
          id: "auto-feed-owner-media",
          post_id: "auto-feed-owner",
          media_url: "https://cdn.bvrb3r.test/owner-auto.jpg",
          thumbnail_url: "https://cdn.bvrb3r.test/owner-auto.jpg",
          media_type: "image",
          processing_status: "ready",
          moderation_status: "approved",
          sort_order: 0,
          source_table: "shop_media_asset",
          source_id: "shop-feed-auto",
          source_surface: "profile_studio"
        }
      ],
      profiles: [
        { id: barberUser.id, full_name: "Blaze King", public_username: "blaze" },
        { id: ownerUser.id, full_name: "Owner Pat", public_username: "ownerpat" }
      ],
      shops: [{ id: "shop-ybor", name: "Ybor Shop" }],
      services: []
    });

    const feed = await listCultureFeed({ role: "client", limit: 10 }, { supabase: supabase.client });

    expect(feed.items.map((item) => item.id)).toEqual(["auto-feed-barber", "auto-feed-owner"]);
    expect(feed.items[0]).toMatchObject({
      authorDisplayName: "Blaze King",
      authorRoleLabel: "Barber",
      media: { url: "https://cdn.bvrb3r.test/barber-auto.jpg" }
    });
    expect(feed.items[1]).toMatchObject({
      authorDisplayName: "Owner Pat",
      authorRoleLabel: "Shop Owner",
      shopName: "Ybor Shop",
      media: { url: "https://cdn.bvrb3r.test/owner-auto.jpg" }
    });
  });

  it.each([
    ["culture_media", "media", { media: null }],
    ["profiles", "profiles", { authorDisplayName: "Barber", authorUsername: null }],
    ["shops", "shops", { shopName: null }],
    ["services", "services", { serviceName: null }]
  ] as const)("keeps public posts visible when optional %s lookup fails", async (table, lookup, expectedFallback) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const supabase = createSupabaseStub({
      culture_posts: [publishedPost],
      culture_media: [{
        id: "media-optional-failure",
        post_id: publishedPost.id,
        media_url: "https://cdn.bvrb3r.test/post.jpg",
        thumbnail_url: "https://cdn.bvrb3r.test/post.jpg",
        media_type: "image",
        processing_status: "ready",
        moderation_status: "approved",
        sort_order: 0
      }],
      profiles: [{ id: publishedPost.author_profile_id, full_name: "Blaze King", public_username: "blaze" }],
      shops: [{ id: "shop-ybor", name: "BVRB3R Ybor", public_username: "bvrb3r-ybor" }],
      services: [{ id: publishedPost.service_id, name: "Signature Cut" }]
    }, {
      [table]: new Error(`${table} lookup failed`)
    });

    try {
      const feed = await listCultureFeed({ role: "client", limit: 10 }, { supabase: supabase.client });

      expect(feed.items).toHaveLength(1);
      expect(feed.items[0]).toMatchObject({
        id: publishedPost.id,
        ...expectedFallback
      });
      expect(consoleError).toHaveBeenCalledWith("[culture-feed] optional_lookup_failed", expect.objectContaining({
        lookup
      }));
    } finally {
      consoleError.mockRestore();
    }
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

  it("signs approved private Culture media for safe feed display", async () => {
    const supabase = createSupabaseStub({
      culture_posts: [publishedPost],
      culture_media: [{
        id: "media-private-1",
        post_id: publishedPost.id,
        media_url: "culture/22222222-2222-4222-8222-222222222222/post/media.jpg",
        thumbnail_url: "culture/22222222-2222-4222-8222-222222222222/post/media.jpg",
        media_type: "image",
        processing_status: "ready",
        moderation_status: "approved",
        sort_order: 0,
        metadata: { storageBucket: "culture-media" }
      }],
      profiles: [{ id: publishedPost.author_profile_id, full_name: "Blaze King", public_username: "blaze" }],
      shops: [],
      services: []
    });

    const feed = await listCultureFeed({ role: "client", limit: 10 }, { supabase: supabase.client });

    expect(feed.items[0]?.media?.url).toBe("https://signed.bvrb3r.test/culture/22222222-2222-4222-8222-222222222222/post/media.jpg");
    expect(JSON.stringify(feed.items[0])).not.toContain("\"media_url\"");
    expect(supabase.storage.createSignedUrlMock).toHaveBeenCalledWith("culture/22222222-2222-4222-8222-222222222222/post/media.jpg", 3600);
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

  it("attaches valid image media to an owned barber draft through Culture storage", async () => {
    const draftPost = {
      ...publishedPost,
      id: "own-draft-media",
      author_profile_id: barberUser.id,
      barber_id: publishedPost.barber_id,
      publishing_status: "draft",
      moderation_status: "pending",
      visibility: "private"
    };
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: barberUser.barberId,
        app_approval_status: "approved"
      }],
      culture_posts: [draftPost],
      culture_media: []
    });

    const result = await attachCulturePostImageMedia(barberUser, {
      role: "barber",
      postId: draftPost.id,
      fileName: "work.jpg",
      contentType: "image/jpeg",
      size: 4,
      bytes: new Uint8Array([1, 2, 3, 4]).buffer
    }, { supabase: supabase.client });

    expect(supabase.storage.uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^culture\/22222222-2222-4222-8222-222222222222\/own-draft-media\/.+\.jpg$/),
      expect.any(ArrayBuffer),
      { contentType: "image/jpeg", upsert: false }
    );
    expect(supabase.writes.culture_media[0]).toMatchObject({
      post_id: draftPost.id,
      media_type: "image",
      processing_status: "ready",
      moderation_status: "pending"
    });
    expect(result.media.url).toMatch(/^https:\/\/signed\.bvrb3r\.test\/culture\//);
  });

  it("attaches valid image media to an owned shop draft through Culture storage", async () => {
    const draftPost = {
      ...publishedPost,
      id: "own-shop-draft-media",
      author_profile_id: ownerUser.id,
      author_role: "shop_owner_user",
      barber_id: null,
      shop_id: "shop-ybor",
      service_id: null,
      post_type: "shop_update",
      publishing_status: "draft",
      moderation_status: "pending",
      visibility: "private"
    };
    const supabase = createSupabaseStub({
      shops: [{
        id: "shop-ybor",
        owner_profile_id: ownerUser.id,
        app_approval_status: "approved"
      }],
      culture_posts: [draftPost],
      culture_media: []
    });

    const result = await attachCulturePostImageMedia(ownerUser, {
      role: "owner",
      postId: draftPost.id,
      fileName: "shop.png",
      contentType: "image/png",
      size: 4,
      bytes: new Uint8Array([1, 2, 3, 4]).buffer
    }, { supabase: supabase.client });

    expect(supabase.storage.uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^culture\/66666666-6666-4666-8666-666666666666\/own-shop-draft-media\/.+\.png$/),
      expect.any(ArrayBuffer),
      { contentType: "image/png", upsert: false }
    );
    expect(supabase.writes.culture_media[0]).toMatchObject({
      post_id: draftPost.id,
      media_type: "image",
      processing_status: "ready",
      moderation_status: "pending"
    });
    expect(result.media.url).toMatch(/^https:\/\/signed\.bvrb3r\.test\/culture\//);
  });

  it("creates a live barber Culture post from approved Profile Studio portfolio media without duplicating binary media", async () => {
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: barberUser.barberId,
        app_approval_status: "approved"
      }],
      barber_portfolios: [{
        id: "portfolio-profile-studio-1",
        barber_reference: barberUser.barberId,
        storage_path: "profiles/barbers/barber-blaze/gallery/work.jpg",
        image_url: "https://cdn.bvrb3r.test/work.jpg",
        caption: "Low taper from Profile Studio.",
        featured: false
      }],
      culture_posts: [],
      culture_media: []
    });

    const result = await createCulturePostFromProfileMedia(barberUser, {
      role: "barber",
      sourceType: "barber_portfolio",
      sourceId: "portfolio-profile-studio-1"
    }, { supabase: supabase.client });

    expect(result.post).toMatchObject({
      author_profile_id: barberUser.id,
      author_role: "barber_user",
      barber_id: publishedPost.barber_id,
      post_type: "barber_cut",
      publishing_status: "published",
      moderation_status: "approved",
      visibility: "public"
    });
    expect(supabase.writes.culture_media[0]).toMatchObject({
      post_id: result.post.id,
      media_asset_id: null,
      media_url: "https://cdn.bvrb3r.test/work.jpg",
      thumbnail_url: "https://cdn.bvrb3r.test/work.jpg",
      processing_status: "ready",
      moderation_status: "approved",
      source_table: "barber_portfolio",
      source_id: "portfolio-profile-studio-1",
      source_surface: "profile_studio",
      metadata: {
        source_surface: "profile_studio",
        source_table: "barber_portfolio",
        source_id: "portfolio-profile-studio-1"
      }
    });
    expect(supabase.storage.uploadMock).not.toHaveBeenCalled();
  });

  it("can submit owned Profile Studio portfolio media for review without making it public", async () => {
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: barberUser.barberId,
        app_approval_status: "approved"
      }],
      barber_portfolios: [{
        id: "portfolio-submit-profile-studio-1",
        barber_reference: barberUser.barberId,
        storage_path: "profiles/barbers/barber-blaze/gallery/review.jpg",
        image_url: "https://cdn.bvrb3r.test/review.jpg",
        caption: "Ready for review.",
        featured: false
      }],
      culture_posts: [],
      culture_media: []
    });

    const result = await createCulturePostFromProfileMedia(barberUser, {
      role: "barber",
      sourceType: "barber_portfolio",
      sourceId: "portfolio-submit-profile-studio-1",
      submitForReview: true
    }, { supabase: supabase.client });

    expect(result.post).toMatchObject({
      publishing_status: "published",
      moderation_status: "pending",
      visibility: "unlisted"
    });
    expect(result.post.metadata).toMatchObject({
      createdFrom: "profile_studio_media",
      submittedForReview: true,
      source_surface: "profile_studio"
    });
    expect(result.message).toBe("Culture post submitted for review from Profile Studio media.");
  });

  it("blocks barbers from sharing another barber's portfolio media to Culture", async () => {
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: barberUser.barberId,
        app_approval_status: "approved"
      }],
      barber_portfolios: [{
        id: "portfolio-other-barber",
        barber_reference: "barber-other",
        storage_path: "profiles/barbers/other/gallery/work.jpg",
        image_url: "https://cdn.bvrb3r.test/other.jpg",
        caption: "Not owned."
      }],
      culture_posts: [],
      culture_media: []
    });

    await expect(createCulturePostFromProfileMedia(barberUser, {
      role: "barber",
      sourceType: "barber_portfolio",
      sourceId: "portfolio-other-barber"
    }, { supabase: supabase.client })).rejects.toThrow("their own portfolio media");
    expect(supabase.writes.culture_posts ?? []).toHaveLength(0);
    expect(supabase.writes.culture_media ?? []).toHaveLength(0);
  });

  it("creates a live owner Culture post from approved shop gallery media", async () => {
    const supabase = createSupabaseStub({
      shops: [{
        id: "shop-ybor",
        owner_profile_id: ownerUser.id,
        app_approval_status: "approved"
      }],
      shop_media_assets: [{
        id: "shop-media-profile-studio-1",
        shop_reference: "shop-ybor",
        storage_path: "profiles/shops/shop-ybor/gallery/front.jpg",
        image_url: "https://cdn.bvrb3r.test/shop-front.jpg",
        caption: "Front chair wall.",
        featured: false
      }],
      culture_posts: [],
      culture_media: []
    });

    const result = await createCulturePostFromProfileMedia(ownerUser, {
      role: "owner",
      sourceType: "shop_media_asset",
      sourceId: "shop-media-profile-studio-1"
    }, { supabase: supabase.client });

    expect(result.post).toMatchObject({
      author_profile_id: ownerUser.id,
      author_role: "shop_owner_user",
      shop_id: "shop-ybor",
      post_type: "shop_update",
      publishing_status: "published",
      moderation_status: "approved",
      visibility: "public"
    });
    expect(supabase.writes.culture_media[0]).toMatchObject({
      media_url: "https://cdn.bvrb3r.test/shop-front.jpg",
      processing_status: "ready",
      moderation_status: "approved",
      source_table: "shop_media_asset",
      source_id: "shop-media-profile-studio-1",
      source_surface: "profile_studio",
      metadata: {
        source_surface: "profile_studio",
        source_table: "shop_media_asset",
        source_id: "shop-media-profile-studio-1"
      }
    });
    expect(supabase.storage.uploadMock).not.toHaveBeenCalled();
  });

  it("blocks owners from sharing another shop's media to Culture", async () => {
    const supabase = createSupabaseStub({
      shops: [{
        id: "shop-ybor",
        owner_profile_id: ownerUser.id,
        app_approval_status: "approved"
      }],
      shop_media_assets: [{
        id: "shop-media-unowned",
        shop_reference: "shop-other",
        storage_path: "profiles/shops/shop-other/gallery/front.jpg",
        image_url: "https://cdn.bvrb3r.test/shop-other.jpg",
        caption: "Other shop."
      }],
      culture_posts: [],
      culture_media: []
    });

    await expect(createCulturePostFromProfileMedia(ownerUser, {
      role: "owner",
      sourceType: "shop_media_asset",
      sourceId: "shop-media-unowned"
    }, { supabase: supabase.client })).rejects.toThrow("their own shop");
    expect(supabase.writes.culture_posts ?? []).toHaveLength(0);
    expect(supabase.writes.culture_media ?? []).toHaveLength(0);
  });

  it("keeps client Profile Studio media sharing gated", async () => {
    const supabase = createSupabaseStub({
      media_assets: [{
        id: "client-profile-media-1",
        owner_profile_id: clientUser.id,
        asset_type: "client_profile_post",
        storage_path: "profiles/client/client-1/posts/image.jpg"
      }],
      culture_posts: [],
      culture_media: []
    });

    await expect(createCulturePostFromProfileMedia(clientUser, {
      role: "client",
      sourceType: "client_profile_post",
      sourceId: "client-profile-media-1"
    }, { supabase: supabase.client })).rejects.toThrow("Client Culture posting unlocks later.");
    expect(supabase.writes.culture_posts ?? []).toHaveLength(0);
  });

  it("auto-publishes approved barber portfolio media to Culture", async () => {
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: barberUser.barberId,
        app_approval_status: "approved"
      }],
      culture_posts: [],
      culture_media: []
    });

    const result = await autoCreateCulturePostFromProfileMedia(barberUser, {
      role: "barber",
      sourceTable: "barber_portfolio",
      sourceId: "portfolio-auto-1",
      barberId: barberUser.barberId,
      caption: "Auto shared cut.",
      storagePath: "profiles/barbers/barber-blaze/gallery/auto.jpg",
      imageUrl: "https://cdn.bvrb3r.test/auto.jpg"
    }, { supabase: supabase.client });

    expect(result.status).toBe("created");
    expect(result.post).toMatchObject({
      author_profile_id: barberUser.id,
      author_role: "barber_user",
      barber_id: publishedPost.barber_id,
      post_type: "barber_cut",
      publishing_status: "published",
      moderation_status: "approved",
      visibility: "public"
    });
    expect(supabase.writes.culture_media[0]).toMatchObject({
      media_url: "https://cdn.bvrb3r.test/auto.jpg",
      source_table: "barber_portfolio",
      source_id: "portfolio-auto-1",
      source_surface: "profile_studio",
      moderation_status: "approved",
      metadata: {
        source_surface: "profile_studio",
        source_table: "barber_portfolio",
        source_id: "portfolio-auto-1",
        autoShared: true,
        roleContext: "barber"
      }
    });
    expect(supabase.storage.uploadMock).not.toHaveBeenCalled();
  });

  it("does not auto-publish barber media until the barber is approved", async () => {
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: barberUser.barberId,
        app_approval_status: "pending"
      }],
      culture_posts: [],
      culture_media: []
    });

    const result = await autoCreateCulturePostFromProfileMedia(barberUser, {
      role: "barber",
      sourceTable: "barber_portfolio",
      sourceId: "portfolio-pending-1",
      barberId: barberUser.barberId,
      storagePath: "profiles/barbers/barber-blaze/gallery/pending.jpg",
      imageUrl: "https://cdn.bvrb3r.test/pending.jpg"
    }, { supabase: supabase.client });

    expect(result.status).toBe("skipped");
    expect(supabase.writes.culture_posts ?? []).toHaveLength(0);
    expect(supabase.writes.culture_media ?? []).toHaveLength(0);
  });

  it("does not auto-publish shop media until the owner shop is approved", async () => {
    const supabase = createSupabaseStub({
      shops: [{
        id: "shop-ybor",
        owner_profile_id: ownerUser.id,
        app_approval_status: "pending"
      }],
      culture_posts: [],
      culture_media: []
    });

    const result = await autoCreateCulturePostFromProfileMedia(ownerUser, {
      role: "owner",
      sourceTable: "shop_media_asset",
      sourceId: "shop-pending-1",
      shopId: "shop-ybor",
      storagePath: "profiles/shops/shop-ybor/gallery/pending.jpg",
      imageUrl: "https://cdn.bvrb3r.test/pending-shop.jpg"
    }, { supabase: supabase.client });

    expect(result.status).toBe("skipped");
    expect(supabase.writes.culture_posts ?? []).toHaveLength(0);
    expect(supabase.writes.culture_media ?? []).toHaveLength(0);
  });

  it("updates an existing auto-shared Culture post instead of duplicating it", async () => {
    const existingPosts = [{
      ...publishedPost,
      id: "existing-auto-post",
      author_profile_id: barberUser.id,
      caption: "Old caption",
      visibility: "public",
      moderation_status: "approved",
      publishing_status: "published",
      metadata: {
        source_surface: "profile_studio",
        source_table: "barber_portfolio",
        source_id: "portfolio-auto-existing"
      }
    }];
    const existingMedia = [{
      id: "existing-auto-media",
      post_id: "existing-auto-post",
      media_url: "https://cdn.bvrb3r.test/old.jpg",
      thumbnail_url: "https://cdn.bvrb3r.test/old.jpg",
      media_type: "image",
      processing_status: "ready",
      moderation_status: "approved",
      source_table: "barber_portfolio",
      source_id: "portfolio-auto-existing",
      source_surface: "profile_studio",
      metadata: {
        source_surface: "profile_studio",
        source_table: "barber_portfolio",
        source_id: "portfolio-auto-existing"
      }
    }];
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: barberUser.barberId,
        app_approval_status: "approved"
      }],
      culture_posts: existingPosts,
      culture_media: existingMedia
    });

    const result = await autoCreateCulturePostFromProfileMedia(barberUser, {
      role: "barber",
      sourceTable: "barber_portfolio",
      sourceId: "portfolio-auto-existing",
      barberId: barberUser.barberId,
      caption: "Updated caption",
      storagePath: "profiles/barbers/barber-blaze/gallery/new.jpg",
      imageUrl: "https://cdn.bvrb3r.test/new.jpg"
    }, { supabase: supabase.client });

    expect(result.status).toBe("updated");
    expect(supabase.writes.culture_posts ?? []).toHaveLength(0);
    expect(supabase.writes.culture_media ?? []).toHaveLength(0);
    expect(existingPosts[0]).toMatchObject({
      caption: "Updated caption",
      publishing_status: "published",
      moderation_status: "approved",
      visibility: "public"
    });
    expect(existingMedia[0]).toMatchObject({
      media_url: "https://cdn.bvrb3r.test/new.jpg",
      thumbnail_url: "https://cdn.bvrb3r.test/new.jpg"
    });
  });

  it("returns an existing Profile Studio Culture post from the manual bridge instead of duplicating it", async () => {
    const existingPost = {
      ...publishedPost,
      id: "existing-manual-bridge-post",
      author_profile_id: barberUser.id,
      barber_id: publishedPost.barber_id,
      caption: "Already live.",
      visibility: "public",
      moderation_status: "approved",
      publishing_status: "published",
      metadata: {
        source_surface: "profile_studio",
        source_table: "barber_portfolio",
        source_id: "portfolio-manual-existing"
      }
    };
    const existingMedia = {
      id: "existing-manual-bridge-media",
      post_id: "existing-manual-bridge-post",
      media_url: "https://cdn.bvrb3r.test/existing.jpg",
      thumbnail_url: "https://cdn.bvrb3r.test/existing.jpg",
      media_type: "image",
      processing_status: "ready",
      moderation_status: "approved",
      source_table: "barber_portfolio",
      source_id: "portfolio-manual-existing",
      source_surface: "profile_studio",
      metadata: {
        source_surface: "profile_studio",
        source_table: "barber_portfolio",
        source_id: "portfolio-manual-existing"
      }
    };
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: barberUser.barberId,
        app_approval_status: "approved"
      }],
      barber_portfolios: [{
        id: "portfolio-manual-existing",
        barber_reference: barberUser.barberId,
        storage_path: "profiles/barbers/barber-blaze/gallery/existing.jpg",
        image_url: "https://cdn.bvrb3r.test/existing.jpg",
        caption: "Existing source."
      }],
      culture_posts: [existingPost],
      culture_media: [existingMedia]
    });

    const result = await createCulturePostFromProfileMedia(barberUser, {
      role: "barber",
      sourceType: "barber_portfolio",
      sourceId: "portfolio-manual-existing"
    }, { supabase: supabase.client });

    expect(result.post.id).toBe("existing-manual-bridge-post");
    expect(supabase.writes.culture_posts ?? []).toHaveLength(0);
    expect(supabase.writes.culture_media ?? []).toHaveLength(0);
  });

  it("auto-publishes approved shop gallery media to Culture", async () => {
    const supabase = createSupabaseStub({
      shops: [{
        id: "shop-ybor",
        owner_profile_id: ownerUser.id,
        app_approval_status: "approved"
      }],
      culture_posts: [],
      culture_media: []
    });

    const result = await autoCreateCulturePostFromProfileMedia(ownerUser, {
      role: "owner",
      sourceTable: "shop_media_asset",
      sourceId: "shop-auto-1",
      shopId: "shop-ybor",
      caption: "Shop wall.",
      storagePath: "profiles/shops/shop-ybor/gallery/wall.jpg",
      imageUrl: "https://cdn.bvrb3r.test/wall.jpg"
    }, { supabase: supabase.client });

    expect(result.status).toBe("created");
    expect(result.post).toMatchObject({
      author_profile_id: ownerUser.id,
      author_role: "shop_owner_user",
      shop_id: "shop-ybor",
      post_type: "shop_update",
      publishing_status: "published",
      moderation_status: "approved",
      visibility: "public"
    });
    expect(supabase.writes.culture_media[0]).toMatchObject({
      media_url: "https://cdn.bvrb3r.test/wall.jpg",
      source_table: "shop_media_asset",
      source_id: "shop-auto-1",
      source_surface: "profile_studio",
      metadata: {
        source_surface: "profile_studio",
        source_table: "shop_media_asset",
        source_id: "shop-auto-1",
        autoShared: true,
        roleContext: "owner"
      }
    });
  });

  it("keeps client Profile Studio media out of auto-published Culture", async () => {
    const supabase = createSupabaseStub({
      culture_posts: [],
      culture_media: []
    });

    const result = await autoCreateCulturePostFromProfileMedia(clientUser, {
      role: "client",
      sourceTable: "client_profile_post",
      sourceId: "client-auto-1",
      storagePath: "profiles/client/client-1/posts/image.jpg",
      imageUrl: "https://cdn.bvrb3r.test/client.jpg"
    }, { supabase: supabase.client });

    expect(result).toMatchObject({
      status: "skipped",
      reason: "Client Culture posting unlocks later."
    });
    expect(supabase.writes.culture_posts ?? []).toHaveLength(0);
    expect(supabase.writes.culture_media ?? []).toHaveLength(0);
  });

  it("rejects unsupported Culture image mime types before storage upload", async () => {
    const draftPost = {
      ...publishedPost,
      id: "own-draft-invalid-media",
      author_profile_id: barberUser.id,
      publishing_status: "draft",
      moderation_status: "pending",
      visibility: "private"
    };
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: barberUser.barberId,
        app_approval_status: "approved"
      }],
      culture_posts: [draftPost],
      culture_media: []
    });

    await expect(attachCulturePostImageMedia(barberUser, {
      role: "barber",
      postId: draftPost.id,
      fileName: "clip.gif",
      contentType: "image/gif",
      size: 4,
      bytes: new Uint8Array([1, 2, 3, 4]).buffer
    }, { supabase: supabase.client })).rejects.toThrow("Only JPEG, PNG, and WebP Culture images are supported.");
    expect(supabase.storage.uploadMock).not.toHaveBeenCalled();
  });

  it("rejects oversized Culture images before storage upload", async () => {
    const draftPost = {
      ...publishedPost,
      id: "own-draft-large-media",
      author_profile_id: barberUser.id,
      publishing_status: "draft",
      moderation_status: "pending",
      visibility: "private"
    };
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: barberUser.barberId,
        app_approval_status: "approved"
      }],
      culture_posts: [draftPost],
      culture_media: []
    });

    await expect(attachCulturePostImageMedia(barberUser, {
      role: "barber",
      postId: draftPost.id,
      fileName: "large.jpg",
      contentType: "image/jpeg",
      size: 10 * 1024 * 1024 + 1,
      bytes: new Uint8Array([1, 2, 3, 4]).buffer
    }, { supabase: supabase.client })).rejects.toThrow("Culture image uploads must be 10MB or smaller.");
    expect(supabase.storage.uploadMock).not.toHaveBeenCalled();
  });

  it("does not allow media attachment to another author's Culture post", async () => {
    const supabase = createSupabaseStub({
      barbers: [{
        id: publishedPost.barber_id,
        profile_id: barberUser.id,
        reference_code: barberUser.barberId,
        app_approval_status: "approved"
      }],
      culture_posts: [{ ...publishedPost, id: "someone-else-draft", author_profile_id: "another-profile", publishing_status: "draft", visibility: "private" }],
      culture_media: []
    });

    await expect(attachCulturePostImageMedia(barberUser, {
      role: "barber",
      postId: "someone-else-draft",
      fileName: "work.jpg",
      contentType: "image/jpeg",
      size: 4,
      bytes: new Uint8Array([1, 2, 3, 4]).buffer
    }, { supabase: supabase.client })).rejects.toThrow("Culture post was not found for this account.");
    expect(supabase.storage.uploadMock).not.toHaveBeenCalled();
  });

  it("does not allow owners to attach media to an unowned shop post", async () => {
    const supabase = createSupabaseStub({
      shops: [{
        id: "shop-ybor",
        owner_profile_id: ownerUser.id,
        app_approval_status: "approved"
      }],
      culture_posts: [{
        ...publishedPost,
        id: "unowned-shop-draft",
        author_profile_id: ownerUser.id,
        author_role: "shop_owner_user",
        barber_id: null,
        shop_id: "shop-unowned",
        publishing_status: "draft",
        visibility: "private"
      }],
      culture_media: []
    });

    await expect(attachCulturePostImageMedia(ownerUser, {
      role: "owner",
      postId: "unowned-shop-draft",
      fileName: "shop.webp",
      contentType: "image/webp",
      size: 4,
      bytes: new Uint8Array([1, 2, 3, 4]).buffer
    }, { supabase: supabase.client })).rejects.toThrow("own shop Culture posts");
    expect(supabase.storage.uploadMock).not.toHaveBeenCalled();
  });

  it("keeps draft media out of the public Culture feed", async () => {
    const supabase = createSupabaseStub({
      culture_posts: [{ ...publishedPost, id: "draft-with-media", publishing_status: "draft", moderation_status: "pending", visibility: "private" }],
      culture_media: [{
        id: "media-draft",
        post_id: "draft-with-media",
        media_url: "culture/user/post/media.jpg",
        thumbnail_url: "culture/user/post/media.jpg",
        media_type: "image",
        processing_status: "ready",
        moderation_status: "approved",
        sort_order: 0
      }],
      profiles: [],
      shops: [],
      services: []
    });

    const feed = await listCultureFeed({ role: "client", limit: 10 }, { supabase: supabase.client });

    expect(feed.items).toEqual([]);
    expect(supabase.storage.createSignedUrlMock).not.toHaveBeenCalled();
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

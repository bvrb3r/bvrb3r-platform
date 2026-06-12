import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserAccount } from "@/types/domain";

type Row = Record<string, unknown>;
type QueryChain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: <TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => PromiseLike<TResult1 | TResult2>;
};

const {
  createSupabaseAdminClientMock,
  createSupabaseServerClientMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock
}));

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return {
    ...actual,
    isSupabaseEnabled: () => true
  };
});

import { mutateProfileMedia } from "@/lib/profile/service";

function readColumn(row: Row, column: string) {
  const metadataMatch = column.match(/^metadata->>(.+)$/);
  if (metadataMatch) {
    const metadata = row.metadata as Record<string, unknown> | undefined;
    return metadata?.[metadataMatch[1] ?? ""];
  }

  return row[column];
}

function createQuery(table: string, rows: Row[], tableWrites: Row[], counters: Record<string, number>) {
  const filters: Array<(row: Row) => boolean> = [];
  let limitCount: number | null = null;
  let singleMode = false;
  let maybeSingleMode = false;
  let writeRow: Row | null = null;
  let updateRow: Row | null = null;
  let deleteMode = false;

  const chain = {} as QueryChain;
  Object.assign(chain, {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push((row) => readColumn(row, column) === value);
      return chain;
    }),
    order: vi.fn(() => chain),
    limit: vi.fn((count: number) => {
      limitCount = count;
      return chain;
    }),
    insert: vi.fn((value: Row) => {
      counters[table] = (counters[table] ?? 0) + 1;
      writeRow = {
        id: value.id ?? `${table}-write-${counters[table]}`,
        ...value,
        created_at: value.created_at ?? "2026-06-12T12:00:00.000Z"
      };
      tableWrites.push(writeRow);
      return chain;
    }),
    update: vi.fn((value: Row) => {
      updateRow = value;
      return chain;
    }),
    upsert: vi.fn((value: Row) => {
      counters[table] = (counters[table] ?? 0) + 1;
      writeRow = {
        id: value.id ?? `${table}-write-${counters[table]}`,
        ...value,
        created_at: value.created_at ?? "2026-06-12T12:00:00.000Z"
      };
      tableWrites.push(writeRow);
      return chain;
    }),
    delete: vi.fn(() => {
      deleteMode = true;
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
      if (deleteMode) {
        const matchedRows = rows.filter((row) => filters.every((filter) => filter(row)));
        for (const row of matchedRows) {
          rows.splice(rows.indexOf(row), 1);
        }
        return Promise.resolve({ data: null, error: null }).then(onfulfilled ?? undefined, onrejected ?? undefined);
      }

      if (updateRow) {
        const matchedRows = rows.filter((row) => filters.every((filter) => filter(row)));
        for (const row of matchedRows) {
          Object.assign(row, updateRow);
        }
        const data = matchedRows.slice(0, limitCount ?? undefined);
        return Promise.resolve({
          data: singleMode || maybeSingleMode ? data[0] ?? null : data,
          error: null
        }).then(onfulfilled ?? undefined, onrejected ?? undefined);
      }

      const data = writeRow
        ? writeRow
        : rows
            .filter((row) => filters.every((filter) => filter(row)))
            .slice(0, limitCount ?? undefined);

      return Promise.resolve({
        data: singleMode || maybeSingleMode ? (Array.isArray(data) ? data[0] ?? null : data) : data,
        error: null
      }).then(onfulfilled ?? undefined, onrejected ?? undefined);
    }
  });

  return chain;
}

function createSupabaseStub(tables: Record<string, Row[]>) {
  const writes: Record<string, Row[]> = {};
  const counters: Record<string, number> = {};
  const client = {
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://public.bvrb3r.test/${path}` } })
      }))
    },
    from: vi.fn((table: string) => {
      writes[table] ??= [];
      tables[table] ??= [];
      return createQuery(table, tables[table], writes[table], counters);
    })
  };

  return { client, writes };
}

const barberUser: UserAccount = {
  id: "profile-barber",
  role: "barber_user",
  email: "barber@bvrb3r.test",
  password: "",
  name: "Blaze King",
  title: "Barber",
  locationIds: [],
  barberId: "barber-blaze",
  accountStatus: "active"
};

const ownerUser: UserAccount = {
  id: "profile-owner",
  role: "shop_owner_user",
  email: "owner@bvrb3r.test",
  password: "",
  name: "Owner",
  title: "Shop Owner",
  locationIds: [],
  ownedShopId: "shop-ybor",
  accountStatus: "active"
};

const clientUser: UserAccount = {
  id: "profile-client",
  role: "client_user",
  email: "client@bvrb3r.test",
  password: "",
  name: "Client",
  title: "Client",
  locationIds: [],
  accountStatus: "active"
};

function mockServerUser(user: UserAccount) {
  createSupabaseServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: user.id, email: user.email } },
        error: null
      })
    }
  });
}

describe("profile media service Culture auto-share", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    createSupabaseServerClientMock.mockReset();
  });

  it("auto-creates a public Culture post when an approved barber adds portfolio media", async () => {
    mockServerUser(barberUser);
    const supabase = createSupabaseStub({
      profiles: [{ id: barberUser.id, email: barberUser.email, role: barberUser.role }],
      barbers: [{
        id: "barber-canonical",
        profile_id: barberUser.id,
        reference_code: barberUser.barberId,
        app_approval_status: "approved"
      }],
      barber_profiles: [],
      marketplace_visibility: [],
      barber_portfolios: [],
      culture_posts: [],
      culture_media: [],
      notification_preferences: []
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await mutateProfileMedia(barberUser, {
      action: "add_barber_gallery_image",
      storagePath: "profiles/barbers/barber-blaze/gallery/work.jpg",
      imageUrl: "https://cdn.bvrb3r.test/work.jpg",
      caption: "Auto cut"
    });

    expect(supabase.writes.barber_portfolios[0]).toMatchObject({
      id: "barber_portfolios-write-1",
      barber_reference: barberUser.barberId,
      image_url: "https://cdn.bvrb3r.test/work.jpg"
    });
    expect(supabase.writes.culture_posts[0]).toMatchObject({
      author_profile_id: barberUser.id,
      author_role: "barber_user",
      barber_id: "barber-canonical",
      caption: "Auto cut",
      publishing_status: "published",
      moderation_status: "approved",
      visibility: "public"
    });
    expect(supabase.writes.culture_media[0]).toMatchObject({
      post_id: "culture_posts-write-1",
      media_url: "https://cdn.bvrb3r.test/work.jpg",
      metadata: {
        source_surface: "profile_studio",
        source_table: "barber_portfolio",
        source_id: "barber_portfolios-write-1",
        autoShared: true
      }
    });
  });

  it("does not auto-publish client profile media", async () => {
    mockServerUser(clientUser);
    const supabase = createSupabaseStub({
      profiles: [{ id: clientUser.id, email: clientUser.email, role: clientUser.role }],
      media_assets: [],
      culture_posts: [],
      culture_media: [],
      notification_preferences: []
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await mutateProfileMedia(clientUser, {
      action: "add_client_gallery_image",
      storagePath: "profiles/client/profile-client/posts/post.jpg",
      imageUrl: "https://cdn.bvrb3r.test/client.jpg"
    });

    expect(supabase.writes.media_assets[0]).toMatchObject({
      asset_type: "client_profile_post",
      storage_path: "profiles/client/profile-client/posts/post.jpg"
    });
    expect(supabase.writes.culture_posts ?? []).toHaveLength(0);
    expect(supabase.writes.culture_media ?? []).toHaveLength(0);
  });

  it("auto-creates a public Culture post when an approved owner adds shop media", async () => {
    mockServerUser(ownerUser);
    const supabase = createSupabaseStub({
      profiles: [{ id: ownerUser.id, email: ownerUser.email, role: ownerUser.role }],
      shops: [{
        id: "shop-ybor",
        owner_profile_id: ownerUser.id,
        app_approval_status: "approved",
        name: "Ybor Shop",
        neighborhood: "Ybor",
        city: "Tampa",
        profile_photo_path: null,
        profile_photo_url: null
      }],
      shop_media_assets: [],
      culture_posts: [],
      culture_media: [],
      notification_preferences: []
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await mutateProfileMedia(ownerUser, {
      action: "add_shop_gallery_image",
      shopId: "shop-ybor",
      storagePath: "profiles/shops/shop-ybor/gallery/shop.jpg",
      imageUrl: "https://cdn.bvrb3r.test/shop.jpg",
      caption: "Shop floor"
    });

    expect(supabase.writes.shop_media_assets[0]).toMatchObject({
      id: "shop_media_assets-write-1",
      shop_reference: "shop-ybor",
      image_url: "https://cdn.bvrb3r.test/shop.jpg"
    });
    expect(supabase.writes.culture_posts[0]).toMatchObject({
      author_profile_id: ownerUser.id,
      author_role: "shop_owner_user",
      shop_id: "shop-ybor",
      caption: "Shop floor",
      publishing_status: "published",
      moderation_status: "approved",
      visibility: "public"
    });
    expect(supabase.writes.culture_media[0]).toMatchObject({
      post_id: "culture_posts-write-1",
      media_url: "https://cdn.bvrb3r.test/shop.jpg",
      metadata: {
        source_surface: "profile_studio",
        source_table: "shop_media_asset",
        source_id: "shop_media_assets-write-1",
        autoShared: true
      }
    });
  });
});

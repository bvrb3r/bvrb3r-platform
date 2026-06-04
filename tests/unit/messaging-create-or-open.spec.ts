import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClientMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

import { createMessagingThread, getMessagingInboxPayload } from "@/lib/messages/service";

type Row = Record<string, unknown>;

const clientProfile = {
  id: "profile-client",
  full_name: "Private Client",
  email: "client@bvrb3r.test",
  role: "client_user",
  public_username: "phillipmcgee",
  profile_photo_path: null,
  profile_photo_url: null,
  public_city: "Tampa",
  public_state: "FL"
};

const barberProfile = {
  id: "profile-barber",
  full_name: "Private Barber",
  email: "barber@bvrb3r.test",
  role: "barber_user",
  public_username: null,
  profile_photo_path: null,
  profile_photo_url: null,
  public_city: null,
  public_state: null
};

const ownerProfile = {
  id: "profile-owner",
  full_name: "Private Owner",
  email: "owner@bvrb3r.test",
  role: "owner",
  public_username: null,
  profile_photo_path: null,
  profile_photo_url: null,
  public_city: null,
  public_state: null
};

const shopRow = {
  id: "shop-the-bvrb3r-shop",
  name: "The BVRB3R Shop (University Mall)",
  public_username: "thebvrb3rshopuniversitymall",
  profile_photo_path: null,
  profile_photo_url: "https://cdn.bvrb3r.test/shop-logo.jpg",
  address: "2172 University Square Mall",
  city: "Tampa",
  state: "FL",
  zip_code: "33612",
  owner_profile_id: "profile-owner"
};

function createMessagingSupabaseMock(options: {
  actor: "client" | "barber" | "owner";
  existingShopThread?: boolean;
  appointmentsError?: boolean;
  noOwnedShop?: boolean;
  readbackMembershipError?: boolean;
}) {
  const state = {
    message_threads: options.existingShopThread
      ? [{
          id: "thread-existing-shop",
          thread_type: options.actor === "owner" ? "client_shop" : "barber_shop",
          appointment_id: null,
          location_id: null,
          created_at: "2026-06-04T12:00:00.000Z",
          updated_at: "2026-06-04T12:00:00.000Z",
          created_by_profile_id: "profile-owner"
        }]
      : [] as Row[],
    thread_participants: options.existingShopThread
      ? [
          {
            id: "participant-existing-1",
            thread_id: "thread-existing-shop",
            profile_id: "profile-owner",
            thread_role: "owner",
            created_at: "2026-06-04T12:00:00.000Z",
            last_read_at: null
          },
          {
            id: "participant-existing-2",
            thread_id: "thread-existing-shop",
            profile_id: options.actor === "owner" ? "profile-client" : "profile-barber",
            thread_role: options.actor === "owner" ? "client_user" : "barber_user",
            created_at: "2026-06-04T12:00:00.000Z",
            last_read_at: null
          }
        ]
      : [] as Row[],
    messages: [] as Row[],
    inserts: {
      message_threads: 0,
      thread_participants: 0,
      messages: 0
    }
  };
  const actorProfile = options.actor === "owner" ? ownerProfile : options.actor === "barber" ? barberProfile : clientProfile;

  class QueryBuilder {
    private filters = new Map<string, unknown>();
    private inFilter: { column: string; values: unknown[] } | null = null;
    private insertPayload: Row | Row[] | null = null;

    constructor(private readonly table: string) {}

    select() {
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.set(column, value);
      return this;
    }

    or() {
      return this;
    }

    in(column: string, values: unknown[]) {
      this.inFilter = { column, values };
      return this;
    }

    order() {
      return this;
    }

    limit() {
      return this;
    }

    insert(payload: Row | Row[]) {
      this.insertPayload = payload;
      return this;
    }

    update() {
      return this;
    }

    maybeSingle() {
      return this.resolve(true);
    }

    single() {
      return this.resolve(true);
    }

    then(resolve: (value: unknown) => void, reject: (reason?: unknown) => void) {
      return this.resolve(false).then(resolve, reject);
    }

    private async resolve(single: boolean) {
      if (this.insertPayload) {
        return this.resolveInsert(single);
      }

      if (
        options.readbackMembershipError
        && this.table === "thread_participants"
        && this.filters.has("thread_id")
        && this.filters.has("profile_id")
      ) {
        return {
          data: null,
          error: {
            code: "PGRST301",
            message: "readback blocked",
            details: "participant row was not readable"
          }
        };
      }

      if (this.table === "appointments" && options.appointmentsError) {
        return {
          data: null,
          error: {
            code: "PGRST999",
            message: "appointments preload unavailable"
          }
        };
      }

      const rows = this.selectRows();
      return {
        data: single ? rows[0] ?? null : rows,
        error: null
      };
    }

    private async resolveInsert(single: boolean) {
      if (this.table === "message_threads") {
        state.inserts.message_threads += 1;
        const row = {
          id: `thread-created-${state.inserts.message_threads}`,
          appointment_id: null,
          created_at: "2026-06-04T12:10:00.000Z",
          ...this.insertPayload
        };
        state.message_threads.push(row);
        return { data: single ? { id: row.id } : [row], error: null };
      }

      if (this.table === "thread_participants") {
        state.inserts.thread_participants += 1;
        const payload = Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload];
        for (const row of payload) {
          state.thread_participants.push({
            id: `participant-created-${state.thread_participants.length + 1}`,
            created_at: "2026-06-04T12:10:00.000Z",
            last_read_at: null,
            ...row
          });
        }
        return { data: null, error: null };
      }

      if (this.table === "messages") {
        state.inserts.messages += 1;
        state.messages.push({
          id: `message-created-${state.messages.length + 1}`,
          created_at: "2026-06-04T12:10:00.000Z",
          ...this.insertPayload
        });
        return { data: null, error: null };
      }

      return { data: null, error: null };
    }

    private selectRows() {
      if (this.table === "profiles") {
        if (this.filters.has("email")) {
          return [actorProfile];
        }
        if (this.filters.has("id")) {
          return [clientProfile, barberProfile, ownerProfile].filter((profile) => profile.id === this.filters.get("id"));
        }
        if (this.inFilter?.column === "id") {
          return [clientProfile, barberProfile, ownerProfile].filter((profile) => this.inFilter?.values.includes(profile.id));
        }
        return [];
      }

      if (this.table === "clients") {
        if (this.filters.get("profile_id") === "profile-client") {
          return [{ id: "client-1", profile_id: "profile-client" }];
        }
        return [];
      }

      if (this.table === "barbers") {
        if (this.filters.get("profile_id") === "profile-barber") {
          return [{ id: "barber-1", profile_id: "profile-barber", reference_code: "barber-1", booking_slug: "phillipforsure" }];
        }
        if (this.inFilter?.column === "profile_id" && this.inFilter.values.includes("profile-barber")) {
          return [{ id: "barber-1", profile_id: "profile-barber", reference_code: "barber-1", booking_slug: "phillipforsure" }];
        }
        return [];
      }

      if (this.table === "barber_profiles") {
        return [];
      }

      if (this.table === "locations") {
        return [];
      }

      if (this.table === "shops") {
        if (this.filters.get("owner_profile_id") === "profile-owner") {
          return options.noOwnedShop ? [] : [{ id: shopRow.id }];
        }
        if (this.inFilter?.values.includes(shopRow.id) || this.inFilter?.values.includes(shopRow.public_username)) {
          return [shopRow];
        }
        return [];
      }

      if (this.table === "staff_locations") {
        return [];
      }

      if (this.table === "message_threads") {
        return state.message_threads.filter((thread) => {
          if (this.inFilter?.column === "id" && !this.inFilter.values.includes(thread.id)) {
            return false;
          }
          for (const [column, value] of this.filters) {
            if (thread[column] !== value) {
              return false;
            }
          }
          return true;
        });
      }

      if (this.table === "thread_participants") {
        return state.thread_participants.filter((participant) => {
          if (this.inFilter?.column === "thread_id" && !this.inFilter.values.includes(participant.thread_id)) {
            return false;
          }
          for (const [column, value] of this.filters) {
            if (participant[column] !== value) {
              return false;
            }
          }
          return true;
        });
      }

      if (this.table === "messages") {
        return state.messages.filter((message) => {
          if (this.inFilter?.column === "thread_id" && !this.inFilter.values.includes(message.thread_id)) {
            return false;
          }
          for (const [column, value] of this.filters) {
            if (message[column] !== value) {
              return false;
            }
          }
          return true;
        });
      }

      if (this.table === "appointments") {
        if (options.appointmentsError) {
          return [];
        }
        return [];
      }

      return [];
    }
  }

  return {
    state,
    client: {
      from: vi.fn((table: string) => new QueryBuilder(table))
    }
  };
}

describe("messaging create or open conversation", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
  });

  it("creates and opens a first-time barber to shop public username conversation", async () => {
    const supabase = createMessagingSupabaseMock({ actor: "barber" });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const payload = await createMessagingThread({
      role: "barber_user",
      email: "barber@bvrb3r.test",
      locationIds: []
    } as never, {
      threadType: "barber_shop",
      profileId: "profile-owner",
      locationId: "shop-the-bvrb3r-shop"
    });

    expect(payload.thread).toBeTruthy();
    expect(payload.thread?.id).toBe("thread-created-1");
    expect(payload.thread?.threadType).toBe("barber_shop");
    expect(payload.thread?.locationId).toBeNull();
    expect(supabase.state.inserts.message_threads).toBe(1);
    expect(supabase.state.thread_participants).toEqual(expect.arrayContaining([
      expect.objectContaining({ thread_id: "thread-created-1", profile_id: "profile-owner", thread_role: "owner" }),
      expect.objectContaining({ thread_id: "thread-created-1", profile_id: "profile-barber", thread_role: "commission_barber" })
    ]));
    expect(supabase.state.messages).toHaveLength(1);
  });

  it("creates and opens a first-time shop to client public username conversation", async () => {
    const supabase = createMessagingSupabaseMock({ actor: "owner" });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const payload = await createMessagingThread({
      role: "owner",
      email: "owner@bvrb3r.test",
      locationIds: ["shop-the-bvrb3r-shop"]
    } as never, {
      threadType: "client_shop",
      profileId: "profile-client",
      locationId: "shop-the-bvrb3r-shop"
    });

    expect(payload.thread).toBeTruthy();
    expect(payload.thread?.id).toBe("thread-created-1");
    expect(payload.thread?.threadType).toBe("client_shop");
    expect(payload.thread?.locationId).toBeNull();
    expect(supabase.state.thread_participants).toEqual(expect.arrayContaining([
      expect.objectContaining({ thread_id: "thread-created-1", profile_id: "profile-owner", thread_role: "owner" }),
      expect.objectContaining({ thread_id: "thread-created-1", profile_id: "profile-client", thread_role: "client" })
    ]));
  });

  it("opens an existing shop thread instead of creating a duplicate", async () => {
    const supabase = createMessagingSupabaseMock({ actor: "barber", existingShopThread: true });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const payload = await createMessagingThread({
      role: "barber_user",
      email: "barber@bvrb3r.test",
      locationIds: []
    } as never, {
      threadType: "barber_shop",
      profileId: "profile-owner",
      locationId: "shop-the-bvrb3r-shop"
    });

    expect(payload.thread).toBeTruthy();
    expect(payload.thread?.id).toBe("thread-existing-shop");
    expect(supabase.state.inserts.message_threads).toBe(0);
  });

  it("labels created thread readback failures with the thread_readback step", async () => {
    const supabase = createMessagingSupabaseMock({ actor: "owner", readbackMembershipError: true });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(createMessagingThread({
      role: "owner",
      email: "owner@bvrb3r.test",
      locationIds: ["shop-the-bvrb3r-shop"]
    } as never, {
      threadType: "client_shop",
      profileId: "profile-client",
      locationId: "shop-the-bvrb3r-shop"
    })).rejects.toMatchObject({
      code: "thread_readback_failed",
      step: "thread_readback",
      diagnostics: expect.objectContaining({
        failedStep: "thread_readback",
        threadInserted: true,
        participantsInserted: true,
        systemMessageInserted: true,
        returnedThreadId: "thread-created-1",
        supabaseCode: "messaging_error",
        supabaseMessage: "Unable to verify thread access."
      })
    });
  });

  it("loads shop owner Messages with an owned shop and no legacy staff contacts", async () => {
    const supabase = createMessagingSupabaseMock({ actor: "owner" });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const payload = await getMessagingInboxPayload({
      role: "owner",
      email: "owner@bvrb3r.test",
      name: "Private Owner",
      locationIds: []
    } as never);

    expect(payload.available).toBe(true);
    expect(payload.threads).toEqual([]);
    expect(payload.eligibleContacts).toEqual([]);
    expect(payload.broadcastTargets).toEqual([]);
  });

  it("does not block shop owner Messages when optional shop contact preload fails", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const supabase = createMessagingSupabaseMock({ actor: "owner", appointmentsError: true });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const payload = await getMessagingInboxPayload({
      role: "owner",
      email: "owner@bvrb3r.test",
      name: "Private Owner",
      locationIds: []
    } as never);

    expect(payload.available).toBe(true);
    expect(payload.eligibleContacts).toEqual([]);
    expect(consoleWarn).toHaveBeenCalledWith("[messages] shop_contacts_preload_failed", expect.objectContaining({
      profileId: "profile-owner",
      role: "owner",
      shopIds: ["shop-the-bvrb3r-shop"],
      queryName: "appointments_by_shop_location",
      postgresCode: "PGRST999",
      postgresMessage: "appointments preload unavailable"
    }));
    consoleWarn.mockRestore();
  });
});

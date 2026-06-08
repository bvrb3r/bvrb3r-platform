import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClientMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

import { createMessagingThread, getMessagingInboxPayload, getMessagingThreadPayload } from "@/lib/messages/service";

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

const productionShopReference = "shop-the-bvrb3r-shop-universi-a02c68";
const productionLocationRow = {
  id: "11111111-2222-4333-8444-555555555555",
  reference_code: productionShopReference,
  name: "The BVRB3R Shop (University Mall)",
  neighborhood: "2172 University Square Mall",
  city: "Tampa",
  state: "FL"
};

function createMessagingSupabaseMock(options: {
  actor: "client" | "barber" | "owner";
  existingShopThread?: boolean;
  existingShopThreadType?: "client_shop" | "barber_shop";
  existingClientBarberThread?: boolean;
  latestClientBarberAppointment?: boolean;
  appointmentsError?: boolean;
  noOwnedShop?: boolean;
  readbackMembershipError?: boolean;
}) {
  const state = {
    message_threads: [
      ...(options.existingShopThread
        ? [{
          id: "thread-existing-shop",
          thread_type: options.existingShopThreadType ?? (options.actor === "owner" || options.actor === "client" ? "client_shop" : "barber_shop"),
          appointment_id: null,
          location_id: null,
          created_at: "2026-06-04T12:00:00.000Z",
          updated_at: "2026-06-04T12:00:00.000Z",
          created_by_profile_id: "profile-owner"
        }]
        : []),
      ...(options.existingClientBarberThread
        ? [{
          id: "thread-client-barber",
          thread_type: "client_barber",
          appointment_id: "appointment-old-cancelled",
          location_id: "location-1",
          created_at: "2026-05-19T12:00:00.000Z",
          updated_at: "2026-06-08T20:30:00.000Z",
          created_by_profile_id: "profile-client"
        }]
        : [])
    ] as Row[],
    thread_participants: [
      ...(options.existingShopThread
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
            profile_id: options.actor === "owner" ? "profile-client" : options.actor === "client" ? "profile-client" : "profile-barber",
            thread_role: options.actor === "owner" || options.actor === "client" ? "client_user" : "barber_user",
            created_at: "2026-06-04T12:00:00.000Z",
            last_read_at: null
          }
        ]
        : []),
      ...(options.existingClientBarberThread
        ? [
          {
            id: "participant-client-barber-1",
            thread_id: "thread-client-barber",
            profile_id: "profile-client",
            thread_role: "client_user",
            created_at: "2026-05-19T12:00:00.000Z",
            last_read_at: null
          },
          {
            id: "participant-client-barber-2",
            thread_id: "thread-client-barber",
            profile_id: "profile-barber",
            thread_role: "barber_user",
            created_at: "2026-05-19T12:00:00.000Z",
            last_read_at: null
          }
        ]
        : [])
    ] as Row[],
    messages: options.existingClientBarberThread
      ? [{
          id: "message-latest-hair-cut",
          thread_id: "thread-client-barber",
          sender_profile_id: null,
          body: "Conversation opened for Hair Cut on Jun 8, 4:30 PM.",
          message_type: "system",
          metadata: null,
          created_at: "2026-06-08T20:30:00.000Z"
        }]
      : [] as Row[],
    message_thread_requests: [] as Row[],
    message_user_blocks: [] as Row[],
    message_reports: [] as Row[],
    inserts: {
      message_threads: 0,
      thread_participants: 0,
      messages: 0,
      message_thread_requests: 0,
      message_user_blocks: 0,
      message_reports: 0
    },
    inFilters: [] as Array<{ table: string; column: string; values: unknown[] }>
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
      state.inFilters.push({ table: this.table, column, values });
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

      if (this.table === "message_thread_requests") {
        state.inserts.message_thread_requests += 1;
        const row = {
          id: `request-created-${state.inserts.message_thread_requests}`,
          created_at: "2026-06-04T12:10:00.000Z",
          updated_at: "2026-06-04T12:10:00.000Z",
          accepted_at: null,
          accepted_by_profile_id: null,
          declined_at: null,
          declined_by_profile_id: null,
          blocked_at: null,
          blocked_by_profile_id: null,
          reported_at: null,
          reported_by_profile_id: null,
          report_reason: null,
          first_message_id: null,
          ...this.insertPayload
        };
        state.message_thread_requests.push(row);
        return { data: single ? row : [row], error: null };
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
        if (this.inFilter?.column === "profile_id" && this.inFilter.values.includes("profile-client")) {
          return [{ id: "client-1", profile_id: "profile-client" }];
        }
        if (this.inFilter?.column === "id" && this.inFilter.values.includes("client-1")) {
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
        if (this.inFilter?.column === "id" && this.inFilter.values.includes("barber-1")) {
          return [{ id: "barber-1", profile_id: "profile-barber", reference_code: "barber-1", booking_slug: "phillipforsure" }];
        }
        return [];
      }

      if (this.table === "barber_profiles") {
        return [];
      }

      if (this.table === "locations") {
        if (this.inFilter?.column === "id" && (this.inFilter.values.includes("location-1") || this.inFilter.values.includes(productionLocationRow.id))) {
          return [{ ...productionLocationRow, id: this.inFilter.values.includes("location-1") ? "location-1" : productionLocationRow.id }];
        }
        if (this.inFilter?.column === "reference_code" && this.inFilter.values.includes(productionShopReference)) {
          return [productionLocationRow];
        }
        return [];
      }

      if (this.table === "services") {
        if (this.inFilter?.column === "id") {
          return [
            { id: "service-old", name: "test cut" },
            { id: "service-hair-cut", name: "Hair Cut" }
          ].filter((service) => this.inFilter?.values.includes(service.id));
        }
        return [];
      }

      if (this.table === "shops") {
        if (this.filters.get("owner_profile_id") === "profile-owner") {
          return options.noOwnedShop ? [] : [{ id: shopRow.id }];
        }
        if (this.inFilter?.column === "owner_profile_id" && this.inFilter.values.includes("profile-owner")) {
          return [shopRow];
        }
        if (this.inFilter?.values.includes(shopRow.id) || this.inFilter?.values.includes(shopRow.public_username)) {
          return [shopRow];
        }
        return [];
      }

      if (this.table === "staff_locations") {
        if (this.inFilter?.column === "location_id" && this.inFilter.values.includes(productionLocationRow.id)) {
          return [{ location_id: productionLocationRow.id, profile_id: "profile-owner" }];
        }
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

      if (this.table === "message_thread_requests") {
        return state.message_thread_requests.filter((request) => {
          for (const [column, value] of this.filters) {
            if (request[column] !== value) {
              return false;
            }
          }
          return true;
        });
      }

      if (this.table === "message_user_blocks" || this.table === "message_reports") {
        return [];
      }

      if (this.table === "appointments") {
        if (options.appointmentsError) {
          return [];
        }
        const appointments = [
          {
            id: "appointment-old-cancelled",
            reference_code: "old-cancelled",
            confirmation_code: "OLD1",
            status: "cancelled",
            starts_at: "2026-05-19T13:30:00.000Z",
            created_at: "2026-05-18T12:00:00.000Z",
            updated_at: "2026-05-19T13:45:00.000Z",
            client_id: "client-1",
            barber_id: "barber-1",
            service_id: "service-old",
            location_id: "location-1"
          },
          ...(options.latestClientBarberAppointment
            ? [{
              id: "appointment-hair-cut-completed",
              reference_code: "hair-cut-completed",
              confirmation_code: "NEW1",
              status: "completed",
              starts_at: "2026-06-08T16:30:00.000Z",
              created_at: "2026-06-08T16:00:00.000Z",
              updated_at: "2026-06-08T17:00:00.000Z",
              client_id: "client-1",
              barber_id: "barber-1",
              service_id: "service-hair-cut",
              location_id: "location-1"
            }]
            : [])
        ];
        if (this.inFilter?.column === "id") {
          return appointments.filter((appointment) => this.inFilter?.values.includes(appointment.id));
        }
        if (this.inFilter?.column === "client_id") {
          return appointments.filter((appointment) => this.inFilter?.values.includes(appointment.client_id));
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
    expect(supabase.state.message_thread_requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        thread_id: "thread-created-1",
        requested_by_profile_id: "profile-barber",
        requested_to_profile_id: "profile-owner",
        request_status: "pending"
      })
    ]));
  });

  it("creates a barber to shop conversation with null location when no shop location is supplied", async () => {
    const supabase = createMessagingSupabaseMock({ actor: "barber" });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const payload = await createMessagingThread({
      role: "barber_user",
      email: "barber@bvrb3r.test",
      locationIds: []
    } as never, {
      threadType: "barber_shop",
      profileId: "profile-owner"
    });

    expect(payload.thread?.id).toBe("thread-created-1");
    expect(payload.thread?.locationId).toBeNull();
    expect(supabase.state.message_threads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "thread-created-1",
        location_id: null
      })
    ]));
    expect(supabase.state.thread_participants).toEqual(expect.arrayContaining([
      expect.objectContaining({ thread_id: "thread-created-1", profile_id: "profile-owner", thread_role: "owner" }),
      expect.objectContaining({ thread_id: "thread-created-1", profile_id: "profile-barber", thread_role: "commission_barber" })
    ]));
    expect(supabase.state.message_thread_requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        thread_id: "thread-created-1",
        requested_by_profile_id: "profile-barber",
        requested_to_profile_id: "profile-owner",
        request_status: "pending"
      })
    ]));
  });

  it("normalizes a public shop reference before UUID-backed message creation queries", async () => {
    const supabase = createMessagingSupabaseMock({ actor: "barber" });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const payload = await createMessagingThread({
      role: "barber_user",
      email: "barber@bvrb3r.test",
      locationIds: []
    } as never, {
      threadType: "barber_shop",
      profileId: "profile-owner",
      locationId: productionShopReference
    });

    expect(payload.thread?.id).toBe("thread-created-1");
    expect(payload.thread?.locationId).toBe(productionLocationRow.id);
    expect(supabase.state.message_threads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "thread-created-1",
        location_id: productionLocationRow.id
      })
    ]));
    expect(supabase.state.inFilters).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "shops",
        column: "id",
        values: expect.arrayContaining([productionShopReference])
      }),
      expect.objectContaining({
        table: "staff_locations",
        column: "location_id",
        values: expect.arrayContaining([productionShopReference])
      })
    ]));
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
    expect(supabase.state.message_thread_requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        thread_id: "thread-created-1",
        requested_by_profile_id: "profile-owner",
        requested_to_profile_id: "profile-client",
        request_status: "pending"
      })
    ]));
  });

  it("creates a shop owner to client conversation with null location when no shop location is supplied", async () => {
    const supabase = createMessagingSupabaseMock({ actor: "owner" });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const payload = await createMessagingThread({
      role: "owner",
      email: "owner@bvrb3r.test",
      locationIds: []
    } as never, {
      threadType: "client_shop",
      profileId: "profile-client"
    });

    expect(payload.thread?.id).toBe("thread-created-1");
    expect(payload.thread?.threadType).toBe("client_shop");
    expect(payload.thread?.locationId).toBeNull();
    expect(supabase.state.message_threads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "thread-created-1",
        location_id: null
      })
    ]));
    expect(supabase.state.thread_participants).toEqual(expect.arrayContaining([
      expect.objectContaining({ thread_id: "thread-created-1", profile_id: "profile-owner", thread_role: "owner" }),
      expect.objectContaining({ thread_id: "thread-created-1", profile_id: "profile-client", thread_role: "client" })
    ]));
    expect(supabase.state.message_thread_requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        thread_id: "thread-created-1",
        requested_by_profile_id: "profile-owner",
        requested_to_profile_id: "profile-client",
        request_status: "pending"
      })
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
    expect(supabase.state.inserts.message_thread_requests).toBe(0);
  });

  it("hydrates null-location shop threads from public shop identity", async () => {
    const supabase = createMessagingSupabaseMock({ actor: "client", existingShopThread: true, existingShopThreadType: "client_shop" });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const payload = await getMessagingInboxPayload({
      role: "client_user",
      email: "client@bvrb3r.test",
      locationIds: []
    } as never);

    expect(payload.threads).toHaveLength(1);
    expect(payload.threads[0]?.counterpart).toEqual(expect.objectContaining({
      publicUsername: "thebvrb3rshopuniversitymall",
      fullName: "@thebvrb3rshopuniversitymall",
      avatarUrl: "https://cdn.bvrb3r.test/shop-logo.jpg",
      publicProfileHref: "/shop/thebvrb3rshopuniversitymall"
    }));
  });

  it("hydrates inbox threads with the latest canonical client-barber appointment instead of stale thread metadata", async () => {
    const supabase = createMessagingSupabaseMock({
      actor: "barber",
      existingClientBarberThread: true,
      latestClientBarberAppointment: true
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const payload = await getMessagingInboxPayload({
      role: "barber_user",
      email: "barber@bvrb3r.test",
      locationIds: []
    } as never);

    expect(payload.threads).toHaveLength(1);
    expect(payload.threads[0]?.lastMessage?.body).toBe("Conversation opened for Hair Cut on Jun 8, 4:30 PM.");
    expect(payload.threads[0]?.appointmentContext).toEqual(expect.objectContaining({
      appointmentId: "appointment-hair-cut-completed",
      serviceName: "Hair Cut",
      status: "completed",
      statusLabel: "Completed",
      startsAt: "2026-06-08T16:30:00.000Z"
    }));
    expect(payload.threads[0]?.appointmentContext).not.toEqual(expect.objectContaining({
      appointmentId: "appointment-old-cancelled",
      statusLabel: "Cancelled"
    }));
  });

  it("hydrates opened threads with latest appointment context before older related appointment history", async () => {
    const supabase = createMessagingSupabaseMock({
      actor: "barber",
      existingClientBarberThread: true,
      latestClientBarberAppointment: true
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const payload = await getMessagingThreadPayload({
      role: "barber_user",
      email: "barber@bvrb3r.test",
      locationIds: []
    } as never, "thread-client-barber");

    expect(payload.thread?.appointmentContext).toEqual(expect.objectContaining({
      appointmentId: "appointment-hair-cut-completed",
      serviceName: "Hair Cut",
      statusLabel: "Completed"
    }));
    expect(payload.relatedAppointmentContexts?.[0]).toEqual(expect.objectContaining({
      appointmentId: "appointment-hair-cut-completed",
      serviceName: "Hair Cut",
      statusLabel: "Completed"
    }));
    expect(payload.relatedAppointmentContexts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        appointmentId: "appointment-old-cancelled",
        serviceName: "test cut",
        statusLabel: "Cancelled"
      })
    ]));
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

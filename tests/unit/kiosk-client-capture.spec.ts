const { createSupabaseAdminClientMock, isSupabaseEnabledMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  isSupabaseEnabledMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: isSupabaseEnabledMock
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveOrCreateKioskClient, searchKioskClientProfiles } from "@/lib/kiosk/client-capture";

function createSearchSupabaseMock() {
  const selectMock = vi.fn();
  const insertMock = vi.fn();
  const profilesChain = {
    select: selectMock.mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: [{
        id: "profile-client",
        full_name: "Phillip McGee",
        public_username: "phillipmcgee",
        profile_photo_path: null,
        profile_photo_url: null,
        public_city: "Tampa",
        public_state: "FL"
      }],
      error: null
    }),
    insert: insertMock
  };

  return {
    from: vi.fn((table: string) => {
      if (table !== "profiles") {
        throw new Error(`Unexpected table ${table}`);
      }

      return profilesChain;
    }),
    selectMock,
    insertMock
  };
}

function createSelectedProfileSupabaseMock() {
  const profilesSelectMock = vi.fn();
  const clientsInsertMock = vi.fn();
  const profilesChain = {
    select: profilesSelectMock.mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: "profile-client",
        full_name: "Phillip McGee",
        email: "phillipmcgeeclient@outlook.com",
        phone: "+18136250040",
        public_username: "phillipmcgee"
      },
      error: null
    })
  };
  const clientsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: "client-row",
        profile_id: "profile-client",
        reference_code: "client-reference"
      },
      error: null
    }),
    insert: clientsInsertMock
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return profilesChain;
      }

      if (table === "clients") {
        return clientsChain;
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    profilesSelectMock,
    clientsInsertMock
  };
}

describe("kiosk client capture", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    isSupabaseEnabledMock.mockReset();
    isSupabaseEnabledMock.mockReturnValue(true);
  });

  it("returns public-safe username search results without selecting private contact fields", async () => {
    const supabase = createSearchSupabaseMock();
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const results = await searchKioskClientProfiles("@phillip");

    expect(supabase.selectMock).toHaveBeenCalledWith("id, full_name, public_username, profile_photo_path, profile_photo_url, public_city, public_state");
    expect(results).toEqual([expect.objectContaining({
      profileId: "profile-client",
      displayName: "Phillip McGee",
      publicUsername: "phillipmcgee",
      locationLabel: "Tampa, FL",
      roleLabel: "CLIENT"
    })]);
    expect(JSON.stringify(results)).not.toContain("phone");
    expect(JSON.stringify(results)).not.toContain("email");
  });

  it("resolves selected profile contact server-side without creating a duplicate client profile", async () => {
    const supabase = createSelectedProfileSupabaseMock();
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const client = await resolveOrCreateKioskClient({
      selectedProfileId: "profile-client",
      publicUsername: "@phillipmcgee",
      source: "barber_kiosk"
    });

    expect(supabase.profilesSelectMock).toHaveBeenCalledWith("id, full_name, email, phone, public_username");
    expect(client).toEqual(expect.objectContaining({
      profileId: "profile-client",
      clientId: "client-row",
      clientReference: "client-reference",
      fullName: "Phillip McGee",
      phone: "+18136250040",
      email: "phillipmcgeeclient@outlook.com",
      publicUsername: "phillipmcgee",
      created: false,
      activationInviteQueued: false
    }));
    expect(supabase.clientsInsertMock).not.toHaveBeenCalled();
  });
});

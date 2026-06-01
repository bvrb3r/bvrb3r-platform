import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveSignedInProfile, CurrentProfileResolverError } from "@/lib/profile/current-profile";
import type { UserAccount } from "@/types/domain";

const { createSupabaseAdminClientMock, createSupabaseServerClientMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock
}));

const user: UserAccount = {
  id: "legacy-profile-id",
  role: "barber_user",
  email: "barber@example.com",
  password: "",
  name: "Barber",
  title: "Barber",
  locationIds: [],
  barberId: "barber-auth"
};

function makeSupabase(results: Array<{ data: unknown; error: null } | { data: null; error: { message: string } }>) {
  const maybeSingle = vi.fn(() => Promise.resolve(results.shift() ?? { data: null, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eq, maybeSingle };
}

describe("resolveSignedInProfile", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    createSupabaseServerClientMock.mockReset();
  });

  it("resolves by profiles.id matching the authenticated user first", async () => {
    const supabase = makeSupabase([
      { data: { id: "auth-user-id", email: "barber@example.com", role: "barber_user" }, error: null }
    ]);
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "auth-user-id", email: "barber@example.com" } } })
      }
    });

    const result = await resolveSignedInProfile({
      user,
      supabase: supabase as never,
      select: "id, email, role"
    });

    expect(result.profileId).toBe("auth-user-id");
    expect(supabase.eq).toHaveBeenNthCalledWith(1, "id", "auth-user-id");
  });

  it("falls back by email for legacy profile records", async () => {
    const supabase = makeSupabase([
      { data: null, error: null },
      { data: null, error: null },
      { data: { id: "legacy-email-profile", email: "barber@example.com", role: "barber_user" }, error: null }
    ]);
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "auth-user-id", email: "barber@example.com" } } })
      }
    });

    const result = await resolveSignedInProfile({
      user,
      supabase: supabase as never,
      select: "id, email, role"
    });

    expect(result.profileId).toBe("legacy-email-profile");
    expect(supabase.eq).toHaveBeenLastCalledWith("email", "barber@example.com");
  });

  it("returns a structured resolver error when no profile can be found", async () => {
    const supabase = makeSupabase([
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null }
    ]);
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } })
      }
    });

    await expect(resolveSignedInProfile({
      user,
      supabase: supabase as never,
      select: "id, email, role"
    })).rejects.toMatchObject({
      name: "CurrentProfileResolverError",
      code: "profile_not_found",
      status: 404
    } satisfies Partial<CurrentProfileResolverError>);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClientMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

import { POST } from "@/app/api/auth/forgot-password/route";
import {
  PASSWORD_RESET_GENERIC_FAILURE,
  PASSWORD_RESET_GENERIC_SUCCESS,
  PASSWORD_RESET_REDIRECT_TO
} from "@/lib/auth/password-recovery";

type FakeRows = Record<string, Array<Record<string, unknown>>>;

class FakeQueryBuilder {
  private filters: Array<{ column: string; value: unknown }> = [];

  constructor(private readonly rows: Array<Record<string, unknown>>) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  limit() {
    return this;
  }

  maybeSingle() {
    const row = this.rows.find((candidate) =>
      this.filters.every((filter) => candidate[filter.column] === filter.value)
    ) ?? null;

    return Promise.resolve({
      data: row,
      error: null
    });
  }
}

function createSupabaseMock(rows: FakeRows) {
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
  return {
    resetPasswordForEmail,
    client: {
      auth: {
        resetPasswordForEmail
      },
      from(table: string) {
        return new FakeQueryBuilder(rows[table] ?? []);
      }
    }
  };
}

async function readJson(response: Response) {
  return await response.json() as { ok: boolean; message: string };
}

describe("forgot password route", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
  });

  it("sends reset instructions for a known canonical email using the production reset URL", async () => {
    const supabase = createSupabaseMock({
      profiles: [
        { id: "founder-profile", email: "bvrb3r@icloud.com" }
      ]
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const response = await POST(new Request("https://bvrb3r.app/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ identifier: "  bvrb3r@icloud.com " })
    }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ ok: true, message: PASSWORD_RESET_GENERIC_SUCCESS });
    expect(supabase.resetPasswordForEmail).toHaveBeenCalledWith("bvrb3r@icloud.com", {
      redirectTo: PASSWORD_RESET_REDIRECT_TO
    });
  });

  it("resolves a known phone number to the canonical profile email", async () => {
    const supabase = createSupabaseMock({
      profiles: [
        { id: "barber-profile", email: "phillipmcgee813@gmail.com", phone: "+18135550100" }
      ]
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const response = await POST(new Request("https://bvrb3r.app/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ identifier: "(813) 555-0100" })
    }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ ok: true, message: PASSWORD_RESET_GENERIC_SUCCESS });
    expect(supabase.resetPasswordForEmail).toHaveBeenCalledWith("phillipmcgee813@gmail.com", {
      redirectTo: PASSWORD_RESET_REDIRECT_TO
    });
  });

  it("resolves a known username through barber profiles", async () => {
    const supabase = createSupabaseMock({
      barber_profiles: [
        { username: "phillip", barber_email: "phillipmcgee813@gmail.com", barber_reference: "barber-phillip" }
      ]
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const response = await POST(new Request("https://bvrb3r.app/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ identifier: "@Phillip" })
    }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ ok: true, message: PASSWORD_RESET_GENERIC_SUCCESS });
    expect(supabase.resetPasswordForEmail).toHaveBeenCalledWith("phillipmcgee813@gmail.com", {
      redirectTo: PASSWORD_RESET_REDIRECT_TO
    });
  });

  it("returns identical generic success for unknown and malformed identifiers", async () => {
    const supabase = createSupabaseMock({});
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const unknownResponse = await POST(new Request("https://bvrb3r.app/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ identifier: "unknown-account" })
    }));
    const malformedResponse = await POST(new Request("https://bvrb3r.app/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ identifier: " @ " })
    }));

    expect(unknownResponse.status).toBe(200);
    expect(malformedResponse.status).toBe(200);
    expect(await readJson(unknownResponse)).toEqual({ ok: true, message: PASSWORD_RESET_GENERIC_SUCCESS });
    expect(await readJson(malformedResponse)).toEqual({ ok: true, message: PASSWORD_RESET_GENERIC_SUCCESS });
    expect(supabase.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("masks handled Supabase auth misses without leaking account existence", async () => {
    const supabase = createSupabaseMock({});
    supabase.resetPasswordForEmail.mockResolvedValueOnce({
      error: { status: 400, message: "User not found" }
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const response = await POST(new Request("https://bvrb3r.app/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ identifier: "missing@bvrb3r.app" })
    }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ ok: true, message: PASSWORD_RESET_GENERIC_SUCCESS });
  });

  it("returns the generic failure only for true server-side reset failures", async () => {
    const supabase = createSupabaseMock({});
    supabase.resetPasswordForEmail.mockResolvedValueOnce({
      error: { status: 503, message: "Auth service unavailable" }
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const response = await POST(new Request("https://bvrb3r.app/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ identifier: "bvrb3r@icloud.com" })
    }));

    expect(response.status).toBe(500);
    expect(await readJson(response)).toEqual({ ok: false, message: PASSWORD_RESET_GENERIC_FAILURE });
  });

  it("fails closed when the server reset client is not configured", async () => {
    createSupabaseAdminClientMock.mockReturnValue(null);

    const response = await POST(new Request("https://bvrb3r.app/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ identifier: "bvrb3r@icloud.com" })
    }));

    expect(response.status).toBe(500);
    expect(await readJson(response)).toEqual({ ok: false, message: PASSWORD_RESET_GENERIC_FAILURE });
  });
});

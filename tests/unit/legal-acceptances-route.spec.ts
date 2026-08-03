import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

const { getSessionUserMock, createSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

import { POST } from "@/app/api/legal/acceptances/route";

function legalAcceptanceRequest(documentKey: string = "terms", documentVersion: string = LEGAL_DOCUMENTS.terms.version) {
  return new Request("https://bvrb3r.app/api/legal/acceptances", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "bvrb3r-legal-test",
      "x-forwarded-for": "198.51.100.22"
    },
    body: JSON.stringify({ documentKey, documentVersion, accepted: true })
  });
}

function createAcceptanceStorage(acceptedAt = "2026-08-03T03:20:00.000Z") {
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      document_key: "terms",
      document_version: LEGAL_DOCUMENTS.terms.version,
      accepted_at: acceptedAt
    },
    error: null
  });
  const query = {
    upsert,
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);

  const from = vi.fn(() => query);
  return { client: { from }, from, upsert, query, maybeSingle };
}

describe("POST /api/legal/acceptances", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
  });

  it("writes the real role column and returns the original persisted acceptance on retries", async () => {
    const storage = createAcceptanceStorage();
    getSessionUserMock.mockResolvedValue({ id: "client-profile", role: "client_user" });
    createSupabaseAdminClientMock.mockReturnValue(storage.client);

    const first = await POST(legalAcceptanceRequest());
    const second = await POST(legalAcceptanceRequest());
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.acceptedAt).toBe("2026-08-03T03:20:00.000Z");
    expect(secondBody.acceptedAt).toBe(firstBody.acceptedAt);
    expect(storage.upsert).toHaveBeenCalledTimes(2);

    for (const [payload, options] of storage.upsert.mock.calls) {
      expect(payload).toMatchObject({
        user_id: "client-profile",
        role: "client",
        document_key: "terms",
        document_version: LEGAL_DOCUMENTS.terms.version,
        ip_address: "198.51.100.22",
        user_agent: "bvrb3r-legal-test"
      });
      expect(payload).not.toHaveProperty("account_role");
      expect(options).toEqual({
        onConflict: "user_id,document_key,document_version",
        ignoreDuplicates: true
      });
    }

    expect(storage.maybeSingle).toHaveBeenCalledTimes(2);
  });

  it("normalizes the canonical shop-owner account role to the database enum", async () => {
    const storage = createAcceptanceStorage();
    getSessionUserMock.mockResolvedValue({ id: "owner-profile", role: "shop_owner_user" });
    createSupabaseAdminClientMock.mockReturnValue(storage.client);

    const response = await POST(legalAcceptanceRequest());

    expect(response.status).toBe(200);
    expect(storage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ role: "shop_owner" }),
      expect.any(Object)
    );
  });

  it("does not invent an acceptance role for delegated shop staff", async () => {
    getSessionUserMock.mockResolvedValue({ id: "manager-profile", role: "manager" });

    const response = await POST(legalAcceptanceRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/account role/i);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects stale versions before writing acceptance evidence", async () => {
    getSessionUserMock.mockResolvedValue({ id: "client-profile", role: "client_user" });

    const response = await POST(legalAcceptanceRequest("terms", "2025-01-01"));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("legal_reacceptance_required");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });
});

describe("legal acceptance convergence migration", () => {
  it("adds the idempotency key without silently deleting audit evidence", () => {
    const migrationsDirectory = join(process.cwd(), "supabase", "migrations");
    const fileName = readdirSync(migrationsDirectory).find((name) =>
      name.endsWith("_converge_legal_acceptance_idempotency.sql")
    );

    expect(fileName).toBeDefined();
    const sql = readFileSync(join(migrationsDirectory, fileName!), "utf8").toLowerCase();

    expect(sql).toContain("having count(*) > 1");
    expect(sql).toContain("create unique index if not exists compliance_acceptances_user_document_version_uidx");
    expect(sql).toContain("(user_id, document_key, document_version)");
    expect(sql).not.toContain("delete from public.compliance_acceptances");
  });
});

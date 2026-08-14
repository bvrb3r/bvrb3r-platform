import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActivationPermissionError,
  createSupabaseMarketplaceActivationProvider
} from "@/lib/marketplace/activation-provider";
import { uploadVerificationDocument } from "@/lib/trust/client";
import {
  createSupabaseTrustProvider
} from "@/lib/trust/provider";
import {
  TrustPermissionError,
  TrustValidationError
} from "@/lib/trust/engine";
import type { VerificationUploadView } from "@/types/activation";

function makeUploadView(): VerificationUploadView {
  return {
    uploadId: "upload-opaque-1",
    ownerType: "barber",
    ownerId: "barber-private-subject",
    category: "license_verification",
    fileName: "license.pdf",
    contentType: "application/pdf",
    fileSizeBytes: 3,
    uploadStatus: "uploaded",
    uploadedByRole: "barber_user",
    uploadedAt: "2026-08-14T12:00:00.000Z",
    signedUploadUrl: "https://storage.example.invalid/object/upload/sign/verification-private/opaque?token=capability"
  };
}

function createActivationSupabase() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const createSignedUploadUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://storage.example.invalid/signed-upload?token=capability" },
    error: null
  });
  const from = vi.fn((table: string) => {
    if (table !== "verification_documents") {
      throw new Error(`Unexpected table: ${table}`);
    }
    return { insert };
  });
  const storageFrom = vi.fn(() => ({ createSignedUploadUrl }));
  return {
    client: { from, storage: { from: storageFrom } } as never,
    insert,
    storageFrom,
    createSignedUploadUrl
  };
}

type StorageMetadata = Record<string, unknown>;

function createTrustSupabase(metadata: StorageMetadata, documentOverrides: Record<string, unknown> = {}) {
  const verificationDocument = {
    id: "upload-owned-1",
    user_id: "user-barber-1",
    owner_type: "barber",
    owner_reference: "barber-1",
    category: "license_verification",
    storage_bucket: "verification-private",
    storage_path: "verification/uploads/opaque-object",
    content_type: "application/pdf",
    file_size_bytes: 2048,
    file_name: "license.pdf",
    uploaded_by_role: "barber_user",
    uploaded_at: "2026-08-14T12:00:00.000Z",
    updated_at: "2026-08-14T12:00:00.000Z",
    ...documentOverrides
  };
  const rowsByTable: Record<string, Record<string, unknown>[]> = {
    verification_documents: [verificationDocument]
  };
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      }),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({
        data: (rowsByTable[table] ?? []).find((row) =>
          Object.entries(filters).every(([column, value]) => row[column] === value)
        ) ?? null,
        error: null
      })),
      order: vi.fn(async () => ({ data: rowsByTable[table] ?? [], error: null })),
      upsert
    };
    return builder;
  });
  const list = vi.fn().mockResolvedValue({
    data: [{ name: "opaque-object", metadata }],
    error: null
  });
  const storageFrom = vi.fn(() => ({ list }));
  return {
    client: { from, storage: { from: storageFrom } } as never,
    from,
    upsert,
    storageFrom,
    list
  };
}

const barberActor = {
  role: "barber_user" as const,
  userId: "user-barber-1",
  barberId: "barber-1"
};

const licenseSubmission = {
  category: "license_verification" as const,
  legalName: "Taylor Barber",
  licenseType: "Master Barber",
  licenseNumber: "LIC-1234",
  issuingState: "FL",
  expirationDate: "2099-12-31",
  uploadId: "upload-owned-1"
};

describe("secure verification uploads", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates a server-signed capability for a randomized PII-free object key", async () => {
    const supabase = createActivationSupabase();
    const provider = createSupabaseMarketplaceActivationProvider(supabase.client);

    const result = await provider.createVerificationUpload(
      { role: "barber_user", userId: "user-private-1", barberId: "barber-private-subject" },
      {
        ownerType: "barber",
        ownerId: "barber-private-subject",
        category: "license_verification",
        fileName: "Taylor-Barber-License.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 2048
      }
    );

    const inserted = supabase.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.storage_path).toMatch(/^verification\/uploads\/[0-9a-f-]{36}$/);
    expect(inserted.storage_path).not.toContain("barber-private-subject");
    expect(inserted.storage_path).not.toContain("Taylor-Barber-License");
    expect(inserted.secure_reference).toMatch(/^secure:\/\/verification\/[0-9a-f-]{36}$/);
    expect(supabase.storageFrom).toHaveBeenCalledWith("verification-private");
    expect(supabase.createSignedUploadUrl).toHaveBeenCalledWith(inserted.storage_path, { upsert: false });
    expect(result.upload.id).toBe(inserted.id);
    expect(result.signedUploadUrl).toContain("token=capability");
  });

  it("rejects a barber trying to create an upload for another barber", async () => {
    const supabase = createActivationSupabase();
    const provider = createSupabaseMarketplaceActivationProvider(supabase.client);

    await expect(provider.createVerificationUpload(
      { role: "barber_user", userId: "user-private-1", barberId: "barber-private-subject" },
      {
        ownerType: "barber",
        ownerId: "another-barber",
        category: "license_verification",
        fileName: "license.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 2048
      }
    )).rejects.toBeInstanceOf(ActivationPermissionError);
    expect(supabase.insert).not.toHaveBeenCalled();
  });

  it("uploads through only the signed capability and returns the opaque upload id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["pdf"], "license.pdf", { type: "application/pdf" });

    await expect(uploadVerificationDocument(makeUploadView(), file)).resolves.toBe("upload-opaque-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("token=capability"),
      expect.objectContaining({
        method: "PUT",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { "x-upsert": "false" }
      })
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeInstanceOf(FormData);
  });

  it("refuses a client-side file that no longer matches the signed upload declaration", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["not-a-pdf"], "license.png", { type: "image/png" });

    await expect(uploadVerificationDocument(makeUploadView(), file)).rejects.toThrow("no longer matches");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts an owned object only when its stored MIME type and byte size match", async () => {
    const supabase = createTrustSupabase({ size: 2048, mimetype: "application/pdf" });
    const provider = createSupabaseTrustProvider(supabase.client);

    await expect(provider.submitBarberVerification(barberActor, licenseSubmission)).resolves.toMatchObject({
      document: { id: "upload-owned-1", storagePath: "verification/uploads/opaque-object" }
    });
    expect(supabase.storageFrom).toHaveBeenCalledWith("verification-private");
    expect(supabase.list).toHaveBeenCalledWith("verification/uploads", {
      limit: 10,
      search: "opaque-object"
    });
  });

  it.each([
    [{ size: 2049, mimetype: "application/pdf" }, "wrong stored byte size"],
    [{ size: 2048, mimetype: "image/png" }, "wrong stored MIME type"],
    [{}, "missing storage metadata"]
  ])("fails closed for $2", async (metadata, description) => {
    expect(description).toBeTypeOf("string");
    const supabase = createTrustSupabase(metadata);
    const provider = createSupabaseTrustProvider(supabase.client);

    await expect(provider.submitBarberVerification(barberActor, licenseSubmission))
      .rejects.toBeInstanceOf(TrustValidationError);
    expect(supabase.upsert).not.toHaveBeenCalled();
  });

  it("fails closed when the upload row belongs to another account", async () => {
    const supabase = createTrustSupabase(
      { size: 2048, mimetype: "application/pdf" },
      { user_id: "different-user" }
    );
    const provider = createSupabaseTrustProvider(supabase.client);

    await expect(provider.submitBarberVerification(barberActor, licenseSubmission))
      .rejects.toBeInstanceOf(TrustPermissionError);
    expect(supabase.list).not.toHaveBeenCalled();
    expect(supabase.upsert).not.toHaveBeenCalled();
  });
});

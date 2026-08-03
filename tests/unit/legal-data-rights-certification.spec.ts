import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS, REQUIRED_ACCOUNT_AGREEMENTS, currentLegalVersions } from "@/lib/legal/documents";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Mission 6 legal and data-rights certification", () => {
  it("uses explicit current versions for every published legal document", () => {
    expect(LEGAL_DOCUMENTS.terms.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(LEGAL_DOCUMENTS.privacy.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(LEGAL_DOCUMENTS.community.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(LEGAL_DOCUMENTS.dataRights.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(REQUIRED_ACCOUNT_AGREEMENTS.map((item) => item.key)).toEqual([
      "terms",
      "privacy",
      "community_guidelines"
    ]);
    expect(currentLegalVersions()).toMatchObject({
      terms: LEGAL_DOCUMENTS.terms.version,
      privacy: LEGAL_DOCUMENTS.privacy.version,
      community_guidelines: LEGAL_DOCUMENTS.community.version,
      data_rights: LEGAL_DOCUMENTS.dataRights.version
    });
  });

  it("rejects stale legal versions and persists authenticated acceptance evidence", () => {
    const source = read("app/api/legal/acceptances/route.ts");
    expect(source).toContain("legal_reacceptance_required");
    expect(source).toContain("document.version !== parsed.data.documentVersion");
    expect(source).toContain('.from("compliance_acceptances").upsert');
    expect(source).toContain("role: acceptanceRole");
    expect(source).not.toContain("account_role: user.role");
    expect(source).toContain('onConflict: "user_id,document_key,document_version"');
    expect(source).toContain("ignoreDuplicates: true");
    expect(source).toContain("accepted_at: acceptedAt");
    expect(source).toContain("ip_address: requestIp(request)");
    expect(source).toContain('user.id === "guest-user"');
  });

  it("provides an authenticated emailed export without payment credentials", () => {
    const requestRoute = read("app/api/account/data-rights/route.ts");
    const exportService = read("lib/trust/account-data-export.ts");
    const worker = read("lib/trust/account-privacy-worker.ts");
    const downloadRoute = read("app/api/account/exports/[token]/route.ts");
    expect(requestRoute).toContain("export_delivery_requires_request");
    expect(worker).toContain("sendAccountExportReadyEmail");
    expect(worker).toContain("24 * 60 * 60 * 1000");
    expect(downloadRoute).toContain('content-disposition');
    expect(downloadRoute).toContain('cache-control');
    expect(exportService).toContain("payment credentials and full card data");
    expect(exportService).not.toContain("provider_payment_method_id");
    expect(exportService).not.toContain("provider_payment_intent_id");
    expect(downloadRoute).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("treats deletion as an auditable request instead of an immediate destructive action", () => {
    const route = read("app/api/account/data-rights/route.ts");
    const migration = read("supabase/migrations/20260711213000_mission6_legal_privacy_data_rights.sql");
    expect(route).toContain('requestType: z.enum(["deletion", "correction", "restriction", "objection"])');
    expect(route).toContain("deletion_request_already_open");
    expect(route).not.toContain("auth.admin.deleteUser");
    expect(migration).toContain("data_rights_requests_open_deletion_idx");
    expect(migration).toContain("status in ('pending', 'processing', 'blocked')");
    expect(migration).toContain("alter table public.data_rights_requests enable row level security");
  });

  it("publishes the required legal and user-rights surfaces", () => {
    expect(read("app/legal/page.tsx")).toContain("Legal documents");
    expect(read("app/legal/page.tsx")).toContain("Counsel review required");
    expect(read("app/terms/page.tsx")).toContain("Terms of Service");
    expect(read("app/privacy/page.tsx")).toContain("Privacy Policy");
    expect(read("app/community-guidelines/page.tsx")).toContain("Community Guidelines");
    expect(read("app/data-rights/page.tsx")).toContain("Data Rights");
  });
});

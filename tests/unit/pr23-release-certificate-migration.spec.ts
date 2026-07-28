import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260728220500_pr23_release_certificate.sql"
  ),
  "utf8"
);

describe("PR23 release certificate migration", () => {
  it("binds certification to one exact commit and deployment", () => {
    expect(sql).toContain("commit_sha text not null");
    expect(sql).toContain("deployment_id text not null");
    expect(sql).toContain("unique (commit_sha, deployment_id)");
  });

  it("requires every PR23 truth check", () => {
    expect(sql).toContain("(check_snapshot ->> 'checkCount')::integer, 0) = 8");
    expect(sql).toContain("(check_snapshot ->> 'passedCount')::integer, 0) = 8");
    expect(sql).toContain("public.bvrb3r_pr23_retired_model_snapshot()");
    expect(sql).toContain("All eight PR23 truth checks must pass.");
  });

  it("fails closed at the Data API boundary", () => {
    expect(sql).toContain(
      "alter table public.pr23_release_certificates enable row level security"
    );
    expect(sql).toContain(
      "revoke all on table public.pr23_release_certificates from public, anon, authenticated"
    );
    expect(sql).toContain(
      "revoke all on function public.pr23_issue_release_certificate(text, text)"
    );
    expect(sql).toContain("to service_role");
  });
});

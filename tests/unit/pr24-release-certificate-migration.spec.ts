import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260728224500_pr24_release_certificate.sql"
  ),
  "utf8"
);

describe("PR24 release certificate migration", () => {
  it("binds aggregate evidence to one exact commit and deployment", () => {
    expect(sql).toContain("commit_sha text not null");
    expect(sql).toContain("deployment_id text not null");
    expect(sql).toContain("unique (commit_sha, deployment_id)");
  });

  it("requires all nine connector checks without role mutation", () => {
    expect(sql).toContain(
      "(evidence_snapshot ->> 'checkCount')::integer, 0) = 9"
    );
    expect(sql).toContain(
      "(evidence_snapshot ->> 'passedCount')::integer, 0) = 9"
    );
    expect(sql).toContain(
      "public.bvrb3r_pr24_role_evidence_snapshot()"
    );
    expect(sql).toContain(
      "All nine PR24 connector checks must pass without mutation."
    );
    expect(sql).toContain(
      "(evidence_snapshot ->> 'normalizationExecutable')::boolean"
    );
    expect(sql).toContain(
      "(evidence_snapshot ->> 'mutationAttempted')::boolean"
    );
  });

  it("persists no private profile content and fails closed", () => {
    expect(sql).toContain(
      "alter table public.pr24_release_certificates enable row level security"
    );
    expect(sql).toContain(
      "revoke all on table public.pr24_release_certificates"
    );
    expect(sql).toContain(
      "revoke all on function public.pr24_issue_release_certificate(text, text)"
    );
    expect(sql).toContain("to service_role");
    expect(sql).not.toContain("profile_id");
    expect(sql).not.toContain("full_name");
    expect(sql).not.toContain("email");
    expect(sql).not.toContain("phone");
  });
});

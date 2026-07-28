import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260728223000_pr24_production_role_evidence_connector.sql"
  ),
  "utf8"
);
const connector = readFileSync(
  join(
    process.cwd(),
    "lib/architect/mission-control/incident-detection.ts"
  ),
  "utf8"
);

describe("PR24 production role evidence connector", () => {
  it("returns deterministic aggregate role evidence without profile content", () => {
    expect(migration).toContain(
      "public.bvrb3r_pr24_role_evidence_snapshot()"
    );
    expect(migration).toContain("'roleCounts', e.role_count_map");
    expect(migration).toContain("'normalizationDecisionCounts'");
    expect(migration).toContain("'linkageGaps'");
    expect(migration).toContain("'contentExposed', false");
    expect(migration).not.toMatch(/\\bp\\.(full_name|email|phone)\\b/);
    expect(migration).not.toContain("'profileIds'");
    expect(migration).not.toContain("'profileRows'");
  });

  it("keeps role normalization non-executable and does not mutate profiles", () => {
    expect(migration).toContain("'normalizationExecutable', false");
    expect(migration).toContain("'mutationAttempted', false");
    expect(migration).not.toMatch(/update\s+public\.profiles/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.profiles/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.profiles/i);
  });

  it("certifies nine connector invariants while reporting linkage gaps honestly", () => {
    expect(migration).toContain(
      "'certifiable', cs.check_count = 9 and cs.passed_count = 9"
    );
    expect(migration).toContain(
      "when e.linkage_gap_count > 0 then 'needs_review'"
    );
    expect(migration).toContain("'linkage_gaps_aggregated', true");
    expect(migration).toContain("'normalization_decisions_aggregated', true");
  });

  it("is service-only at the Data API boundary", () => {
    expect(migration).toContain(
      "revoke all on function public.bvrb3r_pr24_role_evidence_snapshot()"
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("classifies historical relationships using real status and end evidence", () => {
    expect(connector).toContain("const endedRelationshipStatuses = new Set");
    expect(connector).toContain("Boolean(row.ended_at)");
    expect(connector).toContain("endedRelationshipStatuses.has(status)");
    expect(connector).not.toContain("row.is_active === false");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260604120000_fix_messaging_rls_policies.sql"),
  "utf8"
);

describe("messaging RLS policy migration", () => {
  it("binds message_threads select to the outer message_threads row", () => {
    expect(migration).toContain("private.is_message_thread_participant(public.message_threads.id)");
    expect(migration).not.toMatch(/tp\.thread_id\s*=\s*tp\.id/i);
  });

  it("binds messages select and insert to the outer messages row", () => {
    expect(migration).toContain("private.is_message_thread_participant(public.messages.thread_id)");
    expect(migration).not.toMatch(/tp\.thread_id\s*=\s*tp\.thread_id/i);
  });

  it("binds thread_participants select to the outer participant thread id without recursive tautologies", () => {
    expect(migration).toContain("private.is_message_thread_participant(public.thread_participants.thread_id)");
    expect(migration).not.toMatch(/thread_participants\.thread_id\s*=\s*thread_participants\.thread_id/i);
  });

  it("uses a private membership helper to avoid recursive thread_participants policy checks", () => {
    expect(migration).toContain("create schema if not exists private");
    expect(migration).toContain("security definer");
    expect(migration).toContain("from public.thread_participants self");
    expect(migration).toContain("self.thread_id = p_thread_id");
    expect(migration).toContain("self.profile_id = auth.uid()");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260612120000_culture_feed_foundation.sql"),
  "utf8"
);
const mediaStorageMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260612153000_culture_media_private_storage.sql"),
  "utf8"
);

const cultureTables = [
  "culture_posts",
  "culture_media",
  "culture_post_tags",
  "culture_engagements",
  "culture_comments",
  "culture_feed_events",
  "culture_reports",
  "culture_promotions"
];

describe("Culture Feed foundation migration", () => {
  it("creates all Culture foundation tables with RLS enabled", () => {
    for (const table of cultureTables) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("keeps Culture posts aligned to the canonical role enum and local shop schema", () => {
    expect(migration).toContain("author_role public.app_role not null");
    expect(migration).toContain("'client_user'::public.app_role");
    expect(migration).toContain("'barber_user'::public.app_role");
    expect(migration).toContain("'shop_owner_user'::public.app_role");
    expect(migration).toContain("shop_id text references public.shops(id)");
    expect(migration).toContain("public.shops.id is text in this repository");
  });

  it("allows public reads only for published public approved posts", () => {
    expect(migration).toContain("culture posts public approved read");
    expect(migration).toMatch(/publishing_status = 'published'[\s\S]*moderation_status = 'approved'[\s\S]*visibility = 'public'[\s\S]*deleted_at is null/);
    expect(migration).toContain("culture posts author private read");
  });

  it("gates client posting while allowing barber and owner own-post insert policies", () => {
    expect(migration).toContain("culture posts barber own insert");
    expect(migration).toContain("author_role = 'barber_user'::public.app_role");
    expect(migration).toContain("culture posts owner own insert");
    expect(migration).toContain("author_role = 'shop_owner_user'::public.app_role");
    expect(migration).not.toMatch(/culture posts client.*insert/i);
    expect(migration).not.toMatch(/for insert[\s\S]{0,180}author_role = 'client_user'::public\.app_role/);
  });

  it("does not grant broad unauthenticated mutation access", () => {
    expect(migration).not.toMatch(/for (insert|update|delete)[\s\S]{0,80}to anon/i);
    expect(migration).not.toMatch(/grant (insert|update|delete)[^;]+ to anon/i);
    expect(migration).toContain("grant select on public.culture_posts to anon, authenticated");
  });

  it("keeps report rows private to reporter or platform admin", () => {
    expect(migration).toContain("culture reports reporter admin read");
    expect(migration).toContain("reporter_profile_id = auth.uid()");
    expect(migration).toContain("primary_onboarding_role::text = 'platform_admin'");
  });

  it("adds a private Culture media storage bucket scoped to author paths", () => {
    expect(mediaStorageMigration).toContain("values ('culture-media', 'culture-media', false)");
    expect(mediaStorageMigration).toContain("culture media storage author read");
    expect(mediaStorageMigration).toContain("culture media storage author insert");
    expect(mediaStorageMigration).toContain("(storage.foldername(name))[2] = auth.uid()::text");
    expect(mediaStorageMigration).not.toMatch(/culture-media'[\s\S]{0,120}true/);
  });
});

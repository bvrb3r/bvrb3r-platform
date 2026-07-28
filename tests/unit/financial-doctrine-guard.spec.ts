import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const GUARD = join(process.cwd(), "scripts/verify-financial-doctrine.mjs");

function runGuardIn(cwd: string) {
  try {
    const stdout = execFileSync("node", [GUARD, "--json"], { cwd, encoding: "utf8" });
    return { code: 0, payload: JSON.parse(stdout) };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    return { code: failure.status ?? 1, payload: JSON.parse(failure.stdout ?? "{}") };
  }
}

/** Builds a throwaway git repo containing a single file, then runs the guard in it. */
function guardAgainstFixture(relativePath: string, contents: string) {
  const root = mkdtempSync(join(tmpdir(), "bvrb3r-doctrine-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    const target = join(root, relativePath);
    mkdirSync(join(root, relativePath, ".."), { recursive: true });
    writeFileSync(target, contents, "utf8");
    execFileSync("git", ["add", "-A"], { cwd: root });
    return runGuardIn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("financial doctrine guard", () => {
  it("passes on the real repository", () => {
    const { code, payload } = runGuardIn(process.cwd());

    expect(payload.violations).toEqual([]);
    expect(code).toBe(0);
  });

  it("documents a reason for every allowlisted path", () => {
    const { payload } = runGuardIn(process.cwd());

    expect(payload.skipped.length).toBeGreaterThan(0);
    for (const entry of payload.skipped) {
      expect(entry.why, `${entry.path} needs a documented reason`).toBeTruthy();
      expect(entry.why.length).toBeGreaterThan(20);
    }
  });

  it("rejects revenue-share terminology in active code", () => {
    const { code, payload } = guardAgainstFixture(
      "lib/money.ts",
      'export const rate = 0.6; // commission rate\n'
    );

    expect(code).toBe(1);
    expect(payload.violations).toHaveLength(1);
    expect(payload.violations[0]).toMatchObject({ path: "lib/money.ts", rule: "commission" });
  });

  it.each([
    ["revenue-split", "const revenueSplit = 0.5;"],
    ["pay-split", "const pay_split = 0.5;"],
    ["barber-split", "const barberSplit = 0.5;"],
    ["owner-split", "const owner_split = 0.5;"],
    ["ratio-60-40", "// terms are 60/40"],
    ["ratio-65-35", "// terms are 65/35"],
    ["ratio-70-30", "// terms are 70/30"],
    ["ratio-75-25", "// terms are 75/25"]
  ])("rejects prohibited terminology: %s", (rule, line) => {
    const { code, payload } = guardAgainstFixture("lib/terms.ts", `${line}\n`);

    expect(code).toBe(1);
    expect(payload.violations.map((entry: { rule: string }) => entry.rule)).toContain(rule);
  });

  it("allows doctrine terminology", () => {
    const { code, payload } = guardAgainstFixture(
      "lib/rent.ts",
      [
        "// Full Booth Rent bills rent separately.",
        "// AutoBooth Rent applies an owner-approved portion of eligible proceeds",
        "// toward outstanding booth rent and never exceeds what is owed.",
        "export const autoBoothPercent = 0.25;",
        ""
      ].join("\n")
    );

    expect(payload.violations).toEqual([]);
    expect(code).toBe(0);
  });

  it("does not flag already-applied migrations, which are immutable history", () => {
    const { code, payload } = guardAgainstFixture(
      "supabase/migrations/0001_history.sql",
      "create type public.app_role as enum ('commission_barber');\n"
    );

    expect(payload.violations).toEqual([]);
    expect(code).toBe(0);
  });

  it("honors a documented single-line exemption marker", () => {
    const { code, payload } = guardAgainstFixture(
      "docs/history.md",
      "The retired commission model was removed in PR23. <!-- doctrine-allow -->\n"
    );

    expect(payload.violations).toEqual([]);
    expect(code).toBe(0);
  });

  it("still flags a prohibited line that lacks the exemption marker", () => {
    const { code, payload } = guardAgainstFixture(
      "docs/history.md",
      [
        "The retired commission model was removed. <!-- doctrine-allow -->",
        "Barbers can pick a commission plan today.",
        ""
      ].join("\n")
    );

    expect(code).toBe(1);
    expect(payload.violations).toHaveLength(1);
    expect(payload.violations[0].line).toBe(2);
  });

  it("ignores binary and non-text files", () => {
    const { code, payload } = guardAgainstFixture("public/logo.png", "commission\n");

    expect(payload.violations).toEqual([]);
    expect(code).toBe(0);
  });
});

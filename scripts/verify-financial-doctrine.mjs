#!/usr/bin/env node
/**
 * BVRB3R financial doctrine guard.
 *
 * Full Booth Rent and AutoBooth Rent are the only supported shop-barber
 * financial models. This guard fails when prohibited revenue-share terminology
 * appears in ACTIVE code, UI, fixtures, seed data, tests, or current docs.
 *
 * Run directly:   node scripts/verify-financial-doctrine.mjs
 * Machine output: node scripts/verify-financial-doctrine.mjs --json
 *
 * ADDING AN EXCEPTION
 * Exceptions are deliberately narrow and must be justified in ALLOWLIST below.
 * Prefer routing a legitimately-needed retired literal through
 * lib/doctrine/legacy-data-aliases.ts instead of adding a new exception.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PROHIBITED_PATTERNS = [
  { id: "commission", pattern: /commission/i },
  { id: "revenue-split", pattern: /revenue[ _-]?split/i },
  { id: "pay-split", pattern: /pay[ _-]?split/i },
  { id: "barber-split", pattern: /barber[ _-]?split/i },
  { id: "owner-split", pattern: /owner[ _-]?split/i },
  { id: "ratio-50-50", pattern: /\b50\s*\/\s*50\b/ },
  { id: "ratio-60-40", pattern: /\b60\s*\/\s*40\b/ },
  { id: "ratio-65-35", pattern: /\b65\s*\/\s*35\b/ },
  { id: "ratio-70-30", pattern: /\b70\s*\/\s*30\b/ },
  { id: "ratio-75-25", pattern: /\b75\s*\/\s*25\b/ },
  { id: "ratio-80-20", pattern: /\b80\s*\/\s*20\b/ }
];

/**
 * Paths excluded wholesale, with the reason each one is exempt.
 *
 * `prefix` matches from the start of the repo-relative path. `exact` matches the
 * whole path. Every entry needs a `why`.
 */
const ALLOWLIST = [
  {
    prefix: "supabase/migrations/",
    why: "Already-applied migrations are immutable history. They are never rewritten; the doctrine is moved forward by new migrations instead."
  },
  {
    prefix: "supabase/migration-plans/",
    why: "Historical migration planning records describing the pre-doctrine schema."
  },
  {
    prefix: "supabase/tests/",
    why: "Historical database semantics fixtures pinned to the migration that introduced them."
  },
  {
    prefix: "artifacts/",
    why: "Point-in-time schema audit output. Regenerating it would rewrite recorded history."
  },
  {
    prefix: "checkpoints/",
    why: "Immutable historical checkpoint records."
  },
  {
    prefix: "content/legal/",
    why: "Byte-exact attorney review drafts are immutable source evidence, explicitly unpublished, and never executable product doctrine."
  },
  {
    exact: "lib/doctrine/legacy-data-aliases.ts",
    why: "THE single active-code exception. Isolates retired revenue-share literals so pre-doctrine rows can be recognized and normalized. All other active code imports from here."
  },
  {
    exact: "scripts/verify-financial-doctrine.mjs",
    why: "This guard necessarily names the terminology it prohibits."
  },
  {
    exact: "tests/unit/financial-doctrine-guard.spec.ts",
    why: "Proves the guard rejects prohibited terminology, so it must contain samples of it."
  },
  {
    exact: "tests/unit/autobooth-rent-doctrine.spec.ts",
    why: "Proves retired revenue-share values are rejected or normalized away."
  },
  {
    exact: "tests/unit/pr22-master-truth-migration.spec.ts",
    why: "Asserts the literal text of an already-applied historical migration."
  },
  {
    exact: "tests/unit/pr23-retired-model-migration.spec.ts",
    why: "Asserts the literal historical column and function names that PR23 removes from executable use."
  },
  {
    exact: "tests/unit/rls-disabled-evidence-cleanup.spec.ts",
    why: "Asserts the literal text of an already-applied historical migration."
  },
  {
    exact: "tests/unit/role-normalization.spec.ts",
    why: "Proves the retired revenue-share account role normalizes away."
  },
  {
    exact: "tests/unit/architect-mission-control-foundation.spec.ts",
    why: "Asserts the architect audit registry entry that tracks the retired role for repair."
  },
  {
    exact: "CHANGELOG.md",
    why: "Historical release record."
  },
  {
    exact: "RELEASE_CERTIFICATION.md",
    why: "Historical certification record."
  },
  {
    exact: "VISION_ALIGNMENT_REPORT.md",
    why: "Historical point-in-time alignment audit."
  }
];

/** Single lines may be exempted with a trailing marker, e.g. a doc footnote. */
const LINE_EXEMPTION_MARKER = "doctrine-allow";

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".sql", ".md", ".json", ".yml", ".yaml", ".css", ".txt"
]);

function extensionOf(path) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

function allowlistEntryFor(path) {
  return ALLOWLIST.find((entry) =>
    (entry.exact && entry.exact === path) || (entry.prefix && path.startsWith(entry.prefix))
  );
}

function trackedFiles() {
  // --others --exclude-standard includes untracked (not yet committed) files,
  // so a violation cannot hide in a new file until after it lands.
  return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

export function scanRepository() {
  const violations = [];
  const skipped = [];

  for (const path of trackedFiles()) {
    if (!TEXT_EXTENSIONS.has(extensionOf(path))) {
      continue;
    }

    const allowed = allowlistEntryFor(path);
    if (allowed) {
      skipped.push({ path, why: allowed.why });
      continue;
    }

    let contents;
    try {
      contents = readFileSync(path, "utf8");
    } catch {
      continue;
    }

    contents.split(/\r?\n/).forEach((line, index) => {
      if (line.includes(LINE_EXEMPTION_MARKER)) {
        return;
      }

      for (const { id, pattern } of PROHIBITED_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({ path, line: index + 1, rule: id, text: line.trim().slice(0, 200) });
        }
      }
    });
  }

  return { violations, skipped };
}

function main() {
  const asJson = process.argv.includes("--json");
  const { violations, skipped } = scanRepository();

  if (asJson) {
    console.log(JSON.stringify({ ok: violations.length === 0, violations, skipped }, null, 2));
    process.exit(violations.length === 0 ? 0 : 1);
  }

  if (violations.length === 0) {
    console.log("BVRB3R financial doctrine guard: PASS");
    console.log("  Full Booth Rent and AutoBooth Rent are the only supported shop-barber financial models.");
    console.log(`  ${skipped.length} documented exception path(s) skipped.`);
    process.exit(0);
  }

  console.error("BVRB3R financial doctrine guard: FAIL");
  console.error("");
  console.error("Prohibited revenue-share terminology found in active files.");
  console.error("BVRB3R supports Full Booth Rent and AutoBooth Rent only.");
  console.error("");
  for (const violation of violations) {
    console.error(`  ${violation.path}:${violation.line}  [${violation.rule}]`);
    console.error(`      ${violation.text}`);
  }
  console.error("");
  console.error(`${violations.length} violation(s).`);
  console.error("");
  console.error("To resolve:");
  console.error("  - Replace the terminology with Full Booth Rent or AutoBooth Rent.");
  console.error("  - If a retired literal is genuinely required to read pre-doctrine rows,");
  console.error("    import it from lib/doctrine/legacy-data-aliases.ts.");
  console.error(`  - For a one-off documented line, append the ${LINE_EXEMPTION_MARKER} marker.`);
  console.error("  - Only add an ALLOWLIST entry as a last resort, with a written reason.");
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

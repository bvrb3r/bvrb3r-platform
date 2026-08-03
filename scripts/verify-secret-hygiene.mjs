#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

const sensitiveEnvironmentNames = new Set([
  "ANDROID_SIGNING_SHA256",
  "FCM_CLIENT_EMAIL",
  "FCM_PRIVATE_KEY",
  "FCM_SENDER_ID",
  "GOOGLE_MAPS_API_KEY",
  "IOS_KEY_ID",
  "IOS_PRIVATE_KEY",
  "IOS_TEAM_ID",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_PHONE_NUMBER",
  "WEB_PUSH_PRIVATE_KEY"
]);

const sensitiveEnvironmentSuffix =
  /(?:_API_KEY|_AUTH_TOKEN|_CLIENT_SECRET|_CREDENTIAL|_PASSWORD|_PRIVATE_KEY|_SECRET|_SERVICE_ROLE_KEY|_TOKEN)$/;

// Assemble the markers so this verifier does not trigger on its own source.
const privateKeyMarker = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
function boundedCredentialPattern(prefixParts, valuePattern) {
  const prefix = prefixParts.join("_");
  return new RegExp(
    `(?:^|[^A-Za-z0-9_])${prefix}${valuePattern}(?=$|[^A-Za-z0-9_-])`
  );
}

const credentialPatterns = [
  { rule: "stripe-secret-key", pattern: boundedCredentialPattern(["sk", "(?:live|test)"], "_[A-Za-z0-9]{16,}") },
  { rule: "stripe-restricted-key", pattern: boundedCredentialPattern(["rk", "(?:live|test)"], "_[A-Za-z0-9]{16,}") },
  { rule: "stripe-webhook-secret", pattern: boundedCredentialPattern(["whsec"], "_[A-Za-z0-9]{16,}") },
  { rule: "supabase-secret-key", pattern: boundedCredentialPattern(["sb", "secret"], "_[A-Za-z0-9_-]{16,}") },
  // `re_` is also Stripe's refund-id prefix, so require the longer API-key shape.
  { rule: "resend-api-key", pattern: boundedCredentialPattern(["re"], "_[A-Za-z0-9_-]{32,}") },
  { rule: "github-token", pattern: boundedCredentialPattern(["ghp"], "_[A-Za-z0-9]{20,}") },
  { rule: "github-fine-grained-token", pattern: boundedCredentialPattern(["github", "pat"], "_[A-Za-z0-9_]{20,}") },
  { rule: "aws-access-key", pattern: /(?:^|[^A-Z0-9])AKIA[A-Z0-9]{16}(?=$|[^A-Z0-9])/ },
  { rule: "google-api-key", pattern: /(?:^|[^A-Za-z0-9_-])AIza[A-Za-z0-9_-]{24,}(?=$|[^A-Za-z0-9_-])/ },
  { rule: "jwt-token", pattern: /(?:^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{32,}(?=$|[^A-Za-z0-9_-])/ }
];

function gitText(args, options = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });

  if (result.status !== 0) {
    if (options.allowFailure) return null;
    throw new Error(result.stderr.trim() || `Git command failed: git ${args.join(" ")}`);
  }

  return result.stdout;
}

function gitBuffer(args, options = {}) {
  const result = spawnSync("git", args, {
    encoding: null,
    maxBuffer: MAX_TEXT_FILE_BYTES + 1024
  });

  if (result.status !== 0) {
    if (options.allowFailure) return null;
    throw new Error(result.stderr.toString("utf8").trim() || `Git command failed: git ${args.join(" ")}`);
  }

  return result.stdout;
}

function gitFiles(args) {
  return (gitText(args) ?? "").split("\0").filter(Boolean);
}

function normalizeAssignmentValue(value) {
  let normalized = value.trim();

  const quoted =
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"));

  if (quoted) {
    normalized = normalized.slice(1, -1).trim();
  } else {
    normalized = normalized.replace(/\s+#.*$/, "").trim();
  }

  return normalized;
}

/**
 * Placeholder recognition is deliberately exact. In particular, `test`,
 * `mock`, or `fixture` appearing somewhere inside a value does not make a
 * credential safe: valid provider credentials commonly contain those words.
 */
export function isExplicitPlaceholder(value) {
  const normalized = normalizeAssignmentValue(value).toLowerCase();

  if (normalized === "") return true;
  if (/^<[^<>\r\n]+>$/.test(normalized)) return true;
  if (/^\$\{[a-z0-9_:-]+\}$/.test(normalized)) return true;
  if (/(?:^|[-_ .:/])(?:placeholder|redacted)(?=$|[-_ .:/])/.test(normalized)) return true;

  return /^(?:(?:replace(?:[-_ ]with)?|change(?:[-_ ]me)?|your|example|sample|dummy|fake|fixture|mock|unset|not[-_ ]set|not[-_ ]configured|todo|tbd)(?:[-_ .:/][a-z0-9${}<>.-]+)*|none|null)$/i.test(normalized);
}

function isTextBuffer(buffer) {
  return buffer.length <= MAX_TEXT_FILE_BYTES && !buffer.subarray(0, 8_192).includes(0);
}

function readWorkingTreeFile(path) {
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > MAX_TEXT_FILE_BYTES) return null;
    const buffer = readFileSync(path);
    return isTextBuffer(buffer) ? buffer : null;
  } catch {
    return null;
  }
}

function addFinding(findings, seen, finding) {
  const key = [finding.source, finding.commit ?? "", finding.path, finding.line, finding.rule].join("\0");
  if (seen.has(key)) return;
  seen.add(key);
  findings.push(finding);
}

export function scanText({ contents, path, source, commit = null }, findings = [], seen = new Set()) {
  if (!isTextBuffer(contents)) return { findings, seen };

  contents.toString("utf8").split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    const assignment = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);

    if (assignment) {
      const [, name, value] = assignment;
      const sensitiveName =
        sensitiveEnvironmentNames.has(name) || sensitiveEnvironmentSuffix.test(name);

      if (sensitiveName && !isExplicitPlaceholder(value)) {
        addFinding(findings, seen, {
          path,
          line: lineNumber,
          rule: "sensitive-environment-value",
          environmentName: name,
          source,
          ...(commit ? { commit } : {})
        });
      }
    }

    // Private-key and provider-token shapes always fail. A comment containing
    // `test` or `mock` must never suppress a real credential match.
    if (line.includes(privateKeyMarker)) {
      addFinding(findings, seen, {
        path,
        line: lineNumber,
        rule: "private-key-material",
        source,
        ...(commit ? { commit } : {})
      });
    }

    for (const { rule, pattern } of credentialPatterns) {
      if (pattern.test(line)) {
        addFinding(findings, seen, {
          path,
          line: lineNumber,
          rule,
          source,
          ...(commit ? { commit } : {})
        });
      }
    }
  });

  return { findings, seen };
}

function scanWorkingTreeAndIndex(findings, seen) {
  const workingPaths = gitFiles(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  const cachedPaths = new Set(gitFiles(["ls-files", "-z", "--cached"]));

  for (const path of workingPaths) {
    const workingBuffer = readWorkingTreeFile(path);
    if (workingBuffer) {
      scanText({ contents: workingBuffer, path, source: "working-tree" }, findings, seen);
    }

    if (!cachedPaths.has(path)) continue;

    const indexBuffer = gitBuffer(["show", `:${path}`], { allowFailure: true });
    if (!indexBuffer || !isTextBuffer(indexBuffer)) continue;
    if (workingBuffer?.equals(indexBuffer)) continue;

    scanText({ contents: indexBuffer, path, source: "index" }, findings, seen);
  }
}

function commitsForRange(range) {
  return (gitText(["rev-list", "--reverse", range]) ?? "")
    .split(/\r?\n/)
    .filter(Boolean);
}

function allReachableCommits() {
  return (gitText(["rev-list", "--reverse", "--all"]) ?? "")
    .split(/\r?\n/)
    .filter(Boolean);
}

function scanCommits(commits, findings, seen) {
  const seenBlobs = new Set();

  for (const commit of commits) {
    const paths = gitFiles([
      "diff-tree",
      "--root",
      "-m",
      "--no-commit-id",
      "--name-only",
      "--diff-filter=ACMR",
      "-z",
      "-r",
      commit
    ]);

    for (const path of new Set(paths)) {
      const objectId = gitText(["rev-parse", `${commit}:${path}`], { allowFailure: true })?.trim();
      if (!objectId || seenBlobs.has(objectId)) continue;
      seenBlobs.add(objectId);

      const size = Number(gitText(["cat-file", "-s", objectId], { allowFailure: true }));
      if (!Number.isFinite(size) || size > MAX_TEXT_FILE_BYTES) continue;

      const contents = gitBuffer(["cat-file", "blob", objectId], { allowFailure: true });
      if (!contents || !isTextBuffer(contents)) continue;

      scanText(
        { contents, path, source: "history", commit },
        findings,
        seen
      );
    }
  }
}

function parseArguments(argv) {
  const options = { asJson: false, history: false, commitRange: null };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.asJson = true;
    } else if (argument === "--history") {
      options.history = true;
    } else if (argument === "--commit-range") {
      options.commitRange = argv[index + 1] ?? null;
      index += 1;
      if (!options.commitRange) throw new Error("--commit-range requires a Git revision range.");
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (options.history && options.commitRange) {
    throw new Error("Use either --history or --commit-range, not both.");
  }

  return options;
}

export function scanRepository({ history = false, commitRange = null } = {}) {
  const findings = [];
  const seen = new Set();

  scanWorkingTreeAndIndex(findings, seen);

  if (history) {
    scanCommits(allReachableCommits(), findings, seen);
  } else if (commitRange) {
    scanCommits(commitsForRange(commitRange), findings, seen);
  }

  return {
    findings,
    scanned: {
      workingTree: true,
      index: true,
      history: history ? "--all" : commitRange
    }
  };
}

function printHumanResult(result) {
  if (result.findings.length === 0) {
    const historyLabel = result.scanned.history
      ? ` and history ${result.scanned.history}`
      : "";
    console.log(`Secret hygiene check passed: working tree, index${historyLabel} contain explicit placeholders only.`);
    return;
  }

  console.error("Credential-shaped material detected:");
  for (const finding of result.findings) {
    const commitLabel = finding.commit ? `@${finding.commit.slice(0, 12)}` : "";
    const environmentLabel = finding.environmentName ? `:${finding.environmentName}` : "";
    console.error(
      `- ${finding.path}:${finding.line}:${finding.rule}${environmentLabel} [${finding.source}${commitLabel}]`
    );
  }
}

function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    const result = scanRepository(options);

    if (options.asJson) {
      console.log(JSON.stringify({ ok: result.findings.length === 0, ...result }, null, 2));
    } else {
      printHumanResult(result);
    }

    process.exit(result.findings.length === 0 ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options?.asJson || process.argv.includes("--json")) {
      console.log(JSON.stringify({ ok: false, error: message, findings: [] }, null, 2));
    } else {
      console.error(`Secret hygiene check failed: ${message}`);
    }
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

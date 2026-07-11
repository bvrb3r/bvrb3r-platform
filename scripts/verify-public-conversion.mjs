import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const proofPath = join(root, "public", ".well-known", "bvrb3r-public-conversion-proof.json");
const scanRoots = ["app", "components", "lib"].map((path) => join(root, path)).filter(existsSync);
const findings = [];
const inventory = { publicGetRoutes: [], authEntryFiles: [], publicProfileFiles: [] };

function currentCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(path, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return /\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name) ? [absolute] : [];
  });
}

function add(path, code, detail) {
  findings.push({ path: relative(root, path).replaceAll("\\", "/"), code, detail });
}

function getHandlerSource(source, handlerName) {
  const pattern = new RegExp(`export\\s+(?:async\\s+)?function\\s+${handlerName}\\b|export\\s+const\\s+${handlerName}\\b`, "g");
  const match = pattern.exec(source);
  if (!match) return "";
  const remainder = source.slice(match.index);
  const nextExport = remainder.slice(match[0].length).search(/\nexport\s+(?:async\s+)?(?:function|const)\s+(?:GET|POST|PUT|PATCH|DELETE)\b/);
  return nextExport < 0 ? remainder : remainder.slice(0, match[0].length + nextExport);
}

const mutationPatterns = [
  [/\.insert\s*\(/, "public_get_insert"],
  [/\.update\s*\(/, "public_get_update"],
  [/\.upsert\s*\(/, "public_get_upsert"],
  [/\.delete\s*\(/, "public_get_delete"],
  [/\b(?:repair|provision|synchronize|sync|persist|backfill)[A-Z_\w]*\s*\(/, "public_get_repair_or_sync"]
];
const sensitiveLogPatterns = [
  [/request\.nextUrl\.search\b/, "raw_request_search_logged"],
  [/Object\.fromEntries\s*\(\s*request\.nextUrl\.searchParams/, "raw_query_params_logged"],
  [/\b(?:sessionUserId|sessionClientId|clientId|profileId|userId)\b[^\n]{0,120}console\./, "identity_logged"],
  [/console\.(?:error|warn|info|log)[\s\S]{0,500}\b(?:stack|details|hint|supabaseMessage|queryParams)\b/, "sensitive_error_metadata_logged"]
];

for (const path of scanRoots.flatMap(walk)) {
  const source = readFileSync(path, "utf8");
  const rel = relative(root, path).replaceAll("\\", "/");
  const isRoute = /\/route\.(?:ts|js)$/.test(rel);
  const getSource = getHandlerSource(source, "GET");
  const isPublicSurface = /(?:^|\/)(?:public|marketplace|barber|barbers|shop|shops|profile|profiles|guest|booking)(?:\/|$)/i.test(rel);

  if (isRoute && getSource && isPublicSurface) {
    inventory.publicGetRoutes.push(rel);
    for (const [pattern, code] of mutationPatterns) {
      if (pattern.test(getSource) && !/recordDiscoveryImpression|recordHaircutNowImpression/.test(getSource)) {
        add(path, code, "Public GET routes must be read-only.");
      }
    }
    for (const [pattern, code] of sensitiveLogPatterns) {
      if (pattern.test(getSource)) add(path, code, "Public diagnostics must not expose request, identity, or database details.");
    }
    if (/searchParams\.get\(\s*["'](?:clientId|profileId|userId)["']\s*\)/.test(getSource)) {
      add(path, "caller_controlled_identity", "Public query parameters cannot select authenticated identity.");
    }
  }

  if (/auth-entry|\/login|\/signup|auth\/callback|post-auth-return/i.test(rel)) inventory.authEntryFiles.push(rel);
  if (/public.*(?:barber|shop|profile)|(?:barber|shop|profile).*public/i.test(rel)) inventory.publicProfileFiles.push(rel);
}

const postAuthPath = join(root, "lib", "auth", "post-auth-return.ts");
if (!existsSync(postAuthPath)) {
  add(postAuthPath, "missing_post_auth_return_guard", "A centralized safe post-auth return guard is required.");
} else {
  const source = readFileSync(postAuthPath, "utf8");
  for (const prefix of ["/booking", "/barbers", "/shops"]) {
    if (!source.includes(`"${prefix}"`)) add(postAuthPath, "missing_public_conversion_return_prefix", `Missing safe return prefix ${prefix}.`);
  }
}

const generatedAt = new Date().toISOString();
const proof = {
  schemaVersion: 1,
  generatedAt,
  validationCommit: currentCommit(),
  status: findings.length === 0 ? "pass" : "failed",
  certifiable: findings.length === 0 && Boolean(currentCommit()),
  findingCount: findings.length,
  findings,
  inventory: {
    publicGetRoutes: [...new Set(inventory.publicGetRoutes)].sort(),
    authEntryFiles: [...new Set(inventory.authEntryFiles)].sort(),
    publicProfileFiles: [...new Set(inventory.publicProfileFiles)].sort()
  }
};

mkdirSync(dirname(proofPath), { recursive: true });
writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(JSON.stringify(proof, null, 2));
if (findings.length > 0) process.exit(1);

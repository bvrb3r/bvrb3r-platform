import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const GUARD = join(process.cwd(), "scripts/verify-secret-hygiene.mjs");

type Finding = {
  path: string;
  line: number;
  rule: string;
  source: "working-tree" | "index" | "history";
  commit?: string;
};

type GuardPayload = {
  ok: boolean;
  findings: Finding[];
  error?: string;
};

function runGuardIn(cwd: string, args: string[] = []) {
  const result = spawnSync("node", [GUARD, "--json", ...args], {
    cwd,
    encoding: "utf8"
  });

  return {
    code: result.status ?? 1,
    stdout: result.stdout,
    payload: JSON.parse(result.stdout || "{}") as GuardPayload
  };
}

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), "bvrb3r-secret-hygiene-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "security-test@bvrb3r.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "BVRB3R Security Test"], { cwd: root });
  return root;
}

function writeFixture(root: string, relativePath: string, contents: string) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, "utf8");
}

function commitAll(root: string, message: string) {
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", message], { cwd: root });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function withRepository(run: (root: string) => void) {
  const root = createRepository();
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function stripeTestSecret() {
  return ["sk", "test", "A".repeat(32)].join("_");
}

describe("secret hygiene guard", () => {
  it("accepts only explicit placeholder forms", () => {
    withRepository((root) => {
      writeFixture(
        root,
        ".env.staging.example",
        [
          "SUPABASE_SERVICE_ROLE_KEY=replace_with_staging_service_role",
          "RESEND_API_KEY=<resend-api-key>",
          "FCM_PRIVATE_KEY=${FCM_PRIVATE_KEY}",
          "TWILIO_AUTH_TOKEN=not_configured",
          "STRIPE_WEBHOOK_SECRET=redacted",
          ""
        ].join("\n")
      );
      execFileSync("git", ["add", "-A"], { cwd: root });

      const result = runGuardIn(root);
      expect(result.payload.findings).toEqual([]);
      expect(result.code).toBe(0);
    });
  });

  it("rejects a real-shaped Stripe test key and never echoes its value", () => {
    withRepository((root) => {
      const secret = stripeTestSecret();
      writeFixture(root, ".env.staging.example", "STRIPE_SECRET_KEY=" + secret + "\n");
      execFileSync("git", ["add", "-A"], { cwd: root });

      const result = runGuardIn(root);
      expect(result.code).toBe(1);
      expect(result.payload.findings.map((finding) => finding.rule)).toContain("stripe-secret-key");
      expect(result.stdout).not.toContain(secret);
    });
  });

  it("does not let a test or mock comment suppress a credential", () => {
    withRepository((root) => {
      const secret = stripeTestSecret();
      writeFixture(
        root,
        ".env.staging.example",
        "STRIPE_SECRET_KEY=" + secret + " # test fixture / mock only\n"
      );
      execFileSync("git", ["add", "-A"], { cwd: root });

      const result = runGuardIn(root);
      expect(result.code).toBe(1);
      expect(result.payload.findings).not.toHaveLength(0);
      expect(result.stdout).not.toContain(secret);
    });
  });

  it("rejects private-key material", () => {
    withRepository((root) => {
      const marker = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
      const privateKey = marker + "\\n" + "A".repeat(80) + "\\n-----END PRIVATE KEY-----";
      writeFixture(root, ".env.staging.example", 'FCM_PRIVATE_KEY="' + privateKey + '"\n');
      execFileSync("git", ["add", "-A"], { cwd: root });

      const result = runGuardIn(root);
      expect(result.code).toBe(1);
      expect(result.payload.findings.map((finding) => finding.rule)).toContain("private-key-material");
      expect(result.stdout).not.toContain(privateKey);
    });
  });

  it("rejects a JWT-shaped token outside an environment assignment", () => {
    withRepository((root) => {
      const jwt = ["eyJ" + "A".repeat(28), "B".repeat(48), "C".repeat(40)].join(".");
      writeFixture(root, "runtime.log", "authorization token: " + jwt + "\n");
      execFileSync("git", ["add", "-A"], { cwd: root });

      const result = runGuardIn(root);
      expect(result.code).toBe(1);
      expect(result.payload.findings.map((finding) => finding.rule)).toContain("jwt-token");
      expect(result.stdout).not.toContain(jwt);
    });
  });

  it("scans untracked files before they are added", () => {
    withRepository((root) => {
      writeFixture(root, "README.md", "safe\n");
      commitAll(root, "safe baseline");

      writeFixture(root, ".env.new", "STRIPE_SECRET_KEY=" + stripeTestSecret() + "\n");
      const result = runGuardIn(root);

      expect(result.code).toBe(1);
      expect(result.payload.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ".env.new", source: "working-tree" })
        ])
      );
    });
  });

  it("scans staged content even when the working copy was sanitized afterward", () => {
    withRepository((root) => {
      writeFixture(root, ".env.staging.example", "STRIPE_SECRET_KEY=replace_with_staging_key\n");
      commitAll(root, "safe baseline");

      writeFixture(root, ".env.staging.example", "STRIPE_SECRET_KEY=" + stripeTestSecret() + "\n");
      execFileSync("git", ["add", ".env.staging.example"], { cwd: root });
      writeFixture(root, ".env.staging.example", "STRIPE_SECRET_KEY=replace_with_staging_key\n");

      const result = runGuardIn(root);
      expect(result.code).toBe(1);
      expect(result.payload.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ".env.staging.example", source: "index" })
        ])
      );
    });
  });

  it("finds a credential introduced and removed inside a commit range", () => {
    withRepository((root) => {
      writeFixture(root, ".env.staging.example", "STRIPE_SECRET_KEY=replace_with_staging_key\n");
      const base = commitAll(root, "safe baseline");

      writeFixture(root, ".env.staging.example", "STRIPE_SECRET_KEY=" + stripeTestSecret() + "\n");
      const leakedCommit = commitAll(root, "introduce unsafe fixture");

      writeFixture(root, ".env.staging.example", "STRIPE_SECRET_KEY=replace_with_staging_key\n");
      commitAll(root, "sanitize current tree");

      expect(runGuardIn(root).code).toBe(0);

      const result = runGuardIn(root, ["--commit-range", base + "..HEAD"]);
      expect(result.code).toBe(1);
      expect(result.payload.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: "history", commit: leakedCommit })
        ])
      );
    });
  });

  it("supports an explicit all-history audit", () => {
    withRepository((root) => {
      writeFixture(root, ".env.staging.example", "STRIPE_SECRET_KEY=" + stripeTestSecret() + "\n");
      const leakedCommit = commitAll(root, "unsafe root");

      writeFixture(root, ".env.staging.example", "STRIPE_SECRET_KEY=replace_with_staging_key\n");
      commitAll(root, "sanitize current tree");

      expect(runGuardIn(root).code).toBe(0);

      const result = runGuardIn(root, ["--history"]);
      expect(result.code).toBe(1);
      expect(result.payload.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: "history", commit: leakedCommit })
        ])
      );
    });
  });
});

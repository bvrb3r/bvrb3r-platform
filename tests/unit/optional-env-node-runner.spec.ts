import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const runner = join(process.cwd(), "scripts", "run-node-with-optional-env.mjs");
const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("optional Node env launcher", () => {
  it("runs silently when an optional env file does not exist", () => {
    const result = spawnSync(
      process.execPath,
      [runner, ".env.this-file-does-not-exist", "--", "-e", "process.stdout.write('pass')"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("pass");
    expect(result.stderr).toBe("");
  });

  it("loads existing env files in the same order as Node", () => {
    const directory = mkdtempSync(join(tmpdir(), "bvrb3r-optional-env-"));
    tempDirectories.push(directory);
    const baseEnv = join(directory, "base.env");
    const targetEnv = join(directory, "target.env");
    writeFileSync(baseEnv, "BVRB3R_OPTIONAL_ENV_TEST=base\n", "utf8");
    writeFileSync(targetEnv, "BVRB3R_OPTIONAL_ENV_TEST=target\n", "utf8");

    const output = execFileSync(
      process.execPath,
      [
        runner,
        baseEnv,
        targetEnv,
        "--",
        "-e",
        "process.stdout.write(process.env.BVRB3R_OPTIONAL_ENV_TEST ?? '')",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          BVRB3R_OPTIONAL_ENV_TEST: undefined,
        },
      },
    );

    expect(output).toBe("target");
  });
});

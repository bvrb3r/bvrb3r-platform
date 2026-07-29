import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const separatorIndex = args.indexOf("--");

if (separatorIndex < 0 || separatorIndex === args.length - 1) {
  console.error(
    "Usage: node scripts/run-node-with-optional-env.mjs [env files...] -- <node target> [args...]",
  );
  process.exitCode = 2;
} else {
  const envFiles = args.slice(0, separatorIndex).filter((file) => existsSync(file));
  const targetArgs = args.slice(separatorIndex + 1);
  const envArgs = envFiles.map((file) => `--env-file=${file}`);

  const child = spawn(process.execPath, [...envArgs, ...targetArgs], {
    env: process.env,
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error(`Unable to start Node target: ${error.message}`);
    process.exitCode = 1;
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode = code ?? 1;
  });
}

import { execSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const binDir = path.join(root, "node_modules", ".bin");
const nextBin = path.join(binDir, process.platform === "win32" ? "next.cmd" : "next");
const tscBin = path.join(binDir, process.platform === "win32" ? "tsc.cmd" : "tsc");
const command = `"${nextBin}" typegen && "${tscBin}" --noEmit --incremental false -p tsconfig.typecheck.json`;

try {
  execSync(command, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32" ? "cmd.exe" : true
  });
} catch {
  process.exit(1);
}
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";

const TARGET_PORT = 3000;
const WINDOWS_NETSTAT_PATH = "C:\\Windows\\System32\\netstat.exe";
const WINDOWS_TASKKILL_PATH = "C:\\Windows\\System32\\taskkill.exe";

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(() => resolve(true));
    });
  });
}

function parseWindowsPids(port) {
  const output = execFileSync(WINDOWS_NETSTAT_PATH, ["-ano"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  const pids = new Set();

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || (!line.startsWith("TCP") && !line.startsWith("UDP"))) continue;

    const columns = line.split(/\s+/);
    const localAddress = columns[1] ?? "";
    const pid = columns.at(-1) ?? "";
    if (pid && pid !== "0" && (localAddress.endsWith(`:${port}`) || localAddress.endsWith(`]:${port}`))) {
      pids.add(Number(pid));
    }
  }

  return [...pids].filter(Number.isInteger);
}

function parsePosixPids(port) {
  try {
    const output = execFileSync("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return [...new Set(output.split(/\s+/).map(Number).filter(Number.isInteger))];
  } catch {
    try {
      const output = execFileSync("fuser", ["-n", "tcp", String(port)], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      });
      return [...new Set(output.split(/\s+/).map(Number).filter(Number.isInteger))];
    } catch {
      return [];
    }
  }
}

function pidsUsingPort(port) {
  return process.platform === "win32" ? parseWindowsPids(port) : parsePosixPids(port);
}

function terminatePid(pid) {
  if (process.platform === "win32") {
    execFileSync(WINDOWS_TASKKILL_PATH, ["/PID", String(pid), "/F", "/T"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    return;
  }

  process.kill(pid, "SIGTERM");
}

async function main() {
  if (await isPortAvailable(TARGET_PORT)) {
    console.log(`OK: Port ${TARGET_PORT} is ready`);
    return;
  }

  const initialPids = pidsUsingPort(TARGET_PORT);
  if (!initialPids.length) {
    console.error(`ERROR: Port ${TARGET_PORT} is occupied, but its process could not be identified safely.`);
    process.exit(1);
  }

  console.log(`Port ${TARGET_PORT} is occupied by PID(s): ${initialPids.join(", ")}. Attempting to free it...`);
  for (const pid of initialPids) {
    try {
      terminatePid(pid);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ERROR: Could not free port ${TARGET_PORT}`);
      console.error(`Failed to terminate PID ${pid}: ${message}`);
      process.exit(1);
    }
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await sleep(250);
    if (await isPortAvailable(TARGET_PORT)) {
      console.log(`OK: Port ${TARGET_PORT} is ready`);
      return;
    }
  }

  console.error(`ERROR: Port ${TARGET_PORT} is still occupied after terminating PID(s): ${initialPids.join(", ")}`);
  process.exit(1);
}

await main();

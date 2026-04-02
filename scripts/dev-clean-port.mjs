import { execFileSync } from "node:child_process";

const TARGET_PORT = 3000;
const NETSTAT_PATH = "C:\\Windows\\System32\\netstat.exe";
const TASKKILL_PATH = "C:\\Windows\\System32\\taskkill.exe";

function readNetstat() {
  return execFileSync(NETSTAT_PATH, ["-ano"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
}

function parsePidsUsingPort(port) {
  const output = readNetstat();
  const pids = new Set();

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || (!line.startsWith("TCP") && !line.startsWith("UDP"))) {
      continue;
    }

    const columns = line.split(/\s+/);
    const localAddress = columns[1] ?? "";
    const pid = columns.at(-1) ?? "";

    if (!pid || pid === "0") {
      continue;
    }

    if (localAddress.endsWith(`:${port}`) || localAddress.endsWith(`]:${port}`)) {
      pids.add(pid);
    }
  }

  return [...pids];
}

function killPid(pid) {
  execFileSync(TASKKILL_PATH, ["/PID", pid, "/F", "/T"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const initialPids = parsePidsUsingPort(TARGET_PORT);

  if (initialPids.length) {
    console.log(`Port ${TARGET_PORT} is occupied by PID(s): ${initialPids.join(", ")}. Attempting to free it...`);

    for (const pid of initialPids) {
      try {
        killPid(pid);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`ERROR: Could not free port ${TARGET_PORT}`);
        console.error(`Failed to terminate PID ${pid}: ${message}`);
        process.exit(1);
      }
    }

    await sleep(1500);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const remainingPids = parsePidsUsingPort(TARGET_PORT);
    if (!remainingPids.length) {
      console.log(`OK: Port ${TARGET_PORT} is ready`);
      return;
    }

    if (attempt === 4) {
      console.error(`ERROR: Could not free port ${TARGET_PORT}`);
      console.error(`Port ${TARGET_PORT} is still occupied by PID(s): ${remainingPids.join(", ")}`);
      process.exit(1);
    }

    await sleep(500);
  }
}

await main();

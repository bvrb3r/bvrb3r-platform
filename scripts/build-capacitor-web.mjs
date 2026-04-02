import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.join(process.cwd(), "dist", "capacitor");
const publicIconsDir = path.join(process.cwd(), "public", "icons");
const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "BVRB3R Platform";
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const remoteServerUrl = process.env.CAPACITOR_SERVER_URL ?? "";
const linkScheme = process.env.NEXT_PUBLIC_APP_LINK_SCHEME ?? "bvrb3r";

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function copyIconsIfPresent() {
  try {
    await cp(publicIconsDir, path.join(outputDir, "icons"), { recursive: true });
  } catch {
    // Keep the shell build resilient if icon assets are not present.
  }
}

function buildHtml() {
  const safeAppName = escapeHtml(appName);
  const safeAppUrl = escapeHtml(appUrl);
  const safeRemoteServerUrl = escapeHtml(remoteServerUrl);
  const safeLinkScheme = escapeHtml(linkScheme);
  const redirectScript = JSON.stringify(remoteServerUrl);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#050505" />
  <title>${safeAppName} Mobile Shell</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #050505;
      color: #f5f5f5;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at top, rgba(124, 255, 0, 0.16), transparent 35%),
        linear-gradient(180deg, #0a0a0a 0%, #050505 100%);
      padding: 24px;
    }

    main {
      width: min(100%, 32rem);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 24px;
      background: rgba(10, 10, 10, 0.92);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
      padding: 28px;
      backdrop-filter: blur(18px);
    }

    .eyebrow {
      margin: 0 0 10px;
      font-size: 0.72rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #d7ffab;
    }

    h1 {
      margin: 0;
      font-size: 1.75rem;
      line-height: 1.1;
    }

    p {
      margin: 14px 0 0;
      color: rgba(255, 255, 255, 0.72);
      line-height: 1.55;
    }

    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.9em;
      color: #f8f8f8;
    }

    .status {
      margin-top: 18px;
      padding: 14px 16px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 20px;
    }

    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 16px;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 600;
    }

    a.primary {
      background: #7cff00;
      color: #050505;
    }

    a.secondary {
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #f5f5f5;
    }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Capacitor Shell</p>
    <h1>${safeAppName}</h1>
    <p id="message">Preparing the mobile wrapper.</p>
    <div class="status" id="status">
      <strong>Remote app URL:</strong>
      <div><code>${safeRemoteServerUrl || "Not configured"}</code></div>
    </div>
    <div class="button-row" id="actions">
      <a class="secondary" href="${safeAppUrl}">Open web app</a>
      <a class="secondary" href="${safeLinkScheme}://open?href=%2Fdiscover">Open deep link</a>
    </div>
  </main>
  <script>
    const remoteServerUrl = ${redirectScript};
    const message = document.getElementById("message");
    const status = document.getElementById("status");

    if (remoteServerUrl) {
      message.textContent = "Opening the deployed BVRB3R app for mobile testing...";
      status.innerHTML = "<strong>Redirecting to:</strong><div><code>" + remoteServerUrl + "</code></div>";
      window.location.replace(remoteServerUrl);
    } else {
      message.textContent = "This native wrapper expects a deployed Next.js environment. Set CAPACITOR_SERVER_URL before running the mobile sync.";
    }
  </script>
</body>
</html>`;
}

async function main() {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await copyIconsIfPresent();

  const html = buildHtml();
  const metadata = {
    appName,
    appUrl,
    remoteServerUrl,
    linkScheme,
    builtAt: new Date().toISOString()
  };

  await writeFile(path.join(outputDir, "index.html"), html, "utf8");
  await writeFile(path.join(outputDir, "app-info.json"), JSON.stringify(metadata, null, 2), "utf8");
}

await main();


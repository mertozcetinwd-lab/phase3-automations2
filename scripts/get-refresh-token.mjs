// One-time helper: obtain a Google Drive OAuth refresh token and write it into
// .env as GOOGLE_REFRESH_TOKEN.
//
// Prerequisites (see README):
//   1. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are already filled in .env
//      (from a "Desktop app" OAuth client in Google Cloud Console).
//   2. You've added yourself as a Test user on the OAuth consent screen.
//
// Run:  node scripts/get-refresh-token.mjs
// Then authorize in the browser window that opens; the token is saved for you.

import http from "node:http";
import { exec } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { auth as googleAuth } from "@googleapis/drive";

const ENV_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
const PORT = 42813;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/drive.file";

function readEnv() {
  const map = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.includes("=")) continue;
    const i = line.indexOf("=");
    map[line.slice(0, i).trim()] = line.slice(i + 1);
  }
  return map;
}

function writeRefreshToken(token) {
  const lines = readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  let found = false;
  const out = lines.map((l) => {
    if (l.startsWith("GOOGLE_REFRESH_TOKEN=")) {
      found = true;
      return `GOOGLE_REFRESH_TOKEN=${token}`;
    }
    return l;
  });
  if (!found) out.push(`GOOGLE_REFRESH_TOKEN=${token}`);
  // Write UTF-8 without BOM so the .env parses cleanly.
  writeFileSync(ENV_PATH, out.join("\r\n"), { encoding: "utf8" });
}

const env = readEnv();
const clientId = env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
if (!clientId || !clientSecret) {
  console.error(
    "Fill GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first, then re-run.",
  );
  process.exit(1);
}

const oauth2 = new googleAuth.OAuth2(clientId, clientSecret, REDIRECT_URI);
const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [SCOPE],
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT_URI);
    const code = url.searchParams.get("code");
    const err = url.searchParams.get("error");
    if (err) {
      res.end(`Authorization failed: ${err}. You can close this tab.`);
      console.error("Authorization failed:", err);
      server.close();
      process.exit(1);
    }
    if (!code) {
      res.end("Waiting for authorization…");
      return;
    }
    res.end("Success! Refresh token saved. You can close this tab.");
    const { tokens } = await oauth2.getToken(code);
    server.close();
    if (!tokens.refresh_token) {
      console.error(
        "\nNo refresh_token returned. Revoke the app's access at " +
          "https://myaccount.google.com/permissions and run this again " +
          "(it forces a fresh consent).",
      );
      process.exit(1);
    }
    writeRefreshToken(tokens.refresh_token);
    console.log("\n✅ GOOGLE_REFRESH_TOKEN written to .env. You're done.");
    console.log("   Restart the worker: npx trigger.dev@latest dev");
    process.exit(0);
  } catch (e) {
    console.error("Error exchanging code:", e?.message ?? e);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log("\nOpen this URL in your browser and approve access:\n");
  console.log(authUrl + "\n");
  // Best-effort auto-open on Windows.
  exec(`start "" "${authUrl}"`, () => {});
});

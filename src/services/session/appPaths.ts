import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { WebSocket } from "ws";
import { Session } from "@google/genai";
import { ZOYA_CONFIG_DIR } from "./sessionStorage.js";
import { notifyClient } from "../tools/toolNotifications.js";
import { launchApplication as launchApplicationOS } from "../windows/index.js";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// App location memory: Windows can only launch an app "by name" (start
// "appname") if that app is on PATH or registered under App Paths — most
// installed software isn't. Instead of that being a dead end, Aanya can be
// told the exact .exe path once and remember it forever after.
// ---------------------------------------------------------------------------
export const APP_PATHS_FILE = path.join(ZOYA_CONFIG_DIR, "app-paths.json");
export let knownAppPaths: Record<string, string> = {};

export async function initAppPaths(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(APP_PATHS_FILE, "utf-8");
    knownAppPaths = JSON.parse(raw);
    console.log(`[APP PATHS] Loaded ${Object.keys(knownAppPaths).length} remembered app path(s)`);
  } catch {
    // No saved app paths yet — that's fine, nothing to load.
  }
  return knownAppPaths;
}

export function getKnownAppPaths(): Record<string, string> {
  return knownAppPaths;
}

export async function saveAppPath(name: string, appPath: string) {
  knownAppPaths[name.toLowerCase().trim()] = appPath;
  try {
    await fs.writeFile(APP_PATHS_FILE, JSON.stringify(knownAppPaths, null, 2), "utf-8");
  } catch (err) {
    console.error("[APP PATHS] Failed to persist:", err);
  }
}

// App names are launched via a shell command too — keep this to a safe,
// plain-text character set so a misheard/garbled voice command can't smuggle
// in shell operators.
export function isSafeAppName(name: string): boolean {
  return /^[a-zA-Z0-9 ._-]{1,100}$/.test(name);
}

// Builds the platform-appropriate command to launch an app, preferring a
// remembered exact .exe path over a raw name whenever one is known.
export function buildLaunchCmd(appName: string): string {
  const remembered = knownAppPaths[appName.toLowerCase().trim()];
  if (remembered) {
    console.log(`[APP LAUNCH] Using remembered path for "${appName}": ${remembered}`);
    // Quoting both title and path handles spaces in "Program Files" etc.
    return `start "" "${remembered}"`;
  }
  const platform = process.platform;
  if (platform === "win32") {
    // start "" "name" handles names with spaces (e.g. "Google Chrome")
    return `start "" "${appName}"`;
  }
  if (platform === "darwin") {
    return `open -a "${appName}"`;
  }
  return `xdg-open "${appName}"`;
}

export async function handleRememberAppLocation(call: any, session: Session, clientWs: WebSocket) {
  const appName = String(call.args?.appName || "").trim();
  const rawPath = String(call.args?.path || "").trim();

  if (!appName || !rawPath) {
    session.sendToolResponse({
      functionResponses: [{ id: call.id, name: call.name, response: { result: "error", message: "Both appName and path are required." } }]
    });
    notifyClient(clientWs, call, `Couldn't save path — missing info`);
    return;
  }

  // Basic sanity check: strip surrounding quotes if the user pasted a path with them
  const cleanedPath = rawPath.replace(/^["']|["']$/g, "");

  await saveAppPath(appName, cleanedPath);
  console.log(`[APP PATHS] Saved: "${appName}" -> "${cleanedPath}"`);

  session.sendToolResponse({
    functionResponses: [{
      id: call.id,
      name: call.name,
      response: {
        result: "ok",
        message: `Saved! From now on, asking to open "${appName}" will launch directly from "${cleanedPath}". Confirm this to the user warmly in your own words, and offer to open it right now.`
      }
    }]
  });
  notifyClient(clientWs, call, `Remembered path for ${appName}`);
}

export async function handleOpenApplication(call: any, session: Session, clientWs: WebSocket) {
  const appName = String(call.args?.appName || "");

  if (!isSafeAppName(appName)) {
    console.warn(`[OPEN APP] Rejected unsafe app name: "${appName}"`);
    session.sendClientContent({
      turns: `(System note: opening "${appName}" was requested, but the name looked invalid, so nothing was launched. Let them know briefly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Couldn't open that app`);
    return;
  }

  try {
    // First, try our smart Windows application manager
    console.log(`[OPEN APP] Attempting to launch/focus "${appName}" via Windows Application Manager...`);
    const winAppResult = await launchApplicationOS(appName);

    if (winAppResult.success) {
      console.log(`[OPEN APP] Successfully handled "${appName}": ${winAppResult.message}`);
      session.sendClientContent({
        turns: `(System note: ${winAppResult.message} Let the user know warmly and briefly.)`,
        turnComplete: true
      });
      notifyClient(clientWs, call, winAppResult.action === "focused_existing" ? `Focused ${appName}` : `Opened ${appName}`);
      return;
    }

    // Fallback: If not handled by Windows Application Manager, try remembered path or shell command
    const cmd = buildLaunchCmd(appName);
    console.log(`[OPEN APP] Launch fallback command for "${appName}": ${cmd}`);
    await execAsync(cmd);
    console.log(`[OPEN APP] Launched: "${appName}"`);
    session.sendClientContent({
      turns: `(System note: launched ${appName} on their PC.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Opened ${appName}`);
  } catch (err: any) {
    console.error(`[OPEN APP] Failed to launch "${appName}":`, err);

    // If we failed and there's no remembered path, give Gemini specific
    // instructions to ask the user for the .exe path so it never happens again
    const hasRemembered = Boolean(knownAppPaths[appName.toLowerCase().trim()]);
    const advice = hasRemembered
      ? `The saved path for "${appName}" failed to launch. Let the user know the path might have changed and ask for the new one.`
      : `Windows couldn't find "${appName}" by name alone. Ask the user for its exact .exe location (tell them they can right-click the app's desktop shortcut, go to Properties, and copy the "Target" field) and say you'll remember it so it opens instantly next time.`;

    session.sendClientContent({
      turns: `(System note: launching "${appName}" failed. ${advice})`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Couldn't find ${appName}`);
  }
}

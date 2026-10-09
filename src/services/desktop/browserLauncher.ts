import { exec } from "child_process";
import { promisify } from "util";
import { WebSocket } from "ws";
import { Session } from "@google/genai";
import { focusTargetWindow } from "./targetWindow.js";
import { notifyClient } from "../tools/toolNotifications.js";
import { launchApplication as launchApplicationOS } from "../windows/applicationManager.js";
import { knownAppPaths, saveAppPath } from "../session/appPaths.js";

const execAsync = promisify(exec);

export function isSafeAppName(name: string): boolean {
  if (!name || name.length > 100) return false;
  if (/[\r\n;&|`$><]/.test(name)) return false;
  return true;
}

// Only allow http/https URLs with no characters that could break out of the
// double-quoted argument in the shell command below.
export function isSafeUrl(url: string): boolean {
  if (url.includes('"') || url.includes("`") || url.includes("$")) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// FIX (browser window not visibly appearing): this server runs as its own
// Node process (tsx server.ts), separate from the Electron app the user
// actually sees (main.js / the BrowserWindow loading localhost:3000).
// Shelling out to "start <url>" from here could open a browser window in a
// context the user never sees, or silently no-op. Electron's
// shell.openExternal is the OS-native, guaranteed-visible way to do this —
// but it only runs inside the Electron main process, which this server
// can't call directly. So instead we ask the already-connected client (the
// Electron renderer) to do it via IPC (see main.js: 'open-external-url'),
// over the same WebSocket already used for everything else.
//
// If the client socket isn't open for some reason, falls back to the old
// exec-based approach rather than doing nothing — this keeps things
// working for a plain-browser client with no window.electronAPI too.
export function openInSystemBrowser(url: string, clientWs: WebSocket): Promise<void> {
  if (clientWs.readyState === WebSocket.OPEN) {
    clientWs.send(JSON.stringify({ type: "openUrlInElectron", url }));
    return Promise.resolve();
  }

  console.warn(`[OPEN BROWSER] Client socket not open — falling back to shell exec for: ${url}`);
  const platform = process.platform;
  const cmd =
    platform === "win32" ? `start "" "${url}"` :
    platform === "darwin" ? `open "${url}"` :
    `xdg-open "${url}"`;
  return execAsync(cmd).then(() => {}).catch((err) => {
    console.warn(`[OPEN BROWSER] Shell open not available in headless container:`, err?.message || err);
  });
}

export async function handleOpenWebsite(call: any, session: Session, clientWs: WebSocket) {
  const url = String(call.args?.url || "");
  const siteName = call.args?.siteName ? String(call.args.siteName) : url;

  // FIX (confirm popup narrowed to sensitive actions only): this used to
  // run only after an on-screen confirm; openWebsite is no longer gated
  // (see TOOL_CONFIRMATION_LEVELS), so this now runs immediately when
  // Gemini calls it. Kept using sendRealtimeInput rather than switching to
  // sendToolResponse because the dispatch site already resolves the
  // original call.id with "ok, running now" right before calling this (see
  // the dispatch block) — same two-step shape as before, just without an
  // actual wait for user approval in between anymore.
  if (!isSafeUrl(url)) {
    console.warn(`[OPEN WEBSITE] Rejected unsafe/invalid URL: "${url}"`);
    session.sendClientContent({
      turns: `(System note: opening a link was requested, but it turned out invalid, so nothing opened. Let them know briefly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Couldn't open that link`);
    return;
  }

  try {
    await openInSystemBrowser(url, clientWs);
    console.log(`[OPEN WEBSITE] Asked Electron to open: ${url}`);

    // FIX (Aanya says "opened" but nothing visibly changes on screen):
    // confirmed via a standalone shell.openExternal test — the URL really
    // does open, but if a browser window already exists (even minimized
    // or in the background), the new tab opens INSIDE that existing
    // window without Windows ever bringing it to the front. The action
    // succeeds; the window visibility doesn't change. Reuses
    // focusTargetWindow() (originally built for clickAt/typeText/
    // scrollScreen) to explicitly bring the browser window forward after
    // giving the OS a moment to actually route the new tab into it.
    await new Promise((resolve) => setTimeout(resolve, 800));
    const focusedWindow = await focusTargetWindow();
    console.log(`[OPEN WEBSITE] Focused window after opening: ${focusedWindow?.title ?? "(none found — no other window open)"}`);

    // Automatically trigger screen sharing if client is connected so Aanya can see the live screen
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: "screenShareControl", action: "start" }));
      console.log(`[OPEN WEBSITE] Automatically triggered screen sharing for live view of ${siteName}`);
    }

    session.sendClientContent({
      turns: `(System note: ${siteName} is now open in their browser.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Opened ${siteName}`);
  } catch (err: any) {
    console.warn(`[OPEN WEBSITE] Could not complete open action:`, err);
    session.sendClientContent({
      turns: `(System note: opening ${siteName} could not complete automatically. Let them know warmly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Couldn't open ${siteName}`);
  }
}

export async function handleOpenApplication(call: any, session: Session, clientWs: WebSocket) {
  const appName = String(call.args?.appName || "").trim();

  if (!isSafeAppName(appName)) {
    console.warn(`[OPEN APP] Rejected invalid app name: "${appName}"`);
    session.sendClientContent({
      turns: `(System note: opening an app was requested, but the name wasn't valid, so nothing was launched. Let them know briefly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Didn't recognize that app name`);
    return;
  }

  try {
    const launchRes = await launchApplicationOS(appName, knownAppPaths);
    console.log(`[OPEN APP] Result for "${appName}": ${launchRes.action} (verified: ${launchRes.verified})`);

    if (launchRes.success) {
      // Automatically trigger screen sharing so Aanya can see the opened application
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "screenShareControl", action: "start" }));
        console.log(`[OPEN APP] Automatically triggered screen sharing for live view of ${appName}`);
      }

      session.sendClientContent({
        turns: `(System note: ${launchRes.message})`,
        turnComplete: true
      });
      notifyClient(clientWs, call, launchRes.message);
      return;
    }

    // Genuinely can't find or launch it — ask to be taught the exact path once.
    console.warn(`[OPEN APP] Could not launch '${appName}':`, launchRes.error || "Not found");
    session.sendClientContent({
      turns: `(System note: "${appName}" could not be found or launched automatically. Ask the user for the exact .exe file location (e.g. by right-clicking its shortcut → Properties → Target), then call rememberAppLocation with that exact path so it opens instantly every time after this.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Couldn't find "${appName}" — tell me its exact path`);
  } catch (err: any) {
    console.error(`[OPEN APP] Failed to launch '${appName}':`, err?.message || err);
    session.sendClientContent({
      turns: `(System note: "${appName}" could not be launched: ${err?.message || err}.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Couldn't launch "${appName}"`);
  }
}

export async function handleRememberAppLocation(call: any, session: Session, clientWs: WebSocket) {
  const appName = String(call.args?.appName || "").trim();
  const appPath = String(call.args?.path || "").trim();

  if (!appName || !appPath) {
    session.sendToolResponse({
      functionResponses: [{ id: call.id, name: call.name, response: { result: "error", message: "Missing app name or path" } }]
    });
    notifyClient(clientWs, call, `Couldn't save that`);
    return;
  }

  await saveAppPath(appName, appPath);
  console.log(`[APP PATHS] Remembered "${appName}" -> ${appPath}`);
  session.sendToolResponse({
    functionResponses: [{ id: call.id, name: call.name, response: { result: "ok" } }]
  });
  notifyClient(clientWs, call, `Got it — remembered where ${appName} is`);
}

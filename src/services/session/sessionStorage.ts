import path from "path";
import os from "os";
import fs from "fs/promises";

// ---------------------------------------------------------------------------
// Part 4: persist the Gemini session-resumption handle to disk (not just
// server memory), so Aanya's conversation memory survives a full server
// restart too — not only client reconnects/page refreshes.
// Safe migration from ~/.zoya to ~/.aanya
// ---------------------------------------------------------------------------
export const AANYA_CONFIG_DIR = path.join(os.homedir(), ".aanya");
export const LEGACY_ZOYA_CONFIG_DIR = path.join(os.homedir(), ".zoya");
export const ZOYA_CONFIG_DIR = AANYA_CONFIG_DIR;

export const SESSION_FILE = path.join(AANYA_CONFIG_DIR, "session.json");

let latestResumptionHandle: string | undefined = undefined;

export async function initSessionStorage(): Promise<string | undefined> {
  await fs.mkdir(AANYA_CONFIG_DIR, { recursive: true });
  try {
    const legacyConfigStat = await fs.stat(LEGACY_ZOYA_CONFIG_DIR).catch(() => null);
    if (legacyConfigStat?.isDirectory()) {
      const legacyFiles = await fs.readdir(LEGACY_ZOYA_CONFIG_DIR);
      for (const f of legacyFiles) {
        const src = path.join(LEGACY_ZOYA_CONFIG_DIR, f);
        const dest = path.join(AANYA_CONFIG_DIR, f);
        const destStat = await fs.stat(dest).catch(() => null);
        if (!destStat) {
          await fs.copyFile(src, dest).catch(() => null);
        }
      }
    }
  } catch (migErr) {
    console.warn('[Migration] Non-fatal legacy .zoya config migration note:', migErr);
  }

  // Gemini Live server-side sessions are ephemeral and do not survive across process restarts.
  // Always discard and clear handles on server startup to prevent code 1011 rejection.
  latestResumptionHandle = undefined;
  await clearResumptionHandle();
  console.log("[SESSION RESUMPTION] Initialized clean session state for fresh connections.");
  return undefined;
}

export function getLatestResumptionHandle(): string | undefined {
  return latestResumptionHandle;
}

export const getResumptionHandle = getLatestResumptionHandle;

export function setLatestResumptionHandleMemory(handle: string | undefined): void {
  latestResumptionHandle = handle;
}

export async function saveResumptionHandle(handle: string): Promise<void> {
  latestResumptionHandle = handle;
  try {
    await fs.writeFile(SESSION_FILE, JSON.stringify({ resumptionHandle: handle, savedAt: Date.now() }), "utf-8");
  } catch (err) {
    console.error("[SESSION RESUMPTION] Failed to persist handle to disk:", err);
  }
}

export async function clearResumptionHandle(): Promise<void> {
  latestResumptionHandle = undefined;
  try {
    await fs.writeFile(SESSION_FILE, JSON.stringify({ resumptionHandle: null, savedAt: Date.now() }), "utf-8");
  } catch (err) {
    console.error("[SESSION RESUMPTION] Failed to clear persisted handle:", err);
  }
}

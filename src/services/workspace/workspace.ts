import path from "path";
import os from "os";
import fs from "fs/promises";
import { WebSocket } from "ws";
import { Session } from "@google/genai";
import { notifyClient, notifyChatFileCreated } from "../tools/toolNotifications.js";
import { openInSystemBrowser } from "../desktop/browserLauncher.js";

// ---------------------------------------------------------------------------
// Aanya's own folder for anything she creates on your PC (files, code, notes).
// Kept separate from system folders on purpose — even if a voice command is
// misheard/misunderstood, the blast radius stays inside this one folder.
// Safe migration: ensure ~/AanyaFiles exists. If ~/ZoyaFiles already existed,
// copy files non-destructively so no existing user data is ever lost.
// ---------------------------------------------------------------------------
export const AANYA_WORKSPACE = path.join(os.homedir(), "AanyaFiles");
export const LEGACY_ZOYA_WORKSPACE = path.join(os.homedir(), "ZoyaFiles");
export const ZOYA_WORKSPACE = AANYA_WORKSPACE;

export async function initWorkspace(): Promise<void> {
  await fs.mkdir(AANYA_WORKSPACE, { recursive: true });
  try {
    const legacyStat = await fs.stat(LEGACY_ZOYA_WORKSPACE).catch(() => null);
    if (legacyStat?.isDirectory()) {
      const legacyFiles = await fs.readdir(LEGACY_ZOYA_WORKSPACE);
      for (const f of legacyFiles) {
        const src = path.join(LEGACY_ZOYA_WORKSPACE, f);
        const dest = path.join(AANYA_WORKSPACE, f);
        const destStat = await fs.stat(dest).catch(() => null);
        if (!destStat) {
          await fs.copyFile(src, dest).catch(() => null);
        }
      }
    }
  } catch (migErr) {
    console.warn('[Migration] Non-fatal legacy ZoyaFiles migration note:', migErr);
  }
  console.log(`Aanya workspace folder ready at: ${AANYA_WORKSPACE}`);
}

// Resolves any filename/folder name Gemini gives us to a path that is
// GUARANTEED to stay inside ZOYA_WORKSPACE — supports nested subfolders
// (e.g. "projects/app.py") while still blocking traversal attempts like
// "../../Windows/whatever" or an absolute "C:\..." path.
export function resolveWorkspacePath(relativePath: string): string {
  const workspaceRoot = path.resolve(ZOYA_WORKSPACE);
  const cleaned = relativePath
    .replace(/^[/\\]+/, "")            // strip leading slashes
    .replace(/^[A-Za-z]:[/\\]*/, "");  // strip a Windows drive letter if present
  const resolved = path.resolve(workspaceRoot, cleaned);
  if (resolved !== workspaceRoot && !resolved.startsWith(workspaceRoot + path.sep)) {
    throw new Error("That path would go outside Aanya's workspace folder");
  }
  return resolved;
}

export function isWorkspaceFilePath(filePath: string): boolean {
  const workspaceRoot = path.resolve(ZOYA_WORKSPACE);
  const resolved = path.resolve(filePath);
  return resolved.startsWith(workspaceRoot + path.sep);
}

export const VIEWABLE_WORKSPACE_EXTENSIONS = new Set([
  "txt", "md", "json", "js", "jsx", "ts", "tsx", "css", "scss", "sass", "html", "xml", "yaml", "yml", "py", "java", "c", "cpp", "cs", "go", "rs", "php", "sql", "sh", "bat", "ps1", "csv", "env", "example",
]);

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export function isViewableWorkspaceFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  const ext = path.extname(base).replace(/^\./, "").toLowerCase();
  return VIEWABLE_WORKSPACE_EXTENSIONS.has(ext) || base === ".env.example" || base.endsWith(".env.example");
}

export async function handleCreateFile(call: any, session: Session, clientWs: WebSocket) {
  try {
    const filename = String(call.args?.filename || "untitled.txt");
    const content = String(call.args?.content ?? "");
    const filePath = resolveWorkspacePath(filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    console.log(`[CREATE FILE] Saved: ${filePath}`);
    session.sendToolResponse({
      functionResponses: [{
        id: call.id,
        name: call.name,
        response: { result: "ok", path: filePath }
      }]
    });
    notifyChatFileCreated(clientWs, path.basename(filePath), filePath, "file", Buffer.byteLength(content, "utf-8"));
  } catch (err: any) {
    console.error("[CREATE FILE] Failed:", err);
    session.sendToolResponse({
      functionResponses: [{
        id: call.id,
        name: call.name,
        response: { result: "error", message: err?.message || String(err) }
      }]
    });
    notifyClient(clientWs, call, `Couldn't create that file`);
  }
}

export async function handleCreateFolder(call: any, session: Session, clientWs: WebSocket) {
  try {
    const folderName = String(call.args?.folderName || "New Folder");
    const folderPath = resolveWorkspacePath(folderName);
    await fs.mkdir(folderPath, { recursive: true });
    console.log(`[CREATE FOLDER] Created: ${folderPath}`);
    session.sendToolResponse({
      functionResponses: [{
        id: call.id,
        name: call.name,
        response: { result: "ok", path: folderPath }
      }]
    });
    notifyChatFileCreated(clientWs, path.basename(folderPath), folderPath, "folder");
  } catch (err: any) {
    console.error("[CREATE FOLDER] Failed:", err);
    session.sendToolResponse({
      functionResponses: [{
        id: call.id,
        name: call.name,
        response: { result: "error", message: err?.message || String(err) }
      }]
    });
    notifyClient(clientWs, call, `Couldn't create that folder`);
  }
}

export async function handleSearchWeb(call: any, session: Session, clientWs: WebSocket) {
  const query = String(call.args?.query || "");
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  try {
    await openInSystemBrowser(url, clientWs);
    console.log(`[SEARCH WEB] Asked Electron to open: ${url}`);
    session.sendToolResponse({
      functionResponses: [{
        id: call.id,
        name: call.name,
        response: { result: "ok", url }
      }]
    });
    notifyClient(clientWs, call, `Searching: ${query}`);
  } catch (err: any) {
    console.error(`[SEARCH WEB] Failed:`, err);
    session.sendToolResponse({
      functionResponses: [{ id: call.id, name: call.name, response: { result: "error", message: "Could not open the browser" } }]
    });
    notifyClient(clientWs, call, `Couldn't open the search`);
  }
}

// FEATURE (open existing files on the PC by voice — "open my resume",
// "find that vacation photo"): searches only these common personal
// folders, not the whole filesystem — fast enough to search on every
// call, and keeps results relevant to what a user would actually mean by
// "my file" rather than surfacing something from deep in an unrelated
// system folder. A folder that doesn't exist on this PC (e.g. no Videos
// folder) is skipped silently rather than erroring.
export const SEARCHABLE_FOLDERS = ["Desktop", "Downloads", "Documents", "Pictures", "Videos", "Music"].map(
  (name) => path.join(os.homedir(), name)
);

export async function findFilesByName(query: string, maxResults: number = 8): Promise<string[]> {
  const matches: string[] = [];
  const lowerQuery = query.toLowerCase();

  async function scanDir(dir: string, depth: number): Promise<void> {
    if (matches.length >= maxResults || depth > 2) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // Folder doesn't exist or isn't readable — just skip it.
    }
    for (const entry of entries) {
      if (matches.length >= maxResults) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await scanDir(fullPath, depth + 1);
      } else if (entry.name.toLowerCase().includes(lowerQuery)) {
        matches.push(fullPath);
      }
    }
  }

  for (const folder of SEARCHABLE_FOLDERS) {
    await scanDir(folder, 0);
  }

  return matches;
}

export async function handleFindFile(call: any, session: Session, clientWs: WebSocket) {
  const query = String(call.args?.query || "").trim();
  if (!query) {
    session.sendToolResponse({
      functionResponses: [{ id: call.id, name: call.name, response: { result: "error", message: "No search text was given." } }]
    });
    notifyClient(clientWs, call, `Couldn't search — no query given`);
    return;
  }

  console.log(`[FIND FILE] Searching Desktop/Downloads/Documents/Pictures/Videos/Music for: "${query}"`);
  try {
    const matches = await findFilesByName(query);
    console.log(`[FIND FILE] Found ${matches.length} match(es) for "${query}"`);
    session.sendToolResponse({
      functionResponses: [{
        id: call.id,
        name: call.name,
        response: {
          result: "ok",
          message: matches.length === 0
            ? `No files matching "${query}" were found in Desktop, Downloads, Documents, Pictures, Videos, or Music. Tell the user briefly, and ask if it's saved somewhere else.`
            : `Found these file path(s): ${JSON.stringify(matches)}. If there's exactly one, go ahead and open it with openFile. If there's more than one, read out just the short file names (not the full paths) and ask which one the user means before opening.`
        }
      }]
    });
    notifyClient(clientWs, call, matches.length === 0 ? `No files found for "${query}"` : `Found ${matches.length} file(s) for "${query}"`);
  } catch (err: any) {
    console.error(`[FIND FILE] Failed:`, err);
    session.sendToolResponse({
      functionResponses: [{ id: call.id, name: call.name, response: { result: "error", message: "The file search failed unexpectedly. Let the user know briefly." } }]
    });
    notifyClient(clientWs, call, `File search failed`);
  }
}

export async function handleOpenFile(call: any, session: Session, clientWs: WebSocket) {
  const filePath = String(call.args?.path || "").trim();
  if (!filePath) {
    session.sendToolResponse({
      functionResponses: [{ id: call.id, name: call.name, response: { result: "error", message: "No file path was given." } }]
    });
    notifyClient(clientWs, call, `Couldn't open — no path given`);
    return;
  }

  // Actually opening happens client-side via Electron's shell.openPath (see
  // main.js: 'open-file-path', LiveSession.ts: 'openFileInElectron') — same
  // fire-and-tell-Gemini-it's-done pattern as handleOpenWebsite/
  // openInSystemBrowser above, which also doesn't wait for a round-trip
  // success confirmation before responding.
  console.log(`[OPEN FILE] Asking Electron to open: ${filePath}`);
  if (clientWs.readyState === WebSocket.OPEN) {
    clientWs.send(JSON.stringify({ type: "openFileInElectron", path: filePath }));
  }
  session.sendToolResponse({
    functionResponses: [{ id: call.id, name: call.name, response: { result: "ok", message: "Opening now. Let the user know briefly." } }]
  });
  notifyClient(clientWs, call, `Opening file`);
}

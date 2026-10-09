import { Region, Window, getActiveWindow, getWindows, isDesktopSupported } from "./nutjs.js";

// FIX (actions report success but nothing happens on screen): mouse
// clicks, keyboard typing, and scroll are all OS-level -- they go to
// whichever window currently has OS focus, which has nothing to do with
// what screen-sharing happens to be showing. If the Aanya/Electron window
// itself is the focused window (very likely, since the user is looking
// at it to say "allow"), every clickAt/typeText/scrollScreen was
// silently landing inside Aanya's own app window instead of the browser
// -- explaining why [CLICK AT]/[TYPE TEXT]/[SCROLL] all logged success
// (the OS really did perform the action, just on the wrong window) while
// the browser stayed completely unaffected. Also used by
// handleOpenWebsite below: shell.openExternal genuinely opens the URL,
// but if a browser window already exists (even minimized/background),
// the new tab opens INSIDE it without Windows bringing it to the front
// -- confirmed via a standalone shell.openExternal test outside this
// codebase entirely.
//
// FIX (focusing "Program Manager" instead of the browser): the first
// version of this function only excluded titles containing "aanya", which
// let Windows OS shell windows through -- confirmed via terminal log
// showing "[OPEN WEBSITE] Focused window after opening: Program Manager".
// "Program Manager" is the technical name of the Windows desktop itself.
export const WINDOW_TITLE_DENYLIST = [
  "program manager",  // the Windows desktop itself
  "task switching",   // Alt-Tab's own overlay window
  "task view",        // Windows 11's Task View overlay
  "windows input experience", // touch keyboard / IME shell window
];

// FIX (focusing some other open app instead of the browser): a denylist
// alone is fragile -- confirmed via a second terminal log showing "[OPEN
// WEBSITE] Focused window after opening: My Google AI Studio App", some
// unrelated Electron/web app the user happened to have open, which isn't
// Aanya and isn't a shell window so it passed the old filter and got
// focused instead of Chrome. A denylist can only ever cover known-bad
// titles seen so far -- it breaks again the moment ANY other app is open.
// Actively looking for browser windows by name (an allowlist) is far more
// robust: it doesn't matter what else is running on the user's system,
// only whether something that looks like a browser is found. Covers the
// common ones; extend this list if the user's default browser isn't here.
export const BROWSER_WINDOW_KEYWORDS = [
  "google chrome",
  "chrome",
  "microsoft edge",
  "msedge",
  "firefox",
  "mozilla firefox",
  "brave",
  "opera",
];

export function isUsableTargetWindow(title: string | null | undefined): boolean {
  if (!title || !title.trim()) {
    return false;
  }
  const normalized = title.trim().toLowerCase();
  // FIX: exact match, not substring. Aanya's window title is always
  // EXACTLY "Aanya" (see main.js + index.html) with nothing dynamic ever
  // appended to it, so exact match is sufficient to exclude it -- and
  // unlike a substring check, it won't also wrongly exclude a real browser
  // window whose title happens to contain "aanya" (e.g. the user searches
  // "aanya voice assistant" in Chrome). Matches how WINDOW_TITLE_DENYLIST
  // below is already checked (exact match).
  if (normalized === "aanya" || normalized.startsWith("aanya -") || normalized.startsWith("aanya ")) {
    return false;
  }
  // Exclude background screen recording/streaming software (OBS Studio) from generic click/focus fallback
  if (normalized.includes("obs studio") || normalized.startsWith("obs 2") || normalized.startsWith("obs 3")) {
    return false;
  }
  return !WINDOW_TITLE_DENYLIST.some((denied) => normalized === denied);
}

export function isBrowserWindow(title: string | null | undefined): boolean {
  if (!isUsableTargetWindow(title)) {
    return false;
  }
  const normalized = title!.trim().toLowerCase();
  return BROWSER_WINDOW_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

// Finds a browser window specifically (preferred, since almost every
// click/type/scroll/openWebsite call is meant for the browser) and brings
// it to the front. Falls back to the first other usable (non-Aanya,
// non-shell) window only if no browser window is found at all, so opening
// some other kind of app still works reasonably rather than refusing
// outright. Returns null (not a thrown error) when nothing usable is
// open, since that's a legitimate state callers handle by telling the
// user clearly instead of crashing.
//
// FIX (scroll landing in the wrong place): this used to return only the
// window's title. That was enough for clickAt (which already gets an
// explicit x/y) and typeText (keyboard input follows OS focus, so
// focusing was genuinely sufficient) -- but never enough for scrollScreen.
// mouse.scrollUp/Down/Left/Right() send an OS-level scroll-wheel event,
// which on Windows (and most desktop apps) goes to whichever window is
// under the MOUSE CURSOR at that instant, not whichever window merely has
// OS "focus". handleScroll was focusing the right window and then
// scrolling without ever moving the mouse into it -- so the scroll landed
// wherever the cursor physically happened to already be sitting. Returning
// `region` (left/top/width/height) too lets handleScroll move the mouse
// to that window's center before scrolling. Callers that only need the
// title (handleClickAt, handleTypeText) just destructure `.title`.
export async function focusTargetWindow(): Promise<{ title: string; region: Region } | null> {
  if (!isDesktopSupported) {
    return null;
  }
  try {
    const active = await getActiveWindow().catch(() => null);
    if (!active) {
      return null;
    }
    const activeTitle = (await active.title.catch(() => "")) || "";

    // Already focused on a browser -- nothing to do, avoids an
    // unnecessary focus-switch flicker.
    if (isBrowserWindow(activeTitle)) {
      const region = await active.region.catch(() => ({ left: 0, top: 0, width: 1920, height: 1080 }));
      return { title: activeTitle, region };
    }

    const allWindows = (await getWindows().catch(() => [])) || [];

    // First pass: look specifically for a browser window.
    for (const win of allWindows) {
      const title = (await win.title.catch(() => "")) || "";
      if (isBrowserWindow(title)) {
        await win.focus().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 150));
        const region = await win.region.catch(() => ({ left: 0, top: 0, width: 1920, height: 1080 }));
        return { title, region };
      }
    }

    // No browser found at all -- fall back to any other usable window
    // (e.g. the user asked to interact with some non-browser app) rather
    // than refusing outright.
    if (isUsableTargetWindow(activeTitle)) {
      const region = await active.region.catch(() => ({ left: 0, top: 0, width: 1920, height: 1080 }));
      return { title: activeTitle, region };
    }
    for (const win of allWindows) {
      const title = (await win.title.catch(() => "")) || "";
      if (isUsableTargetWindow(title)) {
        await win.focus().catch(() => {});
        // Give the OS a moment to actually complete the focus switch
        // before the caller moves the mouse/types -- without this,
        // fast-following actions can still land on the window that's
        // mid-transition-out.
        await new Promise((resolve) => setTimeout(resolve, 150));
        const region = await win.region.catch(() => ({ left: 0, top: 0, width: 1920, height: 1080 }));
        return { title, region };
      }
    }

    return null;
  } catch (err) {
    console.warn("[WINDOW FOCUS] Could not find/focus a target window:", err);
    return null;
  }
}

// FIX (voice "minimize karo" sometimes maximizing/restoring the window
// instead): minimizeWindow used to reuse focusTargetWindow() above, which
// calls win.focus() on the target before sending a Win+Down shortcut. But
// .focus() on a window that is ALREADY minimized restores it first (that's
// how bringing a minimized window to the foreground works on Windows) --
// so a repeated "minimize karo" was silently un-minimizing the target
// right before minimizing it again, and Win+Down itself is context-
// sensitive (it restores a MAXIMIZED window to normal instead of
// minimizing on the first press), so the net visible result was
// inconsistent: sometimes the window flashed back to maximized/normal
// instead of going to the taskbar. nut-js's Window class exposes a direct,
// deterministic window.minimize() (confirmed in its own type
// declarations) that acts on the window HANDLE, not the keyboard shortcut
// -- it does not require the window to be focused/foreground first, so it
// never triggers this restore side effect no matter what state the window
// was already in. This finds the same target focusTargetWindow() would
// (browser preferred, any other non-Aanya/non-shell window as fallback)
// but returns the raw Window object and never calls .focus() on anything.
export async function findTargetWindowObject(): Promise<{ window: Window; title: string } | null> {
  if (!isDesktopSupported) {
    return null;
  }
  try {
    const active = await getActiveWindow().catch(() => null);
    if (!active) return null;
    const activeTitle = (await active.title.catch(() => "")) || "";

    if (isBrowserWindow(activeTitle)) {
      return { window: active, title: activeTitle };
    }

    const allWindows = (await getWindows().catch(() => [])) || [];

    for (const win of allWindows) {
      const title = (await win.title.catch(() => "")) || "";
      if (isBrowserWindow(title)) {
        return { window: win, title };
      }
    }

    if (isUsableTargetWindow(activeTitle)) {
      return { window: active, title: activeTitle };
    }
    for (const win of allWindows) {
      const title = (await win.title.catch(() => "")) || "";
      if (isUsableTargetWindow(title)) {
        return { window: win, title };
      }
    }

    return null;
  } catch (err) {
    console.warn("[WINDOW FIND] Could not find a target window:", err);
    return null;
  }
}

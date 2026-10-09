import { WebSocket } from "ws";
import { Session } from "@google/genai";
import { mouse, keyboard, Point, Button, isDesktopSupported } from "./nutjs.js";
import { focusTargetWindow } from "./targetWindow.js";
import { notifyClient } from "../tools/toolNotifications.js";

export type FrameResolution = {
  originalWidth: number;
  originalHeight: number;
  scaledWidth: number;
  scaledHeight: number;
};

// FIX (PC-wide click/scroll control): the image Gemini sees is downscaled
// (see ScreenSharer.ts, maxDimension = 800) to save bandwidth, so a click
// coordinate Gemini gives is in that downscaled space, not real screen
// pixels. Every incoming screen frame refreshes this with the real vs. scaled size,
// so clickAt can scale Gemini's coordinates back up before actually moving the mouse.
//
// FIX (click landing near but not on target): Gemini Live resizes every
// incoming video frame internally to its own fixed resolution before
// reasoning about it, regardless of the exact scaledWidth/scaledHeight we
// sent in the frame metadata. So a raw-pixel coordinate Gemini returns is
// relative to THAT internal resize, not the scaledWidth/scaledHeight we
// told the server about -- scaling against our own sent size was scaling
// from the wrong base, which is why clicks landed close to the target but
// not on it. A 0-1000 normalized coordinate sidesteps this: it doesn't
// matter what resolution Gemini resized the frame to internally, "quarter
// of the way across" is the same fraction either way. clickAt's tool
// description tells Gemini to think in this 0-1000 space
// instead of raw image pixels.
export function scaleToRealCoordinates(
  normalizedX: number,
  normalizedY: number,
  frameResolution: FrameResolution | null
): { x: number; y: number } | null {
  if (!frameResolution) {
    return null;
  }
  const { originalWidth, originalHeight } = frameResolution;
  if (originalWidth <= 0 || originalHeight <= 0) {
    return null;
  }
  const clampedX = Math.max(0, Math.min(1000, normalizedX));
  const clampedY = Math.max(0, Math.min(1000, normalizedY));
  return {
    x: Math.round((clampedX / 1000) * originalWidth),
    y: Math.round((clampedY / 1000) * originalHeight),
  };
}

export async function handleClickAt(
  call: any,
  session: Session,
  clientWs: WebSocket,
  frameResolution: FrameResolution | null
) {
  const scaledX = Number(call.args?.x);
  const scaledY = Number(call.args?.y);
  const doubleClick = Boolean(call.args?.doubleClick);

  if (!Number.isFinite(scaledX) || !Number.isFinite(scaledY)) {
    session.sendClientContent({
      turns: `(System note: the click coordinates were invalid, so nothing was clicked. Let them know briefly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Couldn't click — bad coordinates`);
    return;
  }

  const real = scaleToRealCoordinates(scaledX, scaledY, frameResolution);
  if (!real) {
    console.warn(`[CLICK AT] No screen frame received yet — can't scale coordinates (${scaledX}, ${scaledY})`);
    session.sendClientContent({
      turns: `(System note: the click was requested, but the user's screen isn't being shared right now, so there's no way to know where on the real screen that is. Ask them to turn on screen sharing first, briefly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Can't click — screen sharing is off`);
    return;
  }

  if (!isDesktopSupported) {
    session.sendClientContent({
      turns: `(System note: Desktop mouse and keyboard control is available when running in the native desktop app. In this browser session, let them know gently.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Desktop control requires desktop app`);
    return;
  }

  const focusedWindow = await focusTargetWindow();
  console.log(`[CLICK AT] Focused window before click: ${focusedWindow?.title ?? "(none found — no other window open)"}`);

  if (!focusedWindow) {
    session.sendClientContent({
      turns: `(System note: the click was requested, but there's no other window open to click into — only Aanya's own window is open. Ask them to open the browser or app they want clicked, briefly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Can't click — no other window is open`);
    return;
  }

  try {
    await mouse.setPosition(new Point(real.x, real.y));
    if (doubleClick) {
      await mouse.doubleClick(Button.LEFT);
    } else {
      await mouse.leftClick();
    }
    console.log(`[CLICK AT] Clicked at real screen (${real.x}, ${real.y}) from scaled (${scaledX}, ${scaledY})`);
    session.sendClientContent({
      turns: `(System note: the click was performed. Let them know briefly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Clicked`);
  } catch (err: any) {
    console.warn(`[CLICK AT] Mouse action skipped or not supported:`, err);
    session.sendClientContent({
      turns: `(System note: clicking the screen isn't available in this environment. Let them know briefly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Click not supported here`);
  }
}

export async function handleTypeText(call: any, session: Session, clientWs: WebSocket) {
  const text = String(call.args?.text ?? "");

  if (!text) {
    notifyClient(clientWs, call, `Nothing to type`);
    return;
  }

  if (!isDesktopSupported) {
    session.sendClientContent({
      turns: `(System note: Direct keyboard typing into other desktop windows is available in the native desktop app. In this browser session, let them know gently.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Desktop typing requires desktop app`);
    return;
  }

  const focusedWindow = await focusTargetWindow();
  console.log(`[TYPE TEXT] Focused window before typing: ${focusedWindow?.title ?? "(none found — no other window open)"}`);

  if (!focusedWindow) {
    session.sendClientContent({
      turns: `(System note: typing was requested, but there's no other window open to type into — only Aanya's own window is open. Ask them to open the browser or app they want typed into, briefly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Can't type — no other window is open`);
    return;
  }

  try {
    await keyboard.type(text);
    console.log(`[TYPE TEXT] Typed ${text.length} characters`);
    session.sendClientContent({
      turns: `(System note: the text was typed. Let them know briefly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Typed it`);
  } catch (err: any) {
    console.warn(`[TYPE TEXT] Keyboard action skipped or not supported:`, err);
    session.sendClientContent({
      turns: `(System note: typing isn't available in this environment. Let them know briefly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Typing not supported here`);
  }
}

export async function handleScroll(call: any, session: Session, clientWs: WebSocket) {
  const direction = String(call.args?.direction || "down").toLowerCase();
  const amount = Number(call.args?.amount) || 14;

  if (!isDesktopSupported) {
    session.sendClientContent({
      turns: `(System note: Direct window scrolling is available in the native desktop app. In this browser session, let them know gently.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Desktop scroll requires desktop app`);
    return;
  }

  const focusedWindow = await focusTargetWindow();
  console.log(`[SCROLL] Focused window before scrolling: ${focusedWindow?.title ?? "(none found — no other window open)"}`);

  if (!focusedWindow) {
    session.sendClientContent({
      turns: `(System note: scrolling was requested, but there's no other window open to scroll — only Aanya's own window is open. Ask them to open the browser or app they want scrolled, briefly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Can't scroll — no other window is open`);
    return;
  }

  try {
    // FIX (scroll landing in the wrong place): mouse.scrollUp/Down/Left/
    // Right() is an OS-level scroll-wheel event -- it goes to whichever
    // window is under the MOUSE CURSOR, not whichever window merely has
    // OS focus. Focusing the window (above) was never enough by itself;
    // the cursor has to actually be moved into it first, or the scroll
    // silently lands wherever the cursor was last sitting (often still
    // over Aanya's own window). The window's center is a safe point
    // that's always inside it regardless of size/position.
    const { left, top, width, height } = focusedWindow.region;
    const centerPoint = new Point(Math.round(left + width / 2), Math.round(top + height / 2));
    await mouse.setPosition(centerPoint);
    console.log(`[SCROLL] Moved cursor to window center (${centerPoint.x}, ${centerPoint.y}) before scrolling`);

    if (direction === "up") {
      await mouse.scrollUp(amount);
    } else if (direction === "left") {
      await mouse.scrollLeft(amount);
    } else if (direction === "right") {
      await mouse.scrollRight(amount);
    } else {
      await mouse.scrollDown(amount);
    }
    console.log(`[SCROLL] Scrolled ${direction} by ${amount}`);
    session.sendClientContent({
      turns: `(System note: the scroll was performed. Let them know briefly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Scrolled ${direction}`);
  } catch (err: any) {
    console.warn(`[SCROLL] Scroll action skipped or not supported:`, err);
    session.sendClientContent({
      turns: `(System note: scrolling isn't available in this environment. Let them know briefly.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Scroll not supported here`);
  }
}

// FEATURE (voice-triggered PC access): these two are NOT in
// TOOL_CONFIRMATION_LEVELS, so they run immediately when Gemini calls
// them (same dispatch pattern as handleCreateFile/handleSearchWeb) —
// matching the user's ask: no on-screen confirm popup for these, they
// should fire the instant the user asks by voice.
export async function handleStartPcAccess(
  call: any,
  session: Session,
  clientWs: WebSocket,
  onAccessChange?: (granted: boolean) => void
) {
  console.log(`[PC ACCESS] Start requested — asking client to begin screen sharing.`);
  if (onAccessChange) onAccessChange(true);
  if (clientWs.readyState === WebSocket.OPEN) {
    clientWs.send(JSON.stringify({ type: "screenShareControl", action: "start" }));
  }
  session.sendToolResponse({
    functionResponses: [{
      id: call.id,
      name: call.name,
      response: {
        result: "ok",
        message: `Screen sharing is starting now. Say exactly these words out loud, nothing else first: "Main aapka PC access le rahi hoon sir." Then wait for the user's next instruction.`
      }
    }]
  });
  notifyClient(clientWs, call, `PC access started`);
}

export async function handleStopPcAccess(
  call: any,
  session: Session,
  clientWs: WebSocket,
  onAccessChange?: (granted: boolean) => void
) {
  console.log(`[PC ACCESS] Stop requested — asking client to end screen sharing.`);
  if (onAccessChange) onAccessChange(false);
  if (clientWs.readyState === WebSocket.OPEN) {
    clientWs.send(JSON.stringify({ type: "screenShareControl", action: "stop" }));
  }
  session.sendToolResponse({
    functionResponses: [{
      id: call.id,
      name: call.name,
      response: {
        result: "ok",
        message: `Screen sharing has stopped. Let the user know their PC access has been given back, briefly, in your own words.`
      }
    }]
  });
  notifyClient(clientWs, call, `PC access stopped`);
}

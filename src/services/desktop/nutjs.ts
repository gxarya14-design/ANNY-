// Desktop automation (nut.js) requires native OS bindings and display libraries (libXtst).
// In headless container environments, gracefully fall back to stubs so the web app boots smoothly.
export interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Window {
  title: Promise<string>;
  region: Promise<Region>;
  focus: () => Promise<void>;
  minimize: () => Promise<void>;
}

export class DefaultPoint {
  constructor(public x: number, public y: number) {}
}

export let Point: any = DefaultPoint;
export let Button: any = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
export let Key: any = { LeftAlt: 1, F4: 2 };

export let mouse: any;
export let keyboard: any;

export let getWindows: () => Promise<Window[]>;
export let getActiveWindow: () => Promise<Window | null>;
export let isDesktopSupported = false;

try {
  const nut = await import("@nut-tree-fork/nut-js");
  mouse = nut.mouse;
  keyboard = nut.keyboard;
  Point = nut.Point || DefaultPoint;
  Button = nut.Button || Button;
  Key = nut.Key || Key;
  getWindows = nut.getWindows as any;
  getActiveWindow = nut.getActiveWindow as any;
  isDesktopSupported = true;
  console.log("[NUT-JS] Successfully initialized native desktop automation");
} catch (err: any) {
  isDesktopSupported = false;
  console.warn("[NUT-JS] Native desktop automation not available in this environment (headless container / missing display libraries). Using web-safe stubs.");
  const notSupported = (action: string) => async () => {
    console.warn(`[NUT-JS STUB] ${action} skipped (native desktop required)`);
    return;
  };
  mouse = {
    setPosition: notSupported("mouse.setPosition"),
    doubleClick: notSupported("mouse.doubleClick"),
    leftClick: notSupported("mouse.leftClick"),
    scrollUp: notSupported("mouse.scrollUp"),
    scrollDown: notSupported("mouse.scrollDown"),
    scrollLeft: notSupported("mouse.scrollLeft"),
    scrollRight: notSupported("mouse.scrollRight"),
  };
  keyboard = {
    pressKey: notSupported("keyboard.pressKey"),
    releaseKey: notSupported("keyboard.releaseKey"),
    type: notSupported("keyboard.type"),
  };
  getWindows = async () => [];
  getActiveWindow = async () => null;
}

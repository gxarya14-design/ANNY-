import { WebSocket } from "ws";
import { Session } from "@google/genai";
import {
  listWindows as listWindowsOS,
  minimizeWindow as minimizeWindowOS,
  maximizeWindow as maximizeWindowOS,
  restoreWindow as restoreWindowOS,
  focusWindow as focusWindowOS,
  closeWindow as closeWindowOS,
  switchWindow as switchWindowOS,
  listProcesses as listProcessesOS,
  closeApplication as closeApplicationOS,
  executeSystemControl as executeSystemControlOS,
} from "./index.js";
import { notifyClient } from "../tools/toolNotifications.js";

export async function handleControlWindow(call: any, session: Session, clientWs: WebSocket) {
  const action = String(call.args?.action || "minimize").toLowerCase();
  const target = call.args?.target ? String(call.args.target).trim() : undefined;

  try {
    let result: any;
    if (action === "minimize") {
      result = await minimizeWindowOS(target);
    } else if (action === "maximize") {
      result = await maximizeWindowOS(target);
    } else if (action === "restore") {
      result = await restoreWindowOS(target);
    } else if (action === "focus") {
      result = await focusWindowOS(target);
    } else if (action === "close") {
      result = await closeWindowOS(target);
    } else if (action === "switch") {
      result = await switchWindowOS();
    } else {
      result = {
        success: false,
        action,
        verified: false,
        message: `Unknown window action: "${action}". Valid actions are: minimize, maximize, restore, close, focus, switch.`
      };
    }

    console.log(`[CONTROL WINDOW] Action: ${action} | Target: ${target || "active"} | Success: ${result.success} | Verified: ${result.verified}`);
    session.sendClientContent({
      turns: `(System note: ${result.message})`,
      turnComplete: true
    });
    notifyClient(clientWs, call, result.message);
  } catch (err: any) {
    console.error(`[CONTROL WINDOW] Failed:`, err);
    session.sendClientContent({
      turns: `(System note: Window action "${action}" encountered an error: ${err?.message || err}.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Window action failed`);
  }
}

export async function handleListWindows(call: any, session: Session, clientWs: WebSocket) {
  try {
    const windows = await listWindowsOS();
    console.log(`[LIST WINDOWS] Found ${windows.length} window(s)`);
    if (windows.length === 0) {
      session.sendClientContent({
        turns: `(System note: No open desktop windows found right now.)`,
        turnComplete: true
      });
      notifyClient(clientWs, call, `No open windows found`);
      return;
    }

    const summary = windows.map((w, i) => `${i + 1}. ${w.processName}: "${w.title}" (${w.state}${w.isActive ? ", active" : ""})`).join("\n");
    session.sendClientContent({
      turns: `(System note: Here are the open desktop windows:\n${summary}\nShare this naturally and concisely with the user in your signature witty style.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Found ${windows.length} open window(s)`);
  } catch (err: any) {
    console.error(`[LIST WINDOWS] Failed:`, err);
    session.sendClientContent({
      turns: `(System note: Could not list windows: ${err?.message || err}.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Window listing failed`);
  }
}

export async function handleCloseApplication(call: any, session: Session, clientWs: WebSocket) {
  const appName = String(call.args?.appName || "").trim();
  const force = Boolean(call.args?.force);

  if (!appName) {
    session.sendClientContent({
      turns: `(System note: Closing was requested, but no application name was specified.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `No app name specified`);
    return;
  }

  try {
    const res = await closeApplicationOS(appName, force);
    console.log(`[CLOSE APP] Target: ${appName} | Success: ${res.success} | Verified: ${res.verified}`);
    session.sendClientContent({
      turns: `(System note: ${res.message})`,
      turnComplete: true
    });
    notifyClient(clientWs, call, res.message);
  } catch (err: any) {
    console.error(`[CLOSE APP] Failed:`, err);
    session.sendClientContent({
      turns: `(System note: Closing "${appName}" failed: ${err?.message || err}.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Close failed`);
  }
}

export async function handleListProcesses(call: any, session: Session, clientWs: WebSocket) {
  const filter = call.args?.filter ? String(call.args.filter).trim() : undefined;
  try {
    const procs = await listProcessesOS(filter);
    console.log(`[LIST PROCESSES] Found ${procs.length} process(es)`);
    if (procs.length === 0) {
      session.sendClientContent({
        turns: `(System note: No matching running processes found${filter ? ` for "${filter}"` : ""}. Tell the user briefly.)`,
        turnComplete: true
      });
      notifyClient(clientWs, call, `No matching processes found`);
      return;
    }

    const top = procs.slice(0, 8);
    const summary = top.map((p) => `- ${p.name} (PID: ${p.id}${p.title ? `, "${p.title}"` : ""}, ${p.memoryMB} MB RAM)`).join("\n");
    session.sendClientContent({
      turns: `(System note: Top running processes${filter ? ` matching "${filter}"` : ""}:\n${summary}\nSummarize briefly for the user.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Listed ${top.length} running processes`);
  } catch (err: any) {
    console.error(`[LIST PROCESSES] Failed:`, err);
    session.sendClientContent({
      turns: `(System note: Could not list processes: ${err?.message || err}.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Process listing failed`);
  }
}

export async function handleSystemControl(call: any, session: Session, clientWs: WebSocket) {
  const action = String(call.args?.action || "").trim();
  const value = call.args?.value;
  const confirmed = Boolean(call.args?.confirmed);

  if (!action) {
    session.sendClientContent({
      turns: `(System note: No system action specified.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `No action specified`);
    return;
  }

  try {
    const res = await executeSystemControlOS(action, value, confirmed);
    console.log(`[SYSTEM CONTROL] Action: ${action} | Success: ${res.success} | Verified: ${res.verified}`);
    session.sendClientContent({
      turns: `(System note: ${res.message})`,
      turnComplete: true
    });
    notifyClient(clientWs, call, res.message);
  } catch (err: any) {
    console.error(`[SYSTEM CONTROL] Failed:`, err);
    session.sendClientContent({
      turns: `(System note: System action "${action}" failed: ${err?.message || err}.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `System action failed`);
  }
}

export async function handleMinimizeWindow(call: any, session: Session, clientWs: WebSocket) {
  const target = call.args?.target ? String(call.args.target).trim() : undefined;
  try {
    const res = await minimizeWindowOS(target);
    console.log(`[MINIMIZE WINDOW] Target: ${target || "active"} | Success: ${res.success} | Verified: ${res.verified}`);
    session.sendClientContent({
      turns: `(System note: ${res.message})`,
      turnComplete: true
    });
    notifyClient(clientWs, call, res.message);
  } catch (err: any) {
    console.error(`[MINIMIZE WINDOW] Failed:`, err);
    session.sendClientContent({
      turns: `(System note: Minimizing window failed: ${err?.message || err}.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Minimize failed`);
  }
}

export async function handleCloseWindow(call: any, session: Session, clientWs: WebSocket) {
  const target = call.args?.target ? String(call.args.target).trim() : undefined;
  try {
    const res = await closeWindowOS(target);
    console.log(`[CLOSE WINDOW] Target: ${target || "active"} | Success: ${res.success} | Verified: ${res.verified}`);
    session.sendClientContent({
      turns: `(System note: ${res.message})`,
      turnComplete: true
    });
    notifyClient(clientWs, call, res.message);
  } catch (err: any) {
    console.error(`[CLOSE WINDOW] Failed:`, err);
    session.sendClientContent({
      turns: `(System note: Closing window failed: ${err?.message || err}.)`,
      turnComplete: true
    });
    notifyClient(clientWs, call, `Close failed`);
  }
}

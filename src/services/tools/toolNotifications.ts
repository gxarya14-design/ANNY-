import { WebSocket } from "ws";

export function notifyClient(clientWs: WebSocket, call: any, resultMessage: string) {
  if (clientWs.readyState === WebSocket.OPEN) {
    clientWs.send(JSON.stringify({
      type: "toolNotify",
      id: call.id,
      name: call.name,
      args: call.args,
      resultMessage
    }));
  }
}

// Part C: instead of a fleeting toast, file/folder creation gets its own
// persistent card in the chat transcript — like a "here's what I made" card.
export function notifyChatFileCreated(clientWs: WebSocket, name: string, fullPath: string, kind: "file" | "folder", size?: number) {
  if (clientWs.readyState === WebSocket.OPEN) {
    clientWs.send(JSON.stringify({
      type: "fileCreated",
      name,
      path: fullPath,
      kind,
      size,
    }));
  }
}

// Short, human-readable description of a pending sensitive tool call — shown
// in the on-screen confirmation card the client renders.
export function describeToolCall(name: string, args: any): string {
  if (name === "openWebsite") {
    return `Open ${args?.siteName || args?.url || "that link"}`;
  }
  if (name === "openApplication") {
    return `Open ${args?.appName || "that app"}`;
  }
  if (name === "clickAt") {
    return args?.doubleClick ? "Double-click on screen" : "Click on screen";
  }
  if (name === "typeText") {
    const preview = String(args?.text || "");
    return `Type: "${preview.length > 40 ? preview.slice(0, 40) + "…" : preview}"`;
  }
  if (name === "scrollScreen") {
    return `Scroll ${args?.direction || "down"}`;
  }
  if (name === "minimizeWindow") {
    return args?.target ? `Minimize ${args.target}` : `Minimize the window`;
  }
  if (name === "closeWindow") {
    return args?.target ? `Close ${args.target}` : `Close the window`;
  }
  if (name === "controlWindow") {
    const act = String(args?.action || "manage");
    return args?.target ? `${act} ${args.target}` : `${act} window`;
  }
  if (name === "listWindows") {
    return `List open windows`;
  }
  if (name === "closeApplication") {
    return `Close application ${args?.appName || ""}`;
  }
  if (name === "listProcesses") {
    return `List running processes`;
  }
  if (name === "systemControl") {
    return `System action: ${args?.action || ""}`;
  }
  if (name === "generateImage") {
    return `Generate image: "${(args?.prompt || "").slice(0, 30)}..."`;
  }
  return `Run ${name}`;
}

import express from "express";
import http from "http";
import path from "path";
import fs from "fs/promises";
import dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality, Session, MediaResolution } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Modular Services
import {
  handleClickAt,
  handleTypeText,
  handleScroll,
  handleStartPcAccess,
  handleStopPcAccess,
  handleOpenWebsite,
  handleOpenApplication,
  handleRememberAppLocation,
  FrameResolution,
} from "./src/services/desktop/index.js";

import {
  handleControlWindow,
  handleListWindows,
  handleCloseApplication,
  handleListProcesses,
  handleSystemControl,
  handleMinimizeWindow,
  handleCloseWindow,
} from "./src/services/windows/index.js";

import {
  AANYA_SYSTEM_INSTRUCTION,
  AANYA_TOOLS,
  describeToolCall,
  notifyClient,
} from "./src/services/tools/index.js";

import {
  initSessionStorage,
  getResumptionHandle,
  saveResumptionHandle,
  clearResumptionHandle,
  setLatestResumptionHandleMemory,
  initAppPaths,
} from "./src/services/session/index.js";

import {
  initWorkspace,
  handleCreateFile,
  handleCreateFolder,
  handleSearchWeb,
  handleFindFile,
  handleOpenFile,
  isWorkspaceFilePath,
  isViewableWorkspaceFile,
  MAX_ATTACHMENT_BYTES,
} from "./src/services/workspace/index.js";

import {
  initVideoUploads,
  setupVideoUploadRoutes,
  videoUploads,
  uploadVideoToGemini,
  removeVideoUpload,
} from "./src/services/video/index.js";

import {
  UploadedAttachment,
  extensionOf,
  mimeForAttachment,
  attachmentContext,
  describeAgentError,
  checkProactiveScreenComment,
  handleDelegateTask,
  activeSpecialistCount,
  runVideoOptimizationPipeline,
  runCodingPipeline,
  runSpecialistAgent,
} from "./src/services/agents/index.js";

import {
  handleGenerateImage,
  initImageService,
  WEB_IMAGE_DIR,
} from "./src/services/image/index.js";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Enable CORS for API & Video uploads
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Setup Chunked Resumable Video Uploads API
setupVideoUploadRoutes(app);

// Serve dynamically generated project images
initImageService().catch((err) => console.warn("[IMAGE SERVICE] Init warning:", err));
app.use("/generated-images", express.static(WEB_IMAGE_DIR));

// API Health Check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    model: "gemini-3.1-flash-live-preview",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Assistant Voice & Visual Config
app.get("/api/config", (_req, res) => {
  res.json({
    voices: ["Kore", "Aoede", "Puck", "Fenrir", "Zephyr"],
    defaultVoice: "Kore",
    themes: ["neon-pink", "cyber-purple", "emerald-glow", "sunset-amber", "midnight-blue"],
  });
});

// Create HTTP & WebSocket Server
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  try {
    const rawUrl = request.url || "";
    const [pathname] = rawUrl.split("?");
    if (pathname === "/live" || pathname === "/live/") {
      wss.handleUpgrade(request, socket, head, (clientWs) => {
        wss.emit("connection", clientWs, request);
      });
    }
  } catch (err) {
    console.error("[SERVER] Upgrade handling error:", err);
    socket.destroy();
  }
});

wss.on("connection", async (clientWs, req) => {
  console.log("Client connected to Aanya Live WebSocket");

  clientWs.on("error", (err) => {
    console.error("[SERVER] Client WS connection error:", err);
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Missing GEMINI_API_KEY in process.env");
    clientWs.send(JSON.stringify({
      type: "error",
      error: "GEMINI_API_KEY environment variable is not configured. Please add it in Secrets."
    }));
    clientWs.close();
    return;
  }

  // Parse voice parameter from query string if available
  const urlParams = new URLSearchParams(req.url?.split("?")[1] || "");
  const selectedVoice = urlParams.get("voice") || "Kore";

  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });

  // FEATURE (multi-provider / quota isolation): background specialist and
  // pipeline calls go through a separate Gemini client bound to GEMINI_API_KEY_AGENTS
  const agentsAi = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY_AGENTS || apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });

  const isAgentKeySet = Boolean(process.env.GEMINI_API_KEY_AGENTS && process.env.GEMINI_API_KEY_AGENTS.trim());
  const LIVE_MODELS = ["gemini-3.8-live", "gemini-3.1-flash-live-preview"];
  let currentLiveModelIdx = 0;
  console.log(`[AGENT GEMINI CONFIG: CONNECTION]\nagentKeyConfigured: ${isAgentKeySet}\nusingAgentSpecificKey: ${isAgentKeySet}\nusingMainFallback: ${!isAgentKeySet}\nliveModel: ${LIVE_MODELS[currentLiveModelIdx]} (fallback: ${LIVE_MODELS[1]})\nagentModel: gemini-3.8-flash (fallbacks: gemini-3-flash-preview, gemini-flash-latest, gemini-3.7-flash)`);

  let liveSession: Session | null = null;
  let sessionReady = false;
  let sessionGeneration = 0; // bumped on every (re)connect attempt
  let reconnectAttempts = 0;
  let reconnecting = false;
  let intentionalClose = false;
  let connectionResumptionHandle: string | undefined = undefined;

  // Multi-tier user confirmation gating: tools pause, send confirmRequired, and wait for confirmation.
  const pendingConfirmations = new Map<string, { name: string; args: any; approvals: number; required: number }>();
  const uploadedAttachments = new Map<string, UploadedAttachment>();

  let pcAccessGranted = false;

  // SAFETY UPDATE: Mandate user approval before ANY typing or application launching.
  const TOOL_CONFIRMATION_LEVELS = new Map<string, number>([
    ["typeText", 1],
    ["openApplication", 1],
  ]);

  let latestFrameResolution: FrameResolution | null = null;
  let latestScreenFrame: { data: string; mimeType: string; timestamp: number } | null = null;
  let lastProactiveCommentAt = 0;
  let isProactiveCheckRunning = false;
  const PROACTIVE_FRAME_FRESHNESS_MS = 20_000;
  const PROACTIVE_COMMENT_COOLDOWN_MS = 90_000;
  const PROACTIVE_CHECK_INTERVAL_MS = 45_000;

  // FEATURE (proactive screen-watching): background periodic visual observation
  const proactiveWatchInterval = setInterval(async () => {
    if (!liveSession || !sessionReady) return;
    if (!latestScreenFrame) return;
    if (activeSpecialistCount > 0) return; // Yield to active specialist tasks to prevent quota competition
    if (isProactiveCheckRunning) return; // Prevent overlapping watch checks
    if (Date.now() - latestScreenFrame.timestamp > PROACTIVE_FRAME_FRESHNESS_MS) return;
    if (Date.now() - lastProactiveCommentAt < PROACTIVE_COMMENT_COOLDOWN_MS) return;

    isProactiveCheckRunning = true;
    try {
      const frameToCheck = latestScreenFrame;
      const comment = await checkProactiveScreenComment(agentsAi, frameToCheck, pcAccessGranted);
      if (comment && liveSession && sessionReady) {
        lastProactiveCommentAt = Date.now();
        try {
          liveSession.sendClientContent({
            turns: `(Proactive observation — you noticed this on the user's screen yourself, without being asked. Mention it naturally, briefly, in your own voice: ${comment})`,
            turnComplete: true
          });
        } catch (sendErr) {
          console.warn("[PROACTIVE WATCH] Could not send observation to live session:", sendErr);
        }
      }
    } finally {
      isProactiveCheckRunning = false;
    }
  }, PROACTIVE_CHECK_INTERVAL_MS);

  const MAX_RECONNECT_ATTEMPTS = 5;

  async function connectGeminiLive(forceFreshSession = false) {
    const myGeneration = ++sessionGeneration;
    const handleToUse = forceFreshSession ? undefined : connectionResumptionHandle;
    const usedHandleThisAttempt = Boolean(handleToUse);
    let geminiAudioCount = 0;
    let connectedAt = 0;
    let turnOutputSpeechBuffer = "";
    let turnInputSpeechBuffer = "";

    const activeModel = LIVE_MODELS[currentLiveModelIdx] || LIVE_MODELS[0];
    console.log(
      `Connecting to Gemini Live session (model: ${activeModel}, voice: ${selectedVoice}, ` +
      `resuming: ${Boolean(handleToUse)}, attempt: ${reconnectAttempts})`
    );

    try {
      const liveConfig: any = {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
        inputAudioTranscription: {},
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: selectedVoice }
          }
        },
        systemInstruction: AANYA_SYSTEM_INSTRUCTION,
        tools: AANYA_TOOLS,
      };

      // Only supply sessionResumption if a verified non-empty handle exists
      if (handleToUse && typeof handleToUse === "string" && handleToUse.trim()) {
        liveConfig.sessionResumption = { handle: handleToUse.trim() };
      }

      const session = await ai.live.connect({
        model: activeModel,
        config: liveConfig,
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (myGeneration !== sessionGeneration) return;
            try {
              // Handle Model Turn Audio & Text
              const modelTurn = message.serverContent?.modelTurn;
              if (modelTurn?.parts) {
                for (const part of modelTurn.parts) {
                  if (part.inlineData?.data) {
                    geminiAudioCount++;
                    if (clientWs.readyState === WebSocket.OPEN) {
                      clientWs.send(JSON.stringify({
                        type: "audio",
                        audio: part.inlineData.data
                      }));
                    }
                    if (geminiAudioCount % 50 === 0) {
                      console.log(`[STAGE 5 GEMINI AUDIO OUT] Packet #${geminiAudioCount} | Bytes: ${part.inlineData.data.length}`);
                    }
                  }
                  if (part.text) {
                    if (clientWs.readyState === WebSocket.OPEN) {
                      clientWs.send(JSON.stringify({
                        type: "text",
                        text: part.text
                      }));
                    }
                    console.log(`[GEMINI TEXT] "${part.text}"`);
                  }
                }
              }

              // Handle Output Audio Transcription (Aanya's spoken response)
              const outputTranscriptionText = (message.serverContent as any)?.outputTranscription?.text;
              if (outputTranscriptionText) {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({
                    type: "text",
                    text: outputTranscriptionText,
                    isUser: false
                  }));
                }
                turnOutputSpeechBuffer += outputTranscriptionText;
              }

              // Handle Input Audio Transcription (user's spoken words)
              const inputTranscriptionText = (message.serverContent as any)?.inputTranscription?.text;
              if (inputTranscriptionText) {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({
                    type: "text",
                    text: inputTranscriptionText,
                    isUser: true
                  }));
                }
                turnInputSpeechBuffer += inputTranscriptionText;
              }

              // Handle Interruption
              if (message.serverContent?.interrupted) {
                if (turnOutputSpeechBuffer.trim()) {
                  console.log(`[AANYA SPOKEN TURN] "${turnOutputSpeechBuffer.trim()}" (interrupted)`);
                  turnOutputSpeechBuffer = "";
                }
                console.log("[GEMINI TURN STATE] Interrupted event received from Gemini");
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({ type: "interrupted" }));
                }
              }

              // Handle Turn Complete
              if (message.serverContent?.turnComplete) {
                if (turnInputSpeechBuffer.trim()) {
                  console.log(`[USER SPOKEN TURN] "${turnInputSpeechBuffer.trim()}"`);
                  turnInputSpeechBuffer = "";
                }
                if (turnOutputSpeechBuffer.trim()) {
                  console.log(`[AANYA SPOKEN TURN] "${turnOutputSpeechBuffer.trim()}"`);
                  turnOutputSpeechBuffer = "";
                }
                console.log("[GEMINI TURN STATE] turnComplete received from Gemini");
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({ type: "turnComplete" }));
                }
              }

              // Handle Tool Calls (Function Calling)
              if (message.toolCall) {
                const calls = message.toolCall.functionCalls;
                if (calls && calls.length > 0) {
                  for (const call of calls) {
                    console.log("Aanya tool call received:", call.name, call.args);

                    if (!call.name || !call.id) {
                      console.warn("Aanya tool call arrived without a name or id — skipping:", call);
                      continue;
                    }

                    if (TOOL_CONFIRMATION_LEVELS.has(call.name)) {
                      const required = TOOL_CONFIRMATION_LEVELS.get(call.name)!;
                      pendingConfirmations.set(call.id, { name: call.name, args: call.args, approvals: 0, required });

                      session.sendToolResponse({
                        functionResponses: [{
                          id: call.id,
                          name: call.name,
                          response: {
                            result: "pending_confirmation",
                            message: `The user needs to confirm this on screen before it runs. Right now, out loud, ask them to confirm — naturally, in your own voice/persona, in Hinglish. Something like "Sir, allow kar dijiye" or "Confirm kar dijiye ek baar screen par". Do this now, don't wait silently.`
                          }
                        }]
                      });

                      if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({
                          type: "confirmRequired",
                          id: call.id,
                          name: call.name,
                          args: call.args,
                          summary: describeToolCall(call.name, call.args),
                          approvalsNeeded: required,
                          approvalsSoFar: 0
                        }));
                      }
                    } else if (
                      call.name === "openWebsite" ||
                      call.name === "openApplication" ||
                      call.name === "clickAt" ||
                      call.name === "typeText" ||
                      call.name === "scrollScreen" ||
                      call.name === "minimizeWindow" ||
                      call.name === "closeWindow" ||
                      call.name === "controlWindow" ||
                      call.name === "listWindows" ||
                      call.name === "closeApplication" ||
                      call.name === "listProcesses" ||
                      call.name === "systemControl"
                    ) {
                      // Immediate execution tools
                      session.sendToolResponse({
                        functionResponses: [{
                          id: call.id,
                          name: call.name,
                          response: { result: "ok", message: "Running now." }
                        }]
                      });

                      if (call.name === "openWebsite") {
                        handleOpenWebsite(call, session, clientWs);
                      } else if (call.name === "openApplication") {
                        handleOpenApplication(call, session, clientWs);
                      } else if (call.name === "clickAt") {
                        handleClickAt(call, session, clientWs, latestFrameResolution);
                      } else if (call.name === "typeText") {
                        handleTypeText(call, session, clientWs);
                      } else if (call.name === "scrollScreen") {
                        handleScroll(call, session, clientWs);
                      } else if (call.name === "minimizeWindow") {
                        handleMinimizeWindow(call, session, clientWs);
                      } else if (call.name === "closeWindow") {
                        handleCloseWindow(call, session, clientWs);
                      } else if (call.name === "controlWindow") {
                        handleControlWindow(call, session, clientWs);
                      } else if (call.name === "listWindows") {
                        handleListWindows(call, session, clientWs);
                      } else if (call.name === "closeApplication") {
                        handleCloseApplication(call, session, clientWs);
                      } else if (call.name === "listProcesses") {
                        handleListProcesses(call, session, clientWs);
                      } else if (call.name === "systemControl") {
                        handleSystemControl(call, session, clientWs);
                      }
                    } else if (call.name === "createFile") {
                      handleCreateFile(call, session, clientWs);
                    } else if (call.name === "createFolder") {
                      handleCreateFolder(call, session, clientWs);
                    } else if (call.name === "searchWeb") {
                      handleSearchWeb(call, session, clientWs);
                    } else if (call.name === "rememberAppLocation") {
                      handleRememberAppLocation(call, session, clientWs);
                    } else if (call.name === "findFile") {
                      handleFindFile(call, session, clientWs);
                    } else if (call.name === "openFile") {
                      handleOpenFile(call, session, clientWs);
                    } else if (call.name === "generateImage") {
                      handleGenerateImage(call, session, clientWs, agentsAi, ai);
                    } else if (call.name === "delegateTask") {
                      handleDelegateTask(call, session, clientWs, agentsAi, ai);
                    } else if (call.name === "startPcAccess") {
                      handleStartPcAccess(call, session, clientWs, (granted) => { pcAccessGranted = granted; });
                    } else if (call.name === "stopPcAccess") {
                      handleStopPcAccess(call, session, clientWs, (granted) => {
                        pcAccessGranted = granted;
                        latestFrameResolution = null;
                      });
                    } else if (clientWs.readyState === WebSocket.OPEN) {
                      // Client-side tools (e.g. changeThemeColor, showVisualAction)
                      clientWs.send(JSON.stringify({
                        type: "toolCall",
                        id: call.id,
                        name: call.name,
                        args: call.args
                      }));
                    }
                  }
                }
              }

              // Resumption Handle Update
              if (message.sessionResumptionUpdate) {
                const update = message.sessionResumptionUpdate;
                if (update.resumable && update.newHandle) {
                  connectionResumptionHandle = update.newHandle;
                  saveResumptionHandle(update.newHandle);
                  console.log("[SESSION RESUMPTION] Saved fresh handle for current connection");
                }
              }

              // Proactive Reconnect on GoAway
              if (message.goAway) {
                console.log(`[GEMINI GOAWAY] Session ending in ~${message.goAway.timeLeft}. Reconnecting proactively...`);
                triggerReconnect(myGeneration);
              }
            } catch (err: any) {
              console.error("Error processing Gemini message:", err);
            }
          },
          onclose: (e: any) => {
            if (myGeneration !== sessionGeneration) return;
            const reasonText = String(e?.reason || "");
            console.log(`Gemini Live session closed | code: ${e?.code} | reason: ${reasonText || "(none given)"}`);
            sessionReady = false;
            if (intentionalClose) {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: "status", status: "closed" }));
              }
              return;
            }

            // Code 1011 (Internal error) or 1008 (Policy/Not found) means Google rejected or crashed the session.
            // Any saved handle is invalid and MUST be wiped, and we reconnect fresh.
            const isInternalOrRejectionError =
              e?.code === 1011 ||
              e?.code === 1008 ||
              /internal error/i.test(reasonText) ||
              /session not found/i.test(reasonText);

            if (isInternalOrRejectionError) {
              console.warn(`[GEMINI LIVE] Session closed with code ${e?.code}. Clearing resumption state and reconnecting fresh.`);
              connectionResumptionHandle = undefined;
              setLatestResumptionHandleMemory(undefined);
              clearResumptionHandle();

              // Switch model in cascade if available
              currentLiveModelIdx = (currentLiveModelIdx + 1) % LIVE_MODELS.length;
              triggerReconnect(myGeneration, true);
              return;
            }

            const lifetimeMs = connectedAt > 0 ? Date.now() - connectedAt : -1;
            if (usedHandleThisAttempt && lifetimeMs >= 0 && lifetimeMs < 5000) {
              console.warn(`[SESSION RESUMPTION] Session closed after only ${lifetimeMs}ms while resuming. Clearing handle and retrying fresh.`);
              connectionResumptionHandle = undefined;
              clearResumptionHandle().then(() => triggerReconnect(myGeneration, true));
              return;
            }

            triggerReconnect(myGeneration);
          },
          onerror: (err: any) => {
            if (myGeneration !== sessionGeneration) return;
            console.error("Gemini Live session error:", err);
            sessionReady = false;
            // Clear any handle that might have caused the error
            connectionResumptionHandle = undefined;
            setLatestResumptionHandleMemory(undefined);
            clearResumptionHandle();

            // Try next model if applicable
            currentLiveModelIdx = (currentLiveModelIdx + 1) % LIVE_MODELS.length;
            triggerReconnect(myGeneration, true);
          }
        }
      });

      if (myGeneration !== sessionGeneration) {
        try { session.close(); } catch (e) { /* ignore */ }
        return;
      }

      liveSession = session;
      sessionReady = true;
      connectedAt = Date.now();
      reconnectAttempts = 0;
      intentionalClose = false;

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "status", status: "connected" }));
      }
    } catch (err: any) {
      console.error("Failed to connect to Gemini Live session:", err);

      connectionResumptionHandle = undefined;
      await clearResumptionHandle();

      // Cycle model on connect failure
      currentLiveModelIdx = (currentLiveModelIdx + 1) % LIVE_MODELS.length;

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        triggerReconnect(myGeneration, true);
      } else {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: "error",
            error: err?.message || "Failed to establish Live session"
          }));
        }
      }
    }
  }

  function triggerReconnect(fromGeneration: number, forceFresh: boolean = false) {
    if (fromGeneration !== sessionGeneration) return;
    if (reconnecting) return;
    if (clientWs.readyState !== WebSocket.OPEN) return;

    reconnecting = true;
    reconnectAttempts += 1;

    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error("Gave up reconnecting to Gemini Live after too many attempts");
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: "error",
          error: "Aanya baar-baar disconnect ho rahi hai. Please refresh karke dobara try karein."
        }));
      }
      reconnecting = false;
      return;
    }

    // Inform client that we are reconnecting so UI doesn't hang in error state
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: "status", status: "connecting" }));
    }

    setTimeout(async () => {
      reconnecting = false;
      await connectGeminiLive(forceFresh);
    }, 600);
  }

  await connectGeminiLive(true);

  // Handle messages from Client WebSocket
  clientWs.on("message", async (rawMessage) => {
    try {
      const dataObj = JSON.parse(rawMessage.toString());

      // Workspace File View / Download Requests
      if (dataObj.type === "workspaceFileRequest") {
        const requestId = String(dataObj.requestId || "");
        const filePath = String(dataObj.path || "");
        const mode = dataObj.mode === "download" ? "download" : "view";
        const respond = (payload: Record<string, unknown>) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: "workspaceFileResult", requestId, ...payload }));
          }
        };

        try {
          if (!requestId || !filePath || !isWorkspaceFilePath(filePath)) {
            respond({ error: "This file is not available in Aanya's workspace." });
            return;
          }
          const stats = await fs.stat(filePath);
          if (!stats.isFile()) {
            respond({ error: "That workspace item is a folder, not a file." });
            return;
          }

          const name = path.basename(filePath);
          const mimeType = mimeForAttachment(name, "application/octet-stream");
          const previewAvailable = isViewableWorkspaceFile(filePath) && stats.size <= 1024 * 1024;
          if (mode === "view") {
            if (!previewAvailable) {
              respond({ file: { name, path: filePath, size: stats.size, mimeType, previewAvailable: false } });
              return;
            }
            const content = await fs.readFile(filePath, "utf-8");
            respond({ file: { name, path: filePath, size: stats.size, mimeType, previewAvailable: true, content } });
            return;
          }

          if (stats.size > MAX_ATTACHMENT_BYTES) {
            respond({ error: "This file is too large to download from chat." });
            return;
          }
          const data = await fs.readFile(filePath);
          respond({ file: { name, path: filePath, size: stats.size, mimeType, previewAvailable, data: data.toString("base64") } });
        } catch (error) {
          console.error("[WORKSPACE FILE] Read failed:", error);
          respond({ error: "Unable to open this file. It may have been moved or is no longer available." });
        }
        return;
      }

      // Attachment handling
      if (dataObj.type === "attachment") {
        const meta = dataObj.attachment;
        const data = typeof dataObj.data === "string" ? dataObj.data : "";
        const size = Number(meta?.size || 0);
        const decodedSize = Math.floor((data.length * 3) / 4);
        if (!meta?.id || !meta?.name || !data || size <= 0 || size > MAX_ATTACHMENT_BYTES || decodedSize > MAX_ATTACHMENT_BYTES) {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: "attachmentStatus",
              attachment: { ...meta, status: "failed", error: "The attachment is missing or exceeds the 25 MB limit." }
            }));
          }
          return;
        }
        const attachment: UploadedAttachment = {
          id: String(meta.id),
          name: path.basename(String(meta.name)),
          mimeType: mimeForAttachment(path.basename(String(meta.name)), String(meta.mimeType || "application/octet-stream")),
          size,
          data,
          receivedAt: Date.now(),
        };
        uploadedAttachments.set(attachment.id, attachment);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: "attachmentStatus",
            attachment: { id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size, status: "ready" }
          }));
        }
        return;
      }

      if (!liveSession || !sessionReady) {
        return;
      }

      // Realtime Audio Stream from User
      if (dataObj.type === "audio" && dataObj.audio) {
        try {
          liveSession.sendRealtimeInput({
            audio: {
              data: dataObj.audio,
              mimeType: "audio/pcm;rate=16000"
            }
          });
        } catch (err: any) {
          console.error(`[STAGE 5 GEMINI AUDIO IN] Error: ${err.message || err}`);
        }
      } else if (dataObj.type === "image" && dataObj.image) {
        // Vision Frame Stream (Desktop / Screen sharing)
        try {
          const meta = dataObj.metadata;
          if (
            meta &&
            typeof meta.originalWidth === "number" &&
            typeof meta.originalHeight === "number" &&
            typeof meta.scaledWidth === "number" &&
            typeof meta.scaledHeight === "number"
          ) {
            latestFrameResolution = {
              originalWidth: meta.originalWidth,
              originalHeight: meta.originalHeight,
              scaledWidth: meta.scaledWidth,
              scaledHeight: meta.scaledHeight,
            };
          }

          liveSession.sendRealtimeInput({
            video: {
              data: dataObj.image,
              mimeType: dataObj.mimeType || "image/jpeg"
            }
          });
          latestScreenFrame = { data: dataObj.image, mimeType: dataObj.mimeType || "image/jpeg", timestamp: Date.now() };
        } catch (err: any) {
          console.error(`[STAGE 5 GEMINI VISION IN] Error: ${err.message || err}`);
        }
      } else if (dataObj.type === "text" && dataObj.text) {
        // Text chat with optional file attachments
        const requestedIds = Array.isArray(dataObj.attachmentIds) ? dataObj.attachmentIds.map(String) : [];
        const attachments = requestedIds.map((id: string): UploadedAttachment | undefined => {
          const small = uploadedAttachments.get(id);
          if (small) return small;
          const videoUpload = videoUploads.get(id);
          if (videoUpload && videoUpload.status === "uploaded") {
            return {
              id: videoUpload.id,
              name: videoUpload.filename,
              mimeType: videoUpload.mimeType,
              size: videoUpload.size,
              pendingVideoUploadId: videoUpload.id,
              receivedAt: Date.now()
            };
          }
          return undefined;
        }).filter(Boolean) as UploadedAttachment[];

        const contexts = attachments.map(attachmentContext);

        for (const attachment of attachments) {
          const context = attachmentContext(attachment);
          if (/^image\//.test(attachment.mimeType) || /\.(png|jpe?g|gif|webp)$/i.test(attachment.name)) {
            liveSession.sendRealtimeInput({
              video: {
                data: attachment.data,
                mimeType: attachment.mimeType === "application/octet-stream" ? "image/jpeg" : attachment.mimeType
              }
            });
          }
          if (context.specialist) {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: "attachmentStatus",
                attachment: { id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size, status: "processing" }
              }));
            }
            const attachmentTask = `${context.text}\n\nUser instruction: ${dataObj.text}`;
            const pendingUploadId = attachment.pendingVideoUploadId;

            const runPipeline = async (): Promise<string> => {
              let resolvedAttachment = attachment;
              if (pendingUploadId) {
                const videoUpload = videoUploads.get(pendingUploadId);
                if (!videoUpload) throw new Error("Video upload session expired before it could be analyzed.");
                videoUpload.status = "processing";
                videoUpload.updatedAt = Date.now();
                const geminiFile = await uploadVideoToGemini(agentsAi, videoUpload);
                if (!geminiFile) throw new Error("Gemini could not ingest the uploaded video in time.");
                videoUpload.status = "analyzing";
                videoUpload.updatedAt = Date.now();
                resolvedAttachment = { ...attachment, fileUri: geminiFile.fileUri, mimeType: geminiFile.mimeType };
              }
              const rawAttachmentForModel = context.specialist === "video-analysis" || extensionOf(attachment.name) === "pdf" ? resolvedAttachment : undefined;
              const result =
                context.specialist === "video-analysis" ? await runVideoOptimizationPipeline(agentsAi, attachmentTask, rawAttachmentForModel) :
                context.specialist === "coding" ? await runCodingPipeline(attachmentTask, agentsAi, ai) :
                await runSpecialistAgent(agentsAi, context.specialist!, attachmentTask, rawAttachmentForModel, ai);

              if (pendingUploadId) {
                const videoUpload = videoUploads.get(pendingUploadId);
                if (videoUpload) {
                  videoUpload.status = "completed";
                  videoUpload.updatedAt = Date.now();
                  void removeVideoUpload(videoUpload);
                }
              }
              return result;
            };

            void runPipeline()
              .then((result) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({
                    type: "attachmentStatus",
                    attachment: { id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size, status: "ready" }
                  }));
                }
                if (liveSession && sessionReady) {
                  try {
                    const truncatedResult = result.length > 3000 ? `${result.slice(0, 3000)}\n\n[Full report displayed in UI card]` : result;
                    liveSession.sendClientContent({
                      turns: `(Verified specialist result for attachment ${attachment.name}: ${truncatedResult}\nMain AI: review this report against the user's request, state limitations honestly, and give the user a concise final answer rather than blindly repeating it.)`,
                      turnComplete: true
                    });
                  } catch (sendErr) {
                    console.warn("[ATTACHMENT AGENT] Could not send result to live session:", sendErr);
                  }
                }
              })
              .catch((error) => {
                console.error("[ATTACHMENT AGENT] Failed:", error);
                if (pendingUploadId) {
                  const videoUpload = videoUploads.get(pendingUploadId);
                  if (videoUpload) {
                    videoUpload.status = "failed";
                    videoUpload.error = error?.message || "Video analysis failed.";
                    videoUpload.updatedAt = Date.now();
                  }
                }
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({
                    type: "attachmentStatus",
                    attachment: { id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size, status: "failed", error: "Specialist processing failed." }
                  }));
                }
                if (liveSession && sessionReady) {
                  try {
                    liveSession.sendClientContent({
                      turns: `(System note: attachment analysis for ${attachment.name} failed before a verified result was available — ${describeAgentError(error)})`,
                      turnComplete: true
                    });
                  } catch (sendErr) {
                    console.warn("[ATTACHMENT AGENT] Could not send error notice to live session:", sendErr);
                  }
                }
              });
          }
        }

        const attachmentNotes = contexts.map((context) => context.text).join("\n\n");
        if (liveSession && sessionReady) {
          try {
            liveSession.sendClientContent({ turns: `${dataObj.text}\n\n${attachmentNotes}`, turnComplete: true });
          } catch (sendErr) {
            console.warn("[TEXT CHAT] Could not send client content to live session:", sendErr);
          }
        }
      } else if (dataObj.type === "toolResponse") {
        if (liveSession && sessionReady) {
          try {
            liveSession.sendToolResponse({
              functionResponses: [
                {
                  id: dataObj.id,
                  name: dataObj.name,
                  response: dataObj.response || { result: "ok" }
                }
              ]
            });
          } catch (sendErr) {
            console.warn("[TOOL RESPONSE] Could not send tool response to live session:", sendErr);
          }
        }
      } else if (dataObj.type === "toolConfirmation") {
        const pending = pendingConfirmations.get(dataObj.id);
        if (!pending) {
          console.warn(`[TOOL CONFIRM] No pending call for id: ${dataObj.id}`);
          return;
        }

        const call = { id: dataObj.id, name: pending.name, args: pending.args };

        if (!dataObj.approved) {
          pendingConfirmations.delete(dataObj.id);
          console.log(`[TOOL CONFIRM] User denied:`, pending.name, pending.args);
          if (liveSession && sessionReady) {
            try {
              liveSession.sendClientContent({
                turns: `(System note: the user declined this action, so it was NOT performed. Acknowledge that naturally, briefly.)`,
                turnComplete: true
              });
            } catch (sendErr) {
              console.warn("[TOOL CONFIRM] Could not send decline to live session:", sendErr);
            }
          }
          notifyClient(clientWs, call, `Okay, skipped that`);
          return;
        }

        pending.approvals += 1;
        if (pending.approvals < pending.required) {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: "confirmRequired",
              id: dataObj.id,
              name: pending.name,
              args: pending.args,
              summary: describeToolCall(pending.name, pending.args),
              approvalsNeeded: pending.required,
              approvalsSoFar: pending.approvals
            }));
          }
          return;
        }

        pendingConfirmations.delete(dataObj.id);
        console.log(`[TOOL CONFIRM] Fully approved, running:`, pending.name, pending.args);

        if (pending.name === "openWebsite") {
          handleOpenWebsite(call, liveSession, clientWs);
        } else if (pending.name === "openApplication") {
          handleOpenApplication(call, liveSession, clientWs);
        } else if (pending.name === "clickAt") {
          handleClickAt(call, liveSession, clientWs, latestFrameResolution);
        } else if (pending.name === "typeText") {
          handleTypeText(call, liveSession, clientWs);
        } else if (pending.name === "scrollScreen") {
          handleScroll(call, liveSession, clientWs);
        } else if (pending.name === "minimizeWindow") {
          handleMinimizeWindow(call, liveSession, clientWs);
        } else if (pending.name === "closeWindow") {
          handleCloseWindow(call, liveSession, clientWs);
        } else if (pending.name === "controlWindow") {
          handleControlWindow(call, liveSession, clientWs);
        } else if (pending.name === "listWindows") {
          handleListWindows(call, liveSession, clientWs);
        } else if (pending.name === "closeApplication") {
          handleCloseApplication(call, liveSession, clientWs);
        } else if (pending.name === "listProcesses") {
          handleListProcesses(call, liveSession, clientWs);
        } else if (pending.name === "systemControl") {
          handleSystemControl(call, liveSession, clientWs);
        }
      }
    } catch (e: any) {
      console.error("Error processing client WS message:", e);
    }
  });

  clientWs.on("close", () => {
    console.log("Client WS disconnected");
    intentionalClose = true;
    clearInterval(proactiveWatchInterval);
    sessionGeneration++;
    if (liveSession) {
      try {
        liveSession.close();
      } catch (e) {
        // ignore
      }
    }
  });
});

// Process-level safety: prevent unhandled promise rejections from crashing server
process.on("unhandledRejection", (reason: any) => {
  console.error("[SERVER] Unhandled promise rejection caught safely:", reason?.message || reason);
});

process.on("uncaughtException", (err: Error) => {
  console.error("[SERVER] Uncaught exception caught safely:", err?.message || err);
});

async function startServer() {
  // Initialize persistent disk services
  await initSessionStorage();
  await initAppPaths();
  await initWorkspace();
  await initVideoUploads();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

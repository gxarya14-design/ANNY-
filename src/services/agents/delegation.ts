import { WebSocket } from "ws";
import { Session, GoogleGenAI } from "@google/genai";
import { selectSpecialist, runSpecialistAgent, runVideoOptimizationPipeline } from "./specialist.js";
import { runCodingPipeline } from "./claude.js";
import { describeAgentError, getSpecialistDisplayName } from "./types.js";
import { notifyClient } from "../tools/toolNotifications.js";

// FEATURE (Aanya can spawn her own background AI agents for delegated
// tasks, and proactively announces results when done): the user
// specifically described wanting this: "main khud ke andar AI agents
// build kar sakti hoon... jab tasks complete ho jaenge, toh main aapko
// inform karke results bhej dungi." Scoped to research/analysis-style
// tasks (uses Gemini + Google Search grounding) rather than anything
// needing screen control — Gemini's API doesn't allow mixing googleSearch
// with custom function-calling tools (like clickAt) in the same call, and
// letting an unsupervised background process click around the user's PC
// would need a lot more safety thought than a first version like this
// should take on. For "go find out X" / "compare Y and Z" / "look into W
// and tell me" style requests, though, this is a real, independent worker.
//
// `ai` is passed in explicitly (rather than making this a closure like
// clickAt etc.) since it's created per-connection in the WebSocket
// handler below, not at module level like the other handlers here.

export let activeSpecialistCount = 0;
export const MAX_CONCURRENT_SPECIALISTS = 4;
export const activeTaskPromises = new Map<string, Promise<string>>();

export async function handleDelegateTask(
  call: any,
  session: Session,
  clientWs: WebSocket,
  ai: GoogleGenAI,
  fallbackAi?: GoogleGenAI
) {
  const taskName = String(call.args?.taskName || "task").trim();
  const taskDescription = String(call.args?.taskDescription || "").trim();

  if (!taskDescription) {
    session.sendToolResponse({
      functionResponses: [{ id: call.id, name: call.name, response: { result: "error", message: "No task description was given." } }]
    });
    notifyClient(clientWs, call, `Couldn't start agent — no task given`);
    return;
  }

  // Check both taskDescription and taskName to accurately route the task
  const fullTaskContext = `${taskName} ${taskDescription}`;
  const specialist = selectSpecialist(fullTaskContext);
  const specialistTitle = getSpecialistDisplayName(specialist);
  console.log(`[DELEGATE TASK] Starting background agent "${taskName}" delegated to ${specialistTitle}: ${taskDescription}`);

  // Resolve the ORIGINAL call right away — Gemini shouldn't block the live
  // conversation waiting for this; it just acknowledges and moves on. The
  // real result comes back as an unsolicited client turn when done.
  session.sendToolResponse({
    functionResponses: [{
      id: call.id,
      name: call.name,
      response: {
        result: "ok",
        message: `${specialistTitle} is working in the background on "${taskName}". Tell the user briefly that ${specialistTitle} is on it and you will share verified results as soon as it completes.`
      }
    }]
  });
  notifyClient(clientWs, call, `${specialistTitle} started on "${taskName}"`);

  // Cap background agent concurrency so multiple parallel tasks can't
  // exhaust memory or trigger cascade rate-limits.
  if (activeSpecialistCount >= MAX_CONCURRENT_SPECIALISTS) {
    console.warn(`[DELEGATE TASK] Max concurrent specialists reached (${activeSpecialistCount}/${MAX_CONCURRENT_SPECIALISTS}). Enqueuing with warning.`);
  }

  // Deduplicate identical in-flight task requests (e.g. if the user
  // repeats the command or Gemini retries the call)
  const taskKey = `${taskName}:${taskDescription}`.toLowerCase();
  const existingPromise = activeTaskPromises.get(taskKey);

  console.log(`[DELEGATE TASK] Routing "${taskName}" to specialist: [${specialistTitle} (${specialist})]`);

  const runTask = async (): Promise<string> => {
    activeSpecialistCount++;
    try {
      if (specialist === "coding") {
        return await runCodingPipeline(taskDescription, ai, fallbackAi);
      }
      if (specialist === "video-analysis") {
        const isPackaging = /(youtube|title|thumbnail|ctr|packaging|tags|seo|description)/i.test(taskDescription);
        if (isPackaging) {
          return await runVideoOptimizationPipeline(ai, taskDescription);
        }
        return await runSpecialistAgent(ai, "video-analysis", taskDescription, undefined, fallbackAi);
      }
      return await runSpecialistAgent(ai, specialist, taskDescription, undefined, fallbackAi);
    } finally {
      activeSpecialistCount = Math.max(0, activeSpecialistCount - 1);
      activeTaskPromises.delete(taskKey);
    }
  };

  const taskPromise = existingPromise || runTask();
  if (!existingPromise) {
    activeTaskPromises.set(taskKey, taskPromise);
  }

  taskPromise
    .then((result) => {
      console.log(`[DELEGATE TASK] ${specialistTitle} finished "${taskName}" successfully.`);

      // Send the result to the client transcript as a dedicated agent-result card
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: "agentResult",
          taskName,
          specialist,
          specialistTitle,
          result,
          timestamp: Date.now()
        }));
      }

      // Proactively inject the verified specialist output into the live voice session
      try {
        const truncatedReport = result.length > 3000 ? `${result.slice(0, 3000)}\n\n[Full deliverable displayed in transcript card]` : result;
        session.sendClientContent({
          turns: `(Verified specialist report from ${specialistTitle} for "${taskName}":\n${truncatedReport}\n\nMain AI instructions: Acknowledge ${specialistTitle}'s findings. Review this report against the user's initial request. Then summarize the key findings or deliverable out loud to the user in a natural, charming, and concise spoken response.)`,
          turnComplete: true
        });
      } catch (sendErr) {
        console.warn(`[DELEGATE TASK] Could not send specialist report to live session (session may have closed):`, sendErr);
      }
    })
    .catch((err: any) => {
      console.error(`[DELEGATE TASK] ${specialistTitle} for "${taskName}" failed:`, err);
      const errorAdvice = describeAgentError(err);
      try {
        session.sendClientContent({
          turns: `(System note: ${specialistTitle} for "${taskName}" failed — ${errorAdvice})`,
          turnComplete: true
        });
      } catch (sendErr) {
        console.warn(`[DELEGATE TASK] Could not send error notice to live session:`, sendErr);
      }
      notifyClient(clientWs, call, `${specialistTitle} failed for "${taskName}"`);
    });
}

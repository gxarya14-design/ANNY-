import path from "path";
import { fileURLToPath } from "url";
import { YouTubeAgentContext, YouTubeSkillResult } from "../../types.js";
import { runPythonTool, generateYouTubeResponse } from "../../utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runYouTubeShorts(ctx: YouTubeAgentContext): Promise<YouTubeSkillResult> {
  const { task, ai, fallbackAi, attachment } = ctx;

  const hookScriptPath = path.resolve(__dirname, "..", "yt-script", "hookscore.py");
  const transcript = attachment?.data ? Buffer.from(attachment.data, "base64").toString("utf-8") : "";

  const systemInstruction = `You are the lead YouTube Shorts Repurposing Strategist following the yt-shorts protocol.
A Short cut out of a long video is NOT a clip of the best moment. It is a moment that survives without the video around it (20-55 seconds).
Rules:
1. Identify self-contained moments with:
   - Complete opening thought (does not need previous context)
   - A dramatic turn or complication
   - A crisp punchline ending
2. For each Short:
   - Timecodes and original span
   - A NEW opening hook line (written specifically for cold feeds)
   - On-screen text for the first 2 seconds (DIFFERENT words from the spoken hook)
   - Loop point (how the ending connects back to the start)
   - Vertical framing note (what to crop/center)
3. End with the exact gate question:
   **ship it, or change it?**`;

  const prompt = `Shorts Extraction Request:
${task}

${transcript ? `Attached Long Video Transcript:\n${transcript.slice(0, 4000)}\n` : ""}

Deliver the top Shorts candidates and complete production specifications.`;

  const report = await generateYouTubeResponse(ai, prompt, systemInstruction, fallbackAi);

  return {
    skill: "yt-shorts",
    title: "YouTube Shorts Repurposing & Viral Clips Suite",
    report,
    gateQuestion: "**ship it, or change it?**",
  };
}

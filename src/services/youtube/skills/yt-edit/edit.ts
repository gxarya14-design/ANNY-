import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { YouTubeAgentContext, YouTubeSkillResult } from "../../types.js";
import { runPythonTool, generateYouTubeResponse } from "../../utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runYouTubeEdit(ctx: YouTubeAgentContext): Promise<YouTubeSkillResult> {
  const { task, ai, fallbackAi, attachment } = ctx;

  const deadairScriptPath = path.resolve(__dirname, "deadair.py");
  let deadairOutput = "";
  let tempFilePath = "";

  // Check if transcript is in attachment or embedded in task
  const rawTranscript = attachment?.data ? Buffer.from(attachment.data, "base64").toString("utf-8") : (task.includes("-->") ? task : "");

  if (rawTranscript) {
    try {
      tempFilePath = path.join(os.tmpdir(), `yt_edit_${Date.now()}.srt`);
      await fs.writeFile(tempFilePath, rawTranscript, "utf-8");
      const { stdout } = await runPythonTool(deadairScriptPath, [tempFilePath, "--floor", "0.35"]);
      deadairOutput = stdout.trim();
    } catch (err: any) {
      console.warn("[YT-EDIT] deadair.py run note:", err?.message || err);
    } finally {
      if (tempFilePath) {
        fs.unlink(tempFilePath).catch(() => {});
      }
    }
  }

  const systemInstruction = `You are the lead YouTube Video Editor adhering to the yt-edit protocol.
An edit decision list (EDL) from a timestamped transcript. It prints the cuts. The creator applies them.
Categories of cuts:
1. DEAD - gaps longer than 0.35s, trimmed from the middle so both sides keep a breath.
2. FILLER - cues that are nothing but "um", "so yeah", "basically".
3. REPEAT - restarted takes (second take of the same opening or line).

Rules:
- If a transcript was supplied, present the exact cuts with timecodes, the total time saved, and the trimmed target runtime.
- If no transcript was provided, ask the user to paste their timestamped transcript (.srt, .vtt, or Whisper JSON) and give actionable editing advice.
- End with the exact gate question:
  **ship it, or change it?**`;

  const prompt = `User Edit Request:
${task}

${deadairOutput ? `Automated EDL Analysis (via deadair.py):\n${deadairOutput}\n` : "No timestamped transcript file attached yet."}

Generate the Edit Decision List and pacing recommendations.`;

  const report = await generateYouTubeResponse(ai, prompt, systemInstruction, fallbackAi);

  return {
    skill: "yt-edit",
    title: "YouTube Video Edit Decision List (Pacing & Dead Air)",
    report,
    gateQuestion: "**ship it, or change it?**",
  };
}

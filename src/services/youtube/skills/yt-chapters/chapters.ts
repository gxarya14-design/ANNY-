import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { YouTubeAgentContext, YouTubeSkillResult } from "../../types.js";
import { runPythonTool, generateYouTubeResponse } from "../../utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runYouTubeChapters(ctx: YouTubeAgentContext): Promise<YouTubeSkillResult> {
  const { task, ai, fallbackAi, attachment } = ctx;

  const chaptersScriptPath = path.resolve(__dirname, "chapters.py");
  let toolOutput = "";
  let tempSrtPath = "";

  const transcript = attachment?.data ? Buffer.from(attachment.data, "base64").toString("utf-8") : (task.includes("-->") ? task : "");

  if (transcript) {
    try {
      tempSrtPath = path.join(os.tmpdir(), `yt_chapters_${Date.now()}.srt`);
      await fs.writeFile(tempSrtPath, transcript, "utf-8");
      const { stdout } = await runPythonTool(chaptersScriptPath, [tempSrtPath, "--target", "8"]);
      toolOutput = stdout.trim();
    } catch (err: any) {
      console.warn("[YT-CHAPTERS] chapters.py run note:", err?.message || err);
    } finally {
      if (tempSrtPath) {
        fs.unlink(tempSrtPath).catch(() => {});
      }
    }
  }

  const systemInstruction = `You are the lead YouTube Chapters Specialist adhering to the yt-chapters protocol.
Rules that are NOT optional:
- The first entry MUST be 00:00.
- There must be AT LEAST THREE chapters.
- Each must be AT LEAST 10 seconds long.
- Retitle every line: rewrite each chapter name as the promise of that section in 3 to 5 words (not placeholders like "Introduction" or "Topic 1").
- End with the exact gate question:
  **ship it, or change it?**`;

  const prompt = `Video Breakdown Request:
${task}

${toolOutput ? `Automated Timestamps & Detected Boundaries (via chapters.py):\n${toolOutput}\n` : "Generate optimized timestamp chapter outline."}

Deliver the validated YouTube chapter list ready to paste directly into the video description.`;

  const report = await generateYouTubeResponse(ai, prompt, systemInstruction, fallbackAi);

  return {
    skill: "yt-chapters",
    title: "YouTube Video Chapters & Timestamps",
    report,
    gateQuestion: "**ship it, or change it?**",
  };
}

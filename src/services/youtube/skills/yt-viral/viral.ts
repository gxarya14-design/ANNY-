import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { YouTubeAgentContext, YouTubeSkillResult } from "../../types.js";
import { runPythonTool, generateYouTubeResponse } from "../../utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runYouTubeViral(ctx: YouTubeAgentContext): Promise<YouTubeSkillResult> {
  const { task, ai, fallbackAi, attachment } = ctx;

  const swipeScriptPath = path.resolve(__dirname, "swipe.py");
  let toolOutput = "";
  let tempJsonPath = "";

  const jsonContent = attachment?.data && attachment.name.endsWith(".json") ? Buffer.from(attachment.data, "base64").toString("utf-8") : (task.trim().startsWith("[") && task.trim().endsWith("]") ? task : "");

  if (jsonContent) {
    try {
      tempJsonPath = path.join(os.tmpdir(), `yt_viral_${Date.now()}.json`);
      await fs.writeFile(tempJsonPath, jsonContent, "utf-8");
      const { stdout } = await runPythonTool(swipeScriptPath, [tempJsonPath, "--min", "1.5"]);
      toolOutput = stdout.trim();
    } catch (err: any) {
      console.warn("[YT-VIRAL] swipe.py run note:", err?.message || err);
    } finally {
      if (tempJsonPath) {
        fs.unlink(tempJsonPath).catch(() => {});
      }
    }
  }

  const systemInstruction = `You are the lead YouTube Viral & Outlier Strategist following the yt-viral protocol.
Raw view counts rank channel size, not ideas. This ranks by multiple over each channel's own median (> 2.0x outlier), which is the only version of the question about the video itself.

Rules:
- Identify true outliers: videos that vastly outperformed their channel average.
- Deconstruct the title formula against established patterns.
- What to replicate vs what is unique to the creator.
- If no video dataset is provided, identify trending outliers in the user's niche and break down why they popped.
- End with the exact gate question:
  **ship it, or change it?**`;

  const prompt = `User Viral Analysis Request:
${task}

${toolOutput ? `Automated Outlier Scoring (via swipe.py):\n${toolOutput}\n` : "No collected video dataset JSON provided."}

Deliver the outlier deconstruction and actionable swipe file.`;

  const report = await generateYouTubeResponse(ai, prompt, systemInstruction, fallbackAi);

  return {
    skill: "yt-viral",
    title: "YouTube Viral Outliers & Swipe Analysis",
    report,
    gateQuestion: "**ship it, or change it?**",
  };
}

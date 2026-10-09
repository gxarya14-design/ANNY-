import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { YouTubeAgentContext, YouTubeSkillResult } from "../../types.js";
import { runPythonTool, generateYouTubeResponse } from "../../utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runYouTubeRetention(ctx: YouTubeAgentContext): Promise<YouTubeSkillResult> {
  const { task, ai, fallbackAi, attachment, channelData } = ctx;

  const retentionScriptPath = path.resolve(__dirname, "retention.py");
  let toolOutput = "";
  let tempCsvPath = "";

  const csvContent = channelData?.retentionCsvData || (attachment?.data && attachment.name.endsWith(".csv") ? Buffer.from(attachment.data, "base64").toString("utf-8") : "");

  if (csvContent) {
    try {
      tempCsvPath = path.join(os.tmpdir(), `yt_retention_${Date.now()}.csv`);
      await fs.writeFile(tempCsvPath, csvContent, "utf-8");
      const { stdout } = await runPythonTool(retentionScriptPath, [tempCsvPath]);
      toolOutput = stdout.trim();
    } catch (err: any) {
      console.warn("[YT-RETENTION] retention.py run note:", err?.message || err);
    } finally {
      if (tempCsvPath) {
        fs.unlink(tempCsvPath).catch(() => {});
      }
    }
  }

  const systemInstruction = `You are the lead YouTube Retention Analyst adhering strictly to the yt-retention protocol.
The audience retention graph is the only honest feedback YouTube gives.
Diagnose 3 distinct patterns:
1. HOOK LEAK - lost in the first 30 seconds. Under 25% is healthy. Always fixed in the first 15 seconds of the script, not the edit.
2. CLIFFS - single steep drops. Specific moments: topic change with no signposting, sponsor read, slow setup.
3. SLIDE - steady bleed across the middle. Pacing problem solved by cutting, not rewriting.

Hand back:
- The single biggest leak and ONE specific change for it (not a list of five).
- If the hook leak is healthy and the slide is flat, tell them the video is fine and the problem is packaging.
- If no retention CSV was attached, guide them on how to export it from YouTube Studio (Studio -> Analytics -> Engagement -> download icon -> "Audience retention") and ask for it.
- End with the exact gate question:
  **ship it, or change it?**`;

  const prompt = `User Retention Analysis Request:
${task}

${toolOutput ? `Automated Retention Curve Metrics (via retention.py):\n${toolOutput}\n` : "No retention CSV attached."}

Deliver the retention diagnosis.`;

  const report = await generateYouTubeResponse(ai, prompt, systemInstruction, fallbackAi);

  return {
    skill: "yt-retention",
    title: "YouTube Audience Retention Diagnostics",
    report,
    gateQuestion: "**ship it, or change it?**",
  };
}

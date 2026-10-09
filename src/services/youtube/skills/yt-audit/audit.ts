import path from "path";
import { fileURLToPath } from "url";
import { YouTubeAgentContext, YouTubeSkillResult } from "../../types.js";
import { readVoiceProfile, runPythonTool, generateYouTubeResponse } from "../../utils.js";
import { searchYouTubeTrending } from "../../../agents/youtube.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runYouTubeAudit(ctx: YouTubeAgentContext): Promise<YouTubeSkillResult> {
  const { task, ai, fallbackAi, channelData } = ctx;
  const voice = await readVoiceProfile();

  // Extract any provided titles, URLs, or channel names from task or channelData
  const titles: string[] = channelData?.titles || [];
  const lines = task.split("\n").map((l) => l.trim()).filter(Boolean);
  
  for (const l of lines) {
    if (l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l)) {
      const clean = l.replace(/^[-*\d.]+\s*/, "").trim();
      if (clean.length > 5 && !titles.includes(clean)) {
        titles.push(clean);
      }
    }
  }

  // Extract channel URL / handle if mentioned
  const urlMatch = task.match(/https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s]+/i);
  const channelUrl = channelData?.channelUrl || (urlMatch ? urlMatch[0] : "");

  // If a channel name/query is detected, try grounding with YouTube API
  let liveBenchmarkInfo = "";
  const channelQueryMatch = task.match(/(?:channel|for|audit)\s+([A-Za-z0-9_\-\s]{3,30})/i);
  const potentialChannel = channelData?.channelTitle || (channelQueryMatch ? channelQueryMatch[1].trim() : "");
  if (potentialChannel && potentialChannel.length > 2 && potentialChannel.length < 35) {
    try {
      const liveItems = await searchYouTubeTrending(potentialChannel, "IN", 6);
      if (liveItems.length > 0) {
        liveBenchmarkInfo = `Live Search Benchmarks Found for "${potentialChannel}":\n` +
          liveItems.map((v, i) => `${i + 1}. "${v.title}" by ${v.channelTitle} (${v.publishedAt})`).join("\n");
      }
    } catch {
      // Non-fatal
    }
  }

  // 1. Run title analysis via yt-package/title.py if titles are provided
  let titleToolAnalysis = "";
  if (titles.length > 0) {
    try {
      const titleScriptPath = path.resolve(__dirname, "..", "yt-package", "title.py");
      const titleResults: string[] = [];
      for (const t of titles.slice(0, 10)) {
        const { stdout } = await runPythonTool(titleScriptPath, ["--title", t, "--json"]);
        try {
          const parsed = JSON.parse(stdout);
          if (Array.isArray(parsed) && parsed[0]) {
            const p = parsed[0];
            titleResults.push(`- "${t}": ${p.chars} chars, Score: ${p.score}/100. Issues: ${p.issues?.map((x: any) => x[1]).join("; ") || "None"}`);
          }
        } catch {
          titleResults.push(`- "${t}": raw lint output: ${stdout.trim()}`);
        }
      }
      titleToolAnalysis = titleResults.join("\n");
    } catch (err: any) {
      console.warn("[YT-AUDIT] title.py execution note:", err?.message || err);
    }
  }

  // 2. Run hookscore.py if opening lines / transcripts are provided
  let hookToolAnalysis = "";
  const recentHooks = channelData?.recentOpeningLines || [];
  if (recentHooks.length > 0) {
    try {
      const hookScriptPath = path.resolve(__dirname, "..", "yt-script", "hookscore.py");
      const hookResults: string[] = [];
      for (const h of recentHooks.slice(0, 3)) {
        const { stdout } = await runPythonTool(hookScriptPath, ["--hook", h, "--json"]);
        try {
          const parsed = JSON.parse(stdout);
          if (Array.isArray(parsed) && parsed[0]) {
            const p = parsed[0];
            hookResults.push(`- "${h}": Score ${p.verdict}/100 (${p.band}), Formula: ${p.formula || "Custom"}`);
          }
        } catch {
          hookResults.push(`- "${h}": raw output: ${stdout.trim()}`);
        }
      }
      hookToolAnalysis = hookResults.join("\n");
    } catch (err: any) {
      console.warn("[YT-AUDIT] hookscore.py execution note:", err?.message || err);
    }
  }

  // Check what metrics are available vs missing
  const hasTenTitles = titles.length >= 10;
  const hasThumbnails = Boolean(channelData?.thumbnails && channelData.thumbnails.length > 0);
  const hasHooks = recentHooks.length >= 3;
  const hasRhythm = Boolean(channelData?.uploadDates && channelData.uploadDates.length > 0);
  const hasRetention = Boolean(channelData?.retentionCsvData);

  const missingMetrics: string[] = [];
  if (!hasTenTitles) {
    missingMetrics.push(`Last 10 video titles (currently provided: ${titles.length})`);
  }
  if (!hasThumbnails) {
    missingMetrics.push("Thumbnail feed-size readability samples or images");
  }
  if (!hasHooks) {
    missingMetrics.push("First 15-second opening lines/transcripts of your 3 most recent videos");
  }
  if (!hasRhythm) {
    missingMetrics.push("Upload rhythm & exact publish dates over the last 60 days");
  }
  if (!hasRetention) {
    missingMetrics.push("Audience retention export (.csv from YouTube Studio Analytics)");
  }

  const systemInstruction = `You are the lead YouTube Channel Auditor applying the strict yt-audit protocol.
Audit a YouTube channel end to end: packaging, consistency, the first fifteen seconds, and what to fix first.
An audit that lists twenty problems is a way of avoiding the one that matters. This ends in ONE fix.

CRITICAL RULES:
1. NEVER invent a number, a result, a view count, or a source. Strictly use ONLY available channel data.
   If a figure would strengthen it and you do not have one, state that it was not provided or ask for it.
2. If specific metrics are missing, YOU MUST explicitly list what metrics are missing and ask for clarification, while providing the audit on whatever real data is present.
3. Order of analysis:
   - 1. The last ten titles, as a set: Do they promise different things? Check format repetition.
   - 2. The thumbnails at feed size: If unreadable at mobile size, that is the primary blocker.
   - 3. The first fifteen seconds of 3 recent videos: Hook clarity, stakes, curiosity.
   - 4. Upload rhythm: Consistency over raw frequency.
   - 5. Retention shape if available.
4. What to hand back:
   - The SINGLE biggest fix, named, with concrete actions to execute this week.
   - Three things that are ALREADY working, so they do not break them (specific observations, never fake praise).
   - What NOT to do yet, and why.
   - If metrics were missing, a brief "Metrics Needed for Full 5-Stage Audit" clarification request.
   - NEVER open with false praise.
   - NEVER list twenty things.
5. The gate:
   Every output MUST end in a clear copyable block, and the final sentence of your response must be exactly:
   **ship it, or change it?**`;

  const prompt = `User Channel Audit Request:
${task}

${channelUrl ? `Channel URL: ${channelUrl}\n` : ""}
${voice ? `Creator Voice Profile:\n${voice}\n` : ""}
${liveBenchmarkInfo ? `${liveBenchmarkInfo}\n` : ""}
${titleToolAnalysis ? `Automated Title Analysis (via title.py):\n${titleToolAnalysis}\n` : `Titles Provided: ${titles.length > 0 ? titles.join("\n") : "None provided in initial prompt"}\n`}
${hookToolAnalysis ? `Automated Hook Analysis (via hookscore.py):\n${hookToolAnalysis}\n` : `Recent 15-Second Opening Lines: ${recentHooks.length > 0 ? recentHooks.join("\n") : "None provided in initial prompt"}\n`}
${missingMetrics.length > 0 ? `MISSING METRICS IDENTIFIED:\n${missingMetrics.map((m) => `- ${m}`).join("\n")}\n` : "All 5 core metrics provided."}

Analyze the channel's overall health and content strategy following the yt-audit protocol strictly.
Remember:
- Base every single observation only on what is verifiable.
- Never fabricate numbers or assume unstated metrics.
- Ask for clarification on missing metrics.
- Hand back: The single biggest fix for this week, three specific things already working, what NOT to do yet, and end with the gate question.`;

  const report = await generateYouTubeResponse(ai, prompt, systemInstruction, fallbackAi);

  return {
    skill: "yt-audit",
    title: "YouTube Channel Strategic Audit",
    report,
    gateQuestion: "**ship it, or change it?**",
  };
}

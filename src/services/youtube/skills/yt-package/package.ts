import path from "path";
import { fileURLToPath } from "url";
import { YouTubeAgentContext, YouTubeSkillResult } from "../../types.js";
import { readVoiceProfile, runPythonTool, generateYouTubeResponse } from "../../utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runYouTubePackage(ctx: YouTubeAgentContext): Promise<YouTubeSkillResult> {
  const { task, ai, fallbackAi } = ctx;
  const voice = await readVoiceProfile();

  const titleScriptPath = path.resolve(__dirname, "title.py");

  const systemInstruction = `You are the lead YouTube Packaging Strategist following the yt-package protocol.
The title and the thumbnail are ONE unit. Writing them separately is why packaging fails: the thumbnail repeats the title, and half the click surface says the same thing twice.

Rules:
1. Provide 5 distinct, high-CTR Title + Thumbnail Concept pairings.
2. For each pairing:
   - TITLE: under 60 characters (desktop cutoff) and mindful of the 40-character mobile feed cutoff.
   - THUMBNAIL TEXT: 2-4 words max, MUST NOT repeat the words from the title. Different words, same promise.
   - VISUAL SCENE: Exact layout, facial expression / focal subject, color contrast, and background element.
3. Every pairing must be categorized by psychological trigger (Curiosity Gap, Bold Claim, Question, Extreme Contrast, Direct Benefit).
4. End with a copyable summary block and the exact gate question:
   **ship it, or change it?**`;

  const prompt = `Video Topic / Premise:
${task}

${voice ? `Creator Voice Profile:\n${voice}\n` : ""}

Generate 5 production-ready Title & Thumbnail pairings adhering strictly to the packaging protocol.`;

  const rawReport = await generateYouTubeResponse(ai, prompt, systemInstruction, fallbackAi);

  // Extract titles to test with title.py
  const lines = rawReport.split("\n");
  const extractedTitles: { title: string; thumbText?: string }[] = [];
  for (const l of lines) {
    const tm = l.match(/(?:Title(?:\s*\d+)?:\s*["“]?)([^"”\n\r]+)["”]?/i);
    if (tm && tm[1].trim().length > 5) {
      extractedTitles.push({ title: tm[1].trim() });
    }
  }

  let lintSummary = "";
  if (extractedTitles.length > 0) {
    const lintResults: string[] = [];
    for (const item of extractedTitles.slice(0, 5)) {
      try {
        const { stdout } = await runPythonTool(titleScriptPath, ["--title", item.title, "--json"]);
        const parsed = JSON.parse(stdout);
        if (Array.isArray(parsed) && parsed[0]) {
          const p = parsed[0];
          lintResults.push(`- "${item.title}": ${p.chars} chars (${p.score}/100) | ${p.issues?.map((x: any) => x[1]).join(", ") || "Clean fit"}`);
        }
      } catch {
        // Continue
      }
    }
    if (lintResults.length > 0) {
      lintSummary = `\n\n### 🔍 Title Lint Checks (via title.py)\n${lintResults.join("\n")}`;
    }
  }

  const finalReport = `${rawReport}${lintSummary}\n\n**ship it, or change it?**`;

  return {
    skill: "yt-package",
    title: "YouTube Title & Thumbnail Packaging Suite",
    report: finalReport,
    gateQuestion: "**ship it, or change it?**",
  };
}

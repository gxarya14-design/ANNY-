import path from "path";
import { fileURLToPath } from "url";
import { YouTubeAgentContext, YouTubeSkillResult } from "../../types.js";
import { readVoiceProfile, runPythonTool, generateYouTubeResponse } from "../../utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runYouTubeScript(ctx: YouTubeAgentContext): Promise<YouTubeSkillResult> {
  const { task, ai, fallbackAi } = ctx;
  const voice = await readVoiceProfile();

  // Pass 1: Generate 5 hook options based on 21 formulas
  const hookGenSystem = `You are an elite YouTube hook writer.
Based on the user's video idea, write exactly 5 distinct hook options (first 15 seconds) using established YouTube hook formulas (e.g. "I Tried It", "Negative Constraint", "Curiosity Gap", "The Secret", "Unpopular Truth", "Specific Contrast", "High Stakes Countdown").
Output format:
1. Hook 1: [Text]
2. Hook 2: [Text]
3. Hook 3: [Text]
4. Hook 4: [Text]
5. Hook 5: [Text]`;

  const hookGenRes = await generateYouTubeResponse(ai, `Topic/Idea: ${task}`, hookGenSystem, fallbackAi);
  const hookLines = hookGenRes
    .split("\n")
    .map((l) => l.replace(/^\d+[\.\)]\s*(Hook\s*\d+:)?\s*/i, "").trim())
    .filter((l) => l.length > 10);

  // Score hooks using hookscore.py
  const hookScriptPath = path.resolve(__dirname, "hookscore.py");
  const scoredHooks: { text: string; score: number; band: string; formula: string }[] = [];

  for (const h of hookLines.slice(0, 5)) {
    try {
      const { stdout } = await runPythonTool(hookScriptPath, ["--hook", h, "--json"]);
      const parsed = JSON.parse(stdout);
      if (Array.isArray(parsed) && parsed[0]) {
        scoredHooks.push({
          text: h,
          score: parsed[0].verdict ?? 50,
          band: parsed[0].band ?? "AVERAGE",
          formula: parsed[0].formula ?? "Custom",
        });
      }
    } catch {
      scoredHooks.push({ text: h, score: 50, band: "AVERAGE", formula: "Custom" });
    }
  }

  scoredHooks.sort((a, b) => b.score - a.score);
  const topTwo = scoredHooks.slice(0, 2);

  // Pass 2: Write the full script using the winning hook and marked retention beats
  const scriptSystem = `You are a master YouTube scriptwriter adhering to the yt-script protocol.
Rules:
1. Show the top TWO hooks with their scores and formula classification so the creator can choose.
2. Write the full spoken script with marked retention beats:
   - [0:00 - 0:15] [CONFIRM CLICK & HOOK]
   - [0:15 - 0:45] [OPEN CORE QUESTION / STAKES]
   - [RETENTION BEAT: RE-ENGAGE] every 90-120 seconds (pattern interrupt, visual cue, or escalating curiosity)
   - [PAYOFF / CLIMAX] delivering directly on the hook's promise
   - [OUTRO / NEXT VIDEO BRIDGE] seamless loop or next video bridge (no dead-air "thanks for watching" filler).
3. Do not invent facts or unverified figures.
4. The last line of the output MUST be the exact gate question:
   **ship it, or change it?**`;

  const scriptPrompt = `Idea / Topic:
${task}

${voice ? `Creator Voice Profile:\n${voice}\n` : ""}

Evaluated Hooks:
${scoredHooks.map((h, i) => `${i + 1}. "${h.text}" (Score: ${h.score}/100, Band: ${h.band}, Formula: ${h.formula})`).join("\n")}

Winning Top 2 Hooks:
1. "${topTwo[0]?.text || hookLines[0] || task}" (Score: ${topTwo[0]?.score || "N/A"})
2. "${topTwo[1]?.text || hookLines[1] || ""}" (Score: ${topTwo[1]?.score || "N/A"})

Now generate the complete script deliverable according to the protocol.`;

  const report = await generateYouTubeResponse(ai, scriptPrompt, scriptSystem, fallbackAi);

  return {
    skill: "yt-script",
    title: "YouTube Video Script & Hook Architecture",
    report,
    gateQuestion: "**ship it, or change it?**",
  };
}

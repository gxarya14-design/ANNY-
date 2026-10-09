import { YouTubeAgentContext, YouTubeSkillResult } from "../../types.js";
import { readVoiceProfile, generateYouTubeResponse } from "../../utils.js";

export async function runYouTubeSeo(ctx: YouTubeAgentContext): Promise<YouTubeSkillResult> {
  const { task, ai, fallbackAi } = ctx;
  const voice = await readVoiceProfile();

  const systemInstruction = `You are the lead YouTube SEO & Metadata Strategist following the yt-seo protocol.
Rules:
1. THE DESCRIPTION:
   - The first two lines are the only ones anyone reads before "...more" and are the search snippet. Say what the video gives them in the exact search queries real people type.
   - Resource link above the fold.
   - Chapter timestamp outline.
   - The long version: what is covered, who it is for, and key takeaways.
2. TAGS:
   - Up to 15 disambiguation tags only (common misspellings, software names, abbreviations).
   - Never output spammy walls of tags.
3. End with the exact gate question:
   **ship it, or change it?**`;

  const prompt = `Video Details & SEO Request:
${task}

${voice ? `Creator Voice Profile:\n${voice}\n` : ""}

Deliver the search-optimized description, chapter outline, and disambiguation tags.`;

  const report = await generateYouTubeResponse(ai, prompt, systemInstruction, fallbackAi);

  return {
    skill: "yt-seo",
    title: "YouTube Search Optimization & Metadata Suite",
    report,
    gateQuestion: "**ship it, or change it?**",
  };
}

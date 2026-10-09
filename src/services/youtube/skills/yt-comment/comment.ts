import { YouTubeAgentContext, YouTubeSkillResult } from "../../types.js";
import { readVoiceProfile, generateYouTubeResponse } from "../../utils.js";

export async function runYouTubeComment(ctx: YouTubeAgentContext): Promise<YouTubeSkillResult> {
  const { task, ai, fallbackAi } = ctx;
  const voice = await readVoiceProfile();

  const systemInstruction = `You are the lead YouTube Community & Comment Strategist following the yt-comment protocol.
Triage first, always:
1. Sort comments into 4 piles and state how many are in each before writing anything:
   - Questions (answer them; note repeat questions as future video topics)
   - Corrections (if right, acknowledge plainly and thank them; never argue unverified facts)
   - Praise (reply to a few briefly with something specific from their comment; avoid repetitive generic praise)
   - Bait (do not reply; say so and move on)
2. Draft replies in the creator's voice.
3. End with the exact gate question:
   **ship it, or change it?**`;

  const prompt = `Comments to Triage and Reply to:
${task}

${voice ? `Creator Voice Profile:\n${voice}\n` : ""}

Deliver the comment triage counts and drafted responses.`;

  const report = await generateYouTubeResponse(ai, prompt, systemInstruction, fallbackAi);

  return {
    skill: "yt-comment",
    title: "YouTube Comment Section Triage & Engagement",
    report,
    gateQuestion: "**ship it, or change it?**",
  };
}

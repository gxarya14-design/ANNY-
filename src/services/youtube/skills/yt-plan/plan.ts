import { YouTubeAgentContext, YouTubeSkillResult } from "../../types.js";
import { readVoiceProfile, generateYouTubeResponse } from "../../utils.js";

export async function runYouTubePlan(ctx: YouTubeAgentContext): Promise<YouTubeSkillResult> {
  const { task, ai, fallbackAi } = ctx;
  const voice = await readVoiceProfile();

  const systemInstruction = `You are the lead YouTube Content Planning Strategist adhering to the yt-plan protocol.
The shape of a week:
- ONE ANCHOR: The main video the week is for. Gets the most production time and publishes on the channel's best day (ask for analytics day, never assume Tuesday).
- ONE CHEAP ONE: Built from something that already exists: a reaction, follow-up, or answering the top comment from last week.
- THREE SHORTS FROM THE ANCHOR: Cut from the long video, not written separately.
Three uploads on a seven-day week, not seven. A plan that posts daily is unsustainable.
End with the exact gate question:
**ship it, or change it?**`;

  const prompt = `Planning Request:
${task}

${voice ? `Creator Voice Profile:\n${voice}\n` : ""}

Deliver the sustainable weekly upload blueprint.`;

  const report = await generateYouTubeResponse(ai, prompt, systemInstruction, fallbackAi);

  return {
    skill: "yt-plan",
    title: "YouTube Sustainable Weekly Content Plan",
    report,
    gateQuestion: "**ship it, or change it?**",
  };
}

import { YouTubeAgentContext, YouTubeSkillName, YouTubeSkillResult } from "./types.js";
import { runYouTubeAudit } from "./skills/yt-audit/index.js";
import { runYouTubeScript } from "./skills/yt-script/index.js";
import { runYouTubePackage } from "./skills/yt-package/index.js";
import { runYouTubeEdit } from "./skills/yt-edit/index.js";
import { runYouTubeComment } from "./skills/yt-comment/index.js";
import { runYouTubePlan } from "./skills/yt-plan/index.js";
import { runYouTubeViral } from "./skills/yt-viral/index.js";
import { runYouTubeRetention } from "./skills/yt-retention/index.js";
import { runYouTubeShorts } from "./skills/yt-shorts/index.js";
import { runYouTubeSeo } from "./skills/yt-seo/index.js";
import { runYouTubeChapters } from "./skills/yt-chapters/index.js";

export function resolveYouTubeSkill(task: string): YouTubeSkillName {
  const t = task.trim().toLowerCase();

  // 1. Direct slash command matching
  if (t.startsWith("/yt-audit") || t.includes("/yt-audit")) return "yt-audit";
  if (t.startsWith("/yt-script") || t.includes("/yt-script")) return "yt-script";
  if (t.startsWith("/yt-package") || t.includes("/yt-package")) return "yt-package";
  if (t.startsWith("/yt-edit") || t.includes("/yt-edit")) return "yt-edit";
  if (t.startsWith("/yt-comment") || t.includes("/yt-comment")) return "yt-comment";
  if (t.startsWith("/yt-plan") || t.includes("/yt-plan")) return "yt-plan";
  if (t.startsWith("/yt-viral") || t.includes("/yt-viral")) return "yt-viral";
  if (t.startsWith("/yt-retention") || t.includes("/yt-retention")) return "yt-retention";
  if (t.startsWith("/yt-shorts") || t.includes("/yt-shorts")) return "yt-shorts";
  if (t.startsWith("/yt-seo") || t.includes("/yt-seo")) return "yt-seo";
  if (t.startsWith("/yt-chapters") || t.includes("/yt-chapters")) return "yt-chapters";

  // 2. Natural language triggers for Channel Audit
  if (
    /(analyze my channel|audit my channel|audit channel|review my channel|review my videos|why isn't my channel growing|channel audit|channel health|channel overall health|channel strategy)/i.test(t)
  ) {
    return "yt-audit";
  }

  // 3. Natural language for Video Script
  if (
    /(script|write my next video|write a script|hook option|opening line|what should i say|video script|script likho|dialogue for video)/i.test(t)
  ) {
    return "yt-script";
  }

  // 4. Natural language for Packaging (Title + Thumbnail)
  if (
    /(title|thumbnail|ctr|packaging|click through rate|what should i call this|title ideas|thumbnail text|repackage)/i.test(t)
  ) {
    return "yt-package";
  }

  // 5. Natural language for Editing / EDL / Dead Air
  if (
    /(dead air|cut dead space|tighten this video|i rambled|edit decision list|edl|cut the gaps|remove filler|edit my recording)/i.test(t)
  ) {
    return "yt-edit";
  }

  // 6. Natural language for Audience Retention
  if (
    /(retention|why do people stop watching|my retention is bad|retention chart|retention csv|retention drop|audience retention|fix my pacing)/i.test(t)
  ) {
    return "yt-retention";
  }

  // 7. Natural language for Shorts
  if (
    /(cut this into shorts|cut into shorts|clip this|repurpose this video|what should i clip|make shorts|generate shorts)/i.test(t)
  ) {
    return "yt-shorts";
  }

  // 8. Natural language for Viral / Outliers
  if (
    /(viral|what's working right now|whats working|competitor research|why did this blow up|outlier videos|swipe file|viral analysis)/i.test(t)
  ) {
    return "yt-viral";
  }

  // 9. Natural language for Chapters & Timestamps
  if (
    /(chapters|timestamps|break this video into sections|video sections|add chapters|timestamp outline)/i.test(t)
  ) {
    return "yt-chapters";
  }

  // 10. Natural language for Comments
  if (
    /(comment|reply to comments|handle the comment section|someone asked|triage comments|comment thread)/i.test(t)
  ) {
    return "yt-comment";
  }

  // 11. Natural language for Content Plan
  if (
    /(content plan|weekly plan|upload schedule|upload rhythm|schedule my uploads|how often should i post|editorial calendar)/i.test(t)
  ) {
    return "yt-plan";
  }

  // 12. Natural language for SEO & Metadata
  if (
    /(seo|tags|description|search keywords|help this video get found|metadata|ranking keywords)/i.test(t)
  ) {
    return "yt-seo";
  }

  // Default fallback for general channel or video analysis
  if (/channel/i.test(t)) {
    return "yt-audit";
  }

  return "yt-package";
}

export async function dispatchYouTubeAgentSkill(ctx: YouTubeAgentContext): Promise<YouTubeSkillResult> {
  const skill = resolveYouTubeSkill(ctx.task);
  console.log(`[YOUTUBE AGENT ROUTER] Dispatched task "${ctx.task.slice(0, 60)}..." to skill [${skill}]`);

  switch (skill) {
    case "yt-audit":
      return await runYouTubeAudit(ctx);
    case "yt-script":
      return await runYouTubeScript(ctx);
    case "yt-package":
      return await runYouTubePackage(ctx);
    case "yt-edit":
      return await runYouTubeEdit(ctx);
    case "yt-comment":
      return await runYouTubeComment(ctx);
    case "yt-plan":
      return await runYouTubePlan(ctx);
    case "yt-viral":
      return await runYouTubeViral(ctx);
    case "yt-retention":
      return await runYouTubeRetention(ctx);
    case "yt-shorts":
      return await runYouTubeShorts(ctx);
    case "yt-seo":
      return await runYouTubeSeo(ctx);
    case "yt-chapters":
      return await runYouTubeChapters(ctx);
    default:
      return await runYouTubeAudit(ctx);
  }
}

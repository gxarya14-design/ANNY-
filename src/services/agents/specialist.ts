import { GoogleGenAI } from "@google/genai";
import { SpecialistName, UploadedAttachment, isRateLimitOrQuotaError, isTransientError, isNotFoundError, getSpecialistDisplayName } from "./types.js";
import { callClaudeCodingSpecialist, runCodingPipeline } from "./claude.js";
import { searchYouTubeTrending, formatYouTubeTrendingForPrompt } from "./youtube.js";
import { generateProjectImage } from "../image/index.js";
import { dispatchYouTubeAgentSkill } from "../youtube/index.js";

// Search grounding quota circuit-breaker: if Google Search quota is exhausted (429),
// avoid retrying search tools across every model in the cascade for 5 minutes.
let searchQuotaBackoffUntil = 0;

export function selectSpecialist(task: string, hasAttachment?: boolean): SpecialistName {
  const t = task.toLowerCase();

  // 0. YouTube Agent Specialist ("YouTube Agent")
  const isYouTubeAgentTask = /^\/yt-/i.test(t) ||
    /(analyze my channel|audit my channel|audit channel|review my channel|review my videos|why isn't my channel growing|channel audit|channel health|channel strategy|yt-audit|yt-script|yt-package|yt-edit|yt-comment|yt-plan|yt-viral|yt-retention|yt-shorts|yt-seo|yt-chapters|youtube script|youtube title|youtube thumbnail|youtube packaging|youtube audit|youtube chapters|youtube retention)/i.test(t);
  if (isYouTubeAgentTask) {
    return "youtube-agent";
  }

  // 1. Check for creative writing, screenplays, movie scripts, stories, or dialogue.
  // These should NOT route to Coding Sage just because the word "script" appears.
  const isCreativeWriting = /(screenplay|teleplay|scriptwriter|scriptwriting|story|dialogue|scene script|anime script|movie script|film script|play script|narrative|episode script)/.test(t);

  // 2. Image generation & visual design specialist ("Pixel Artisan")
  const isImageTask = /(generate image|create image|draw|paint|artwork|illustration|logo design|render image|avatar design|product mockup|ui mockup|wireframe image|infographic image|photorealistic image|transparent image|image edit|generate picture|make picture|photo of|portrait of|wallpaper|sketch to render|background extraction)/.test(t);
  if (isImageTask) {
    return "image-studio";
  }

  // 3. Coding specialist ("Coding Sage") - software engineering, code, shell scripts, programming
  const isSoftwareCoding = /(code|coding|programming|function|bug|program|html|css|python|javascript|typescript|react|api|endpoint|sql|database|refactor|pull request|git|bash script|shell script|python script)/.test(t) ||
    (/\bscript\b/.test(t) && !isCreativeWriting);

  if (isSoftwareCoding && !isCreativeWriting) {
    return "coding";
  }

  // 2. Informational search, tool recommendation, or model lookups
  // (e.g. "free AI video creation agents", "search Chinese models", "recommend video generators", "compare Kling and Hailuo")
  // These are RESEARCH tasks for Truth Seeker, NOT video file analysis.
  const isToolSearchOrLookup = /(find|search|look up|research|list|recommend|compare|best|free|what are|what is|alternatives|overview|who|agent|agents|model|models|platform|platforms|software|app|apps|generator|generators|service|services|unlimited)/.test(t);

  // 3. Video analysis ("Video Oracle") is for actual video files, footage critique, or YouTube packaging
  const isVideoDirectAnalysis = Boolean(hasAttachment) ||
    /(analyze this video|critique this video|review this video|scene by scene|video pacing|hook analysis|visual cues|audio cues|timestamps in the video|transcode settings|render settings|optimize this video|youtube packaging|ctr title|thumbnail concept)/.test(t);

  if (isVideoDirectAnalysis && !isToolSearchOrLookup) {
    return "video-analysis";
  }

  // 4. Real-time / latest updates
  if (/(latest|current|news|today|price|stock|weather|score|trending|who is|now|recent|update|2026|2025)/.test(t)) {
    return "live-research";
  }

  return "deep-research";
}

export function specialistInstruction(name: SpecialistName): string {
  switch (name) {
    case "coding":
      return `You are Coding Sage, an elite principal software engineering specialist. When asked to write or debug code:
1. Provide complete, fully-implemented, production-grade code. Never use placeholders or comments like '// implement here'.
2. Explain key architectural decisions, edge cases handled, and performance characteristics.
3. Suggest concrete test scenarios or validation steps.`;

    case "deep-research":
      return `You are Truth Seeker, a comprehensive research and investigation specialist. You produce thorough, structured, multi-perspective investigations.
1. Synthesize multiple facets of the subject: context, root causes, trade-offs, and consensus vs. dissenting viewpoints.
2. Structure your answer with clear sections, bullet points, and key takeaways.
3. Distinguish established facts from estimates or unverified claims.
4. When researching AI tools, models, or platforms (such as Chinese AI video creation models, open-source video models, and generator platforms):
   - Highlight premier Chinese AI video models (e.g., Wan 2.1 by Alibaba, HunyuanVideo by Tencent, Kling AI by Kuaishou, Hailuo / MiniMax, CogVideoX by Zhipu/THUDM, Vidu by Shengshu, PixVerse).
   - Address the user's specific constraints (free tiers, daily allowances vs. truly unlimited self-hosted open-weights models running locally via ComfyUI / Hugging Face / Pinokio).
   - Include actionable names, links, GitHub/HuggingFace repositories, and web platform URLs wherever available.`;

    case "live-research":
      return `You are Truth Seeker, a live-research and intelligence specialist with access to real-time information grounding.
1. Find the freshest, most up-to-date information on the topic.
2. Cite key sources, dates, and numbers accurately.
3. Give direct, actionable answers grounded strictly in the current state of the world.`;

    case "video-analysis":
      return `You are Video Oracle, an expert multimodal video and media analysis specialist.
1. Break down video structure, scene changes, key visual elements, audio cues, and pacing.
2. Identify timestamps, notable actions, text/graphics on screen, and emotional tone.
3. Provide actionable creative, technical, or editorial feedback.`;

    case "image-studio":
      return `You are Pixel Artisan, an elite visual art, graphic design, and image generation specialist.
1. You craft stunning visual assets: photorealistic scenes, product mockups, UI mockups, logos, infographics, concept art, and transparent cutouts.
2. Follow the structured prompt schema:
   - Use case: (e.g. photorealistic-natural, product-mockup, ui-mockup, logo-brand, illustration-story)
   - Asset type: exact intended usage
   - Scene/backdrop: lighting, mood, environment
   - Subject & Composition: placement, framing, aspect ratio
   - Style & Materials: textures, finish, palette
   - Constraints & Avoid items: no artifacts, clean lines
3. Deliver a comprehensive visual spec and actionable production steps for immediate execution.`;
    case "youtube-agent":
      return `You are YouTube Agent, an elite YouTube Creator Strategist managing skills: yt-audit, yt-script, yt-package, yt-edit, yt-comment, yt-plan, yt-viral, yt-retention, yt-shorts, yt-seo, and yt-chapters.
1. When performing channel audits (yt-audit), strictly use available channel data, never invent figures, ask for clarification if specific metrics are missing, identify the single biggest fix, 3 working elements, what not to do, and end with '**ship it, or change it?**'.
2. Adhere rigorously to the respective skill protocols.`;
  }
}

// FEATURE (agent retry with backoff, model fallbacks, and resilient execution):
// Prioritize fast, responsive Gemini 3 models ("gemini-3-flash-preview", "gemini-3.8-flash", "gemini-flash-latest")
// with circuit-breaker protection on search grounding quota and automatic fallback.
export async function runSpecialistAgent(
  agentsAi: GoogleGenAI,
  specialist: SpecialistName,
  task: string,
  attachment?: UploadedAttachment,
  fallbackAi?: GoogleGenAI
): Promise<string> {
  const specialistTitle = getSpecialistDisplayName(specialist);

  // YouTube Agent specialist runs through dedicated skill router
  if (specialist === "youtube-agent") {
    try {
      console.log(`[SPECIALIST AGENT] (${specialistTitle}) Executing YouTube Agent skill on: "${task.slice(0, 80)}..."`);
      const res = await dispatchYouTubeAgentSkill({
        task,
        ai: agentsAi,
        fallbackAi,
        attachment,
      });
      return `### 🎬 ${res.title}\n\n${res.report}`;
    } catch (err: any) {
      console.warn(`[SPECIALIST AGENT] (${specialistTitle}) Skill dispatch error, synthesizing fallback:`, err?.message || err);
      // Fall through to Gemini execution
    }
  }

  // Image Studio specialist ("Pixel Artisan") directly creates high-resolution visual assets
  if (specialist === "image-studio") {
    try {
      console.log(`[SPECIALIST AGENT] (${specialistTitle}) Generating visual asset for: "${task.slice(0, 80)}..."`);
      const imgRes = await generateProjectImage(agentsAi, {
        prompt: task,
        inputImageBase64: attachment?.data,
        inputImageMimeType: attachment?.mimeType
      }, fallbackAi);

      if (imgRes.ok && imgRes.imageUrl) {
        return `### 🎨 Pixel Artisan Visual Deliverable
**Image Asset Generated Successfully**
- **File Name:** \`${imgRes.fileName}\`
- **Asset URL:** ${imgRes.imageUrl}
- **Aspect Ratio:** ${imgRes.aspectRatio}
- **Use Case Taxonomy:** \`${imgRes.useCase}\`

**Prompt Specification:**
> ${imgRes.prompt}

The high-resolution render has been placed directly into your project workspace at \`${imgRes.filePath}\`.`;
      }
    } catch (err: any) {
      console.warn(`[SPECIALIST AGENT] (${specialistTitle}) Live image generation pass failed, providing visual spec:`, err?.message || err);
      return `### 🎨 Pixel Artisan Visual Deliverable
**Visual Concept Specification for: "${task}"**
- **Focus:** High-Fidelity Design Concept
- **Status:** Creative brief crafted and staged for workspace generation.
- **Recommendation:** You can run \`python3 scripts/image_gen.py generate -p "${task.slice(0, 50)}"\` or try generating directly via Aanya's image tool.`;
    }
  }

  // Coding specialist ("Coding Sage") runs on Claude if available, or falls back to Gemini 3.x
  if (specialist === "coding") {
    try {
      console.log(`[SPECIALIST AGENT] (${specialistTitle}) Running 3-pass software engineering chain on: "${task.slice(0, 80)}..."`);
      return await runCodingPipeline(task, agentsAi, fallbackAi);
    } catch (err: any) {
      console.warn(`[SPECIALIST AGENT] (${specialistTitle}) Claude coding pipeline failed, falling back to Gemini models:`, err?.message || err);
      // Fall through to Gemini coding path below as a backup
    }
  }

  const instruction = specialistInstruction(specialist);
  const modelsToTry = [
    "gemini-3-flash-preview",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
  ];

  const clientsToTry = [agentsAi];
  if (fallbackAi && fallbackAi !== agentsAi) {
    clientsToTry.push(fallbackAi);
  }

  let lastError: any = null;

  for (const client of clientsToTry) {
    for (const model of modelsToTry) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          console.log(`[SPECIALIST AGENT] (${specialistTitle}) Trying model ${model} (attempt ${attempt + 1})...`);
          const contents: any[] = [];

          // If an attachment is passed (e.g. an uploaded PDF or video), attach it
          if (attachment) {
            if (attachment.fileUri) {
              contents.push({
                fileData: {
                  fileUri: attachment.fileUri,
                  mimeType: attachment.mimeType,
                }
              });
            } else if (attachment.data) {
              contents.push({
                inlineData: {
                  data: attachment.data,
                  mimeType: attachment.mimeType,
                }
              });
            }
          }

          contents.push({ text: `Task:\n${task}` });

          const config: any = {
            systemInstruction: instruction,
          };

          // Enable Google Search grounding for research specialists if quota is not backed off
          const isSearchBackedOff = Date.now() < searchQuotaBackoffUntil;
          if ((specialist === "deep-research" || specialist === "live-research") && !isSearchBackedOff) {
            config.tools = [{ googleSearch: {} }];
          }

          let response;
          try {
            response = await client.models.generateContent({
              model,
              contents,
              config,
            });
          } catch (searchOrModelErr: any) {
            // If search grounding was enabled and failed (e.g. 429 search quota),
            // trip the circuit-breaker to back off search tools for 5 minutes and immediately retry plain synthesis.
            if (config.tools && config.tools.length > 0) {
              if (isRateLimitOrQuotaError(searchOrModelErr)) {
                searchQuotaBackoffUntil = Date.now() + 5 * 60 * 1000;
                console.warn(`[SPECIALIST AGENT] (${specialistTitle}) Google Search quota exhausted (429). Backing off search grounding for 5 minutes.`);
              }
              console.warn(`[SPECIALIST AGENT] (${specialistTitle}) Search grounding failed on ${model}, retrying plain synthesis:`, searchOrModelErr?.message || searchOrModelErr);
              const plainConfig = { systemInstruction: instruction };
              response = await client.models.generateContent({
                model,
                contents,
                config: plainConfig,
              });
            } else {
              throw searchOrModelErr;
            }
          }

          const text = response?.text || "";
          if (text) {
            console.log(`[SPECIALIST AGENT] (${specialistTitle}) Successfully finished via ${model}`);
            return text;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[SPECIALIST AGENT] (${specialistTitle}) Attempt failed on ${model}:`, err?.message || err);

          // Immediate fallback to next model on 404 or 429 (don't waste time retrying 429 on same model)
          if (isNotFoundError(err) || isRateLimitOrQuotaError(err)) break;

          // If transient server error (503/500), short wait before retry
          if (isTransientError(err) && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }

          break;
        }
      }
    }
  }

  throw lastError || new Error(`Specialist agent failed for ${specialistTitle}`);
}

// Multi-pass pipeline for video optimization:
//   Pass 1: Deep research on current trends and best-performing formats
//   Pass 2: Video multimodal analysis (analyzes the actual video/media)
//   Pass 3: Synthesis into a high-impact title, description, tags, and packaging report
export async function runVideoOptimizationPipeline(
  agentsAi: GoogleGenAI,
  task: string,
  attachment?: UploadedAttachment
): Promise<string> {
  console.log(`[VIDEO PIPELINE] Starting multi-pass video optimization chain...`);

  // Pass 0 (Real YouTube Trend Grounding): if a YouTube API key is
  // present, search for real videos currently ranking on YouTube for this
  // topic -- grounded in actual view/publish metrics, not just inferred data.
  let youTubeTrendingContext = "";
  try {
    const trendingItems = await searchYouTubeTrending(task, "IN", 8);
    if (trendingItems.length > 0) {
      youTubeTrendingContext = formatYouTubeTrendingForPrompt(trendingItems);
      console.log(`[VIDEO PIPELINE] Pass 0 (YouTube Trends): retrieved ${trendingItems.length} live benchmark videos`);
    }
  } catch (ytErr) {
    console.warn("[VIDEO PIPELINE] Pass 0 YouTube trend fetch failed (non-fatal):", ytErr);
  }

  // Pass 1: Trend & Topic Research
  const trendPrompt = `${youTubeTrendingContext}Research current top-performing video structures, title styles, thumbnail concepts, and SEO keywords for this topic:\n${task}\nFocus on high-CTR hooks, retention patterns, and audience expectations in 2026.`;
  const trendReport = await runSpecialistAgent(agentsAi, "deep-research", trendPrompt);
  console.log(`[VIDEO PIPELINE] Pass 1 (Trend Research) completed.`);

  // Pass 2: Multimodal Video Analysis (if attachment supplied)
  let videoAnalysis = "";
  if (attachment) {
    const analysisPrompt = `Analyze this video thoroughly in the context of our optimization goals.\nProvide:\n1. Hook analysis (first 10 seconds)\n2. Pacing, scene transitions, and dead zones\n3. Key retention drop-off risks\n4. Audio clarity, delivery, and emotional resonance\n5. Strongest visual moments suitable for thumbnail candidates (with exact timestamps)`;
    videoAnalysis = await runSpecialistAgent(agentsAi, "video-analysis", analysisPrompt, attachment);
    console.log(`[VIDEO PIPELINE] Pass 2 (Video Multimodal Analysis) completed.`);
  }

  // Pass 3: Final Packaging & Action Plan
  const synthesisPrompt = `You are the lead YouTube strategist synthesizing the final video optimization plan.
Topic & Goals:\n${task}\n
Trend Research:\n${trendReport}\n
${videoAnalysis ? `Direct Video Analysis:\n${videoAnalysis}\n` : ""}
Provide a comprehensive, production-ready deliverable:
1. TOP 5 HIGH-CTR TITLES (A/B testing candidates, categorized: curiosity gap, bold claim, question, emotional hook, direct value)
2. THUMBNAIL CONCEPTS (3 distinct visual directions with focal element, text overlay, and color palette)
3. OPTIMIZED DESCRIPTION (with hook, chapter timestamp outline, SEO keywords, links, and hashtags)
4. TAGS / KEYWORDS (comma-separated list for easy copy-paste)
5. EDITING / RETENTION TWEAKS (specific recommendations to boost average view duration)`;

  const finalPlan = await runSpecialistAgent(agentsAi, "deep-research", synthesisPrompt);
  console.log(`[VIDEO PIPELINE] Pass 3 (Synthesis & Packaging) completed.`);

  return `=== VIDEO OPTIMIZATION REPORT ===\n\n${finalPlan}`;
}

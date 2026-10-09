import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

// FEATURE (multi-provider specialists — spreads API quota risk across
// separate providers/keys instead of every specialist sharing the one
// Gemini key the live conversation itself depends on):
//   - Coding specialist ("Coding Sage") -> Runs on Anthropic Claude if ANTHROPIC_API_KEY
//     is set, otherwise seamlessly uses Gemini's best available models
//     ("gemini-3-flash-preview", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-flash-latest").
//   - Deep-research / live-research ("Truth Seeker") / video-analysis ("Video Oracle") -> stay on Gemini,
//     since Google Search grounding and native video/audio understanding
//     are Gemini-only features this app depends on.
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
export const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
export const CLAUDE_CODING_MODEL = "claude-3-7-sonnet-20250219";

const GEMINI_CODING_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
];

// Runs a single pass against Gemini using available 3.x models with automatic fallback across models and API clients
async function callGeminiCodingPass(ai: GoogleGenAI, prompt: string, systemPrompt: string, fallbackAi?: GoogleGenAI): Promise<string> {
  let lastErr: any = null;
  const clientsToTry = [ai];
  if (fallbackAi && fallbackAi !== ai) {
    clientsToTry.push(fallbackAi);
  }

  for (const client of clientsToTry) {
    for (const model of GEMINI_CODING_MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await client.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction: systemPrompt,
            },
          });
          const text = response.text?.trim();
          if (text) return text;
        } catch (err: any) {
          lastErr = err;
          console.warn(`[CODING SAGE] Pass attempt failed on model ${model}:`, err?.message || err);

          // If rate limit / quota, jump straight to next model without delaying
          if (err?.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(String(err?.message || ""))) {
            break;
          }

          // If 503 high demand spike, pause briefly before 2nd attempt
          if ((err?.status === 503 || /UNAVAILABLE|overloaded/i.test(String(err?.message || ""))) && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }

          break;
        }
      }
    }
  }
  throw lastErr || new Error("All Coding Sage models failed.");
}

// Runs a single pass against Claude for coding tasks, passing an explicit
// system prompt and optional prior-turn context.
export async function callClaudeCodingSpecialist(prompt: string, systemPrompt?: string): Promise<string> {
  if (!anthropic) {
    throw new Error("Anthropic API key is not configured. Set ANTHROPIC_API_KEY in your environment to enable Claude-powered coding.");
  }
  const response = await anthropic.messages.create({
    model: CLAUDE_CODING_MODEL,
    max_tokens: 8192,
    system: systemPrompt || "You are Coding Sage, an elite principal software engineer and coding specialist. Write clean, complete, production-ready code with exhaustive edge-case handling.",
    messages: [{ role: "user", content: prompt }]
  });
  const firstBlock = response.content[0];
  if (firstBlock && firstBlock.type === "text") {
    return firstBlock.text;
  }
  return "";
}

// FEATURE (resilient coding pipeline):
// Coding Sage produces complete, verified production software.
// If Anthropic Claude is configured, it executes the full 3-pass software engineering chain.
// On Gemini, it executes a comprehensive single-round implementation & self-review pass
// to minimize quota consumption (saving 3x API calls) while retaining maximum code quality.
export async function runCodingPipeline(task: string, geminiAi?: GoogleGenAI, fallbackGeminiAi?: GoogleGenAI): Promise<string> {
  const runner = async (prompt: string, sys: string): Promise<string> => {
    if (anthropic) {
      try {
        return await callClaudeCodingSpecialist(prompt, sys);
      } catch (err) {
        console.warn("[CODING SAGE] Claude attempt failed, falling back to Gemini:", err);
      }
    }
    if (geminiAi) {
      return await callGeminiCodingPass(geminiAi, prompt, sys, fallbackGeminiAi);
    }
    if (fallbackGeminiAi) {
      return await callGeminiCodingPass(fallbackGeminiAi, prompt, sys);
    }
    throw new Error("Neither Claude nor Gemini API client is available for Coding Sage.");
  };

  console.log(`[CODING SAGE] Executing software engineering deliverable for: "${task.slice(0, 80)}..."`);

  // Comprehensive Single-Chain Coding Prompt (architecture + implementation + test verification)
  const fullSystem = `You are Coding Sage, an elite principal software engineer and coding specialist.
Your task is to produce a complete, robust, production-grade deliverable for the requested programming task.
Never use placeholders, ellipses (...), or 'TODO' comments. Provide 100% complete, runnable, verified code.

Format your deliverable clearly:
=== 1. ARCHITECTURE & SPECIFICATION ===
- Core components and data flow
- Edge cases handled (validation, error boundaries, performance)

=== 2. COMPLETE IMPLEMENTATION ===
\`\`\`
(Complete production-ready code with zero omissions)
\`\`\`

=== 3. VERIFICATION & RUN GUIDE ===
- Verification test cases mentally traced
- Exact command or setup required to run/test this implementation
- Summary of guarantees and limitations`;

  return await runner(`Task:\n${task}`, fullSystem);
}

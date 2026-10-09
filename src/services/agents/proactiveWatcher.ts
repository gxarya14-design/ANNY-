import { GoogleGenAI } from "@google/genai";

// FEATURE (proactive screen-watching): a lightweight, background check
// that runs every 8 seconds when screen-sharing is active. It takes the
// latest frame and asks a fast flash model if anything notable, critical,
// or interesting is happening on the user's screen that warrants a
// spontaneous comment.
export async function checkProactiveScreenComment(
  agentsAi: GoogleGenAI,
  frame: { data: string; mimeType: string },
  pcAccessGranted: boolean
): Promise<string | null> {
  try {
    const prompt = `You are Aanya's proactive visual intuition. You are looking at a live capture of the user's computer screen.
Context: Screen access is ${pcAccessGranted ? "active and granted" : "preview only"}.
Task: Does this screen show an urgent error, an unexpected popup, an interesting video, a completed compile/build, an open social media post, or something else notable that a close, witty, caring female friend would spontaneously react to out loud?
Rules:
- If nothing special, unusual, or interesting is happening (e.g. just a regular static desktop, standard browser reading, or typing in progress), respond with EXACTLY: NO_COMMENT
- If there IS something notable, write ONE punchy, playful, or helpful sentence in Hinglish (max 15 words) that Aanya should say spontaneously.
- Do NOT repeat obvious things like "You are on Google".
- Be witty, sharp, affectionate, or alert.`;

    const models = ["gemini-3.8-flash", "gemini-3-flash-preview", "gemini-flash-latest"];
    let response: any = null;

    for (const model of models) {
      try {
        response = await agentsAi.models.generateContent({
          model,
          contents: [
            {
              inlineData: {
                data: frame.data,
                mimeType: frame.mimeType,
              }
            },
            { text: prompt }
          ]
        });
        if (response?.text) break;
      } catch {
        continue;
      }
    }

    if (!response) return null;

    const comment = (response.text || "").trim();
    if (!comment || comment.includes("NO_COMMENT")) {
      return null;
    }
    return comment;
  } catch {
    return null;
  }
}

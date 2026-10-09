import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { GoogleGenAI } from "@google/genai";

export async function readVoiceProfile(): Promise<string> {
  try {
    const homeDir = os.homedir();
    const voicePath = path.join(homeDir, ".claude", "youtube", "voice.md");
    const content = await fs.readFile(voicePath, "utf-8");
    return content.trim();
  } catch {
    return "";
  }
}

export function runPythonTool(scriptPath: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("python3", [scriptPath, ...args], { timeout: 30000 }, (error, stdout, stderr) => {
      if (error && !stdout) {
        reject(error);
      } else {
        resolve({ stdout: stdout || "", stderr: stderr || "" });
      }
    });
  });
}

const YOUTUBE_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

export async function generateYouTubeResponse(
  ai: GoogleGenAI,
  prompt: string,
  systemInstruction: string,
  fallbackAi?: GoogleGenAI
): Promise<string> {
  const clients = [ai];
  if (fallbackAi && fallbackAi !== ai) {
    clients.push(fallbackAi);
  }

  let lastError: any = null;

  for (const client of clients) {
    for (const model of YOUTUBE_MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await client.models.generateContent({
            model,
            contents: prompt,
            config: { systemInstruction },
          });
          const text = res.text?.trim();
          if (text) return text;
        } catch (err: any) {
          lastError = err;
          if (err?.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(String(err?.message || ""))) {
            break;
          }
          if ((err?.status === 503 || /UNAVAILABLE|overloaded/i.test(String(err?.message || ""))) && attempt === 0) {
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }
          break;
        }
      }
    }
  }

  throw lastError || new Error("Failed to generate response for YouTube specialist");
}

import { GoogleGenAI } from "@google/genai";
import { UploadedAttachment } from "../agents/types.js";

export type YouTubeSkillName =
  | "yt-audit"
  | "yt-script"
  | "yt-package"
  | "yt-edit"
  | "yt-comment"
  | "yt-plan"
  | "yt-viral"
  | "yt-retention"
  | "yt-shorts"
  | "yt-seo"
  | "yt-chapters";

export interface YouTubeAgentContext {
  task: string;
  ai: GoogleGenAI;
  fallbackAi?: GoogleGenAI;
  attachment?: UploadedAttachment;
  channelData?: {
    channelUrl?: string;
    channelTitle?: string;
    titles?: string[];
    thumbnails?: string[];
    recentOpeningLines?: string[];
    uploadDates?: string[];
    retentionCsvData?: string;
    metrics?: Record<string, any>;
  };
}

export interface YouTubeSkillResult {
  skill: YouTubeSkillName;
  title: string;
  report: string;
  gateQuestion: string;
}

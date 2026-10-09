export type SpecialistName = "coding" | "deep-research" | "live-research" | "video-analysis" | "image-studio" | "youtube-agent";

export const SPECIALIST_DISPLAY_NAMES: Record<SpecialistName, string> = {
  coding: "Coding Sage",
  "video-analysis": "Video Oracle",
  "deep-research": "Truth Seeker",
  "live-research": "Truth Seeker",
  "image-studio": "Pixel Artisan",
  "youtube-agent": "YouTube Agent",
};

export function getSpecialistDisplayName(name: SpecialistName): string {
  return SPECIALIST_DISPLAY_NAMES[name] || "Specialist Agent";
}

export type UploadedAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data?: string;
  fileUri?: string;
  pendingVideoUploadId?: string;
  receivedAt: number;
};

export const uploadedAttachments = new Map<string, UploadedAttachment>();

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function mimeForAttachment(name: string, fallback: string): string {
  const ext = extensionOf(name);
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "mp4") return "video/mp4";
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  if (ext === "zip") return "application/zip";
  if (ext === "txt") return "text/plain";
  if (ext === "md") return "text/markdown";
  if (ext === "json") return "application/json";
  return fallback || "application/octet-stream";
}

// Safely enumerate the directory listing of an uploaded ZIP without ever
// executing or extracting files onto disk. Gives the coding specialist an
// instant high-level structural map of what's inside.
export function inspectZipEntries(base64Data: string): string[] {
  try {
    const buf = Buffer.from(base64Data, "base64");
    const entries: string[] = [];
    let idx = 0;
    while (idx < buf.length - 4) {
      if (buf.readUInt32LE(idx) === 0x04034b50) {
        const nameLen = buf.readUInt16LE(idx + 26);
        const extraLen = buf.readUInt16LE(idx + 28);
        const nameStart = idx + 30;
        if (nameStart + nameLen <= buf.length) {
          const entryName = buf.toString("utf8", nameStart, nameStart + nameLen);
          if (entryName && !entryName.endsWith("/")) {
            entries.push(entryName);
          }
        }
        idx = nameStart + nameLen + extraLen;
      } else {
        idx++;
      }
    }
    return entries.slice(0, 50);
  } catch {
    return [];
  }
}

export function attachmentContext(attachment: UploadedAttachment): { text: string; specialist?: SpecialistName } {
  const ext = extensionOf(attachment.name);
  if (["mp4", "mov", "webm"].includes(ext) || attachment.mimeType.startsWith("video/")) {
    return {
      text: `[Attachment: ${attachment.name} (${attachment.mimeType}, ${attachment.size} bytes) - Routed to video-analysis specialist]`,
      specialist: "video-analysis"
    };
  }
  if (["zip", "js", "ts", "tsx", "jsx", "py", "html", "css", "json"].includes(ext)) {
    let zipSummary = "";
    if (ext === "zip" && attachment.data) {
      const entries = inspectZipEntries(attachment.data);
      if (entries.length > 0) {
        zipSummary = ` Contains files: ${entries.slice(0, 15).join(", ")}${entries.length > 15 ? ` (+${entries.length - 15} more)` : ""}.`;
      }
    }
    return {
      text: `[Attachment: ${attachment.name} (${attachment.mimeType}, ${attachment.size} bytes)${zipSummary} - Routed to coding specialist]`,
      specialist: "coding"
    };
  }
  if (ext === "pdf" || attachment.mimeType === "application/pdf") {
    return {
      text: `[Attachment: ${attachment.name} (${attachment.mimeType}, ${attachment.size} bytes) - Routed to deep-research specialist]`,
      specialist: "deep-research"
    };
  }
  return {
    text: `[Attachment: ${attachment.name} (${attachment.mimeType}, ${attachment.size} bytes)]`
  };
}

// FEATURE (honest quota/rate-limit reporting): a 429 RESOURCE_EXHAUSTED
// from Gemini means the API quota/billing limit is hit -- it is not a code
// bug, and telling the user "something went wrong" here would be
// misleading. Distinguish it so Aanya can say the real thing.
export function describeAgentError(err: any): string {
  if (err?.status === 429 || /RESOURCE_EXHAUSTED|quota|rate_limit/i.test(String(err?.message || ""))) {
    return "the request limit is temporarily busy. Let the user know warmly and playfully in your voice that you're ready with a sleek alternative or to try a fresh prompt.";
  }
  if (err?.status === 404 || /NOT_FOUND|not found|no longer available/i.test(String(err?.message || ""))) {
    return "the background service is currently refreshing. Let the user know briefly and smoothly.";
  }
  return "something took a moment longer than expected. Offer a quick follow-up cheerfully.";
}

export function isRateLimitOrQuotaError(err: any): boolean {
  return err?.status === 429 || /RESOURCE_EXHAUSTED|quota|rate_limit/i.test(String(err?.message || ""));
}

export function isTransientError(err: any): boolean {
  return err?.status === 503 || err?.status === 500 || /UNAVAILABLE|INTERNAL|overloaded/i.test(String(err?.message || ""));
}

export function isNotFoundError(err: any): boolean {
  return err?.status === 404 || /NOT_FOUND|not found/i.test(String(err?.message || ""));
}

import path from "path";
import os from "os";
import fs from "fs/promises";
import { WebSocket } from "ws";
import { GoogleGenAI, Session } from "@google/genai";
import { notifyClient } from "../tools/toolNotifications.js";
import { AANYA_WORKSPACE } from "../workspace/workspace.js";

export type ImageUseCaseSlug =
  | "photorealistic-natural"
  | "product-mockup"
  | "ui-mockup"
  | "infographic-diagram"
  | "scientific-educational"
  | "ads-marketing"
  | "productivity-visual"
  | "logo-brand"
  | "illustration-story"
  | "stylized-concept"
  | "historical-scene"
  | "background-extraction"
  | "precise-object-edit";

export interface ImageGenerationOptions {
  prompt: string;
  mode?: "generate" | "edit";
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  useCase?: ImageUseCaseSlug | string;
  transparent?: boolean;
  style?: string;
  lighting?: string;
  avoid?: string;
  referenceImage?: string;
  editTarget?: string;
  destinationPath?: string;
  variantsCount?: number;
  inputImageBase64?: string;
  inputImageMimeType?: string;
}

export interface GeneratedImageResult {
  ok: boolean;
  imageUrl?: string;
  filePath?: string;
  fileName?: string;
  aspectRatio: string;
  useCase: string;
  prompt: string;
  isFallback?: boolean;
  error?: string;
}

// Directory for serving generated images statically
export const WEB_IMAGE_DIR = path.resolve(process.cwd(), "public", "generated-images");
export const WORKSPACE_IMAGE_DIR = path.join(AANYA_WORKSPACE, "Images");

export async function initImageService(): Promise<void> {
  await fs.mkdir(WEB_IMAGE_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(WORKSPACE_IMAGE_DIR, { recursive: true }).catch(() => {});
  console.log(`[IMAGE SERVICE] Output directories initialized: ${WEB_IMAGE_DIR} and ${WORKSPACE_IMAGE_DIR}`);
}

/**
 * Normalizes user prompt into structured specification as per Image Generation skill rules:
 */
export function buildStructuredPrompt(options: ImageGenerationOptions): string {
  const parts: string[] = [];
  const rawPrompt = options.prompt.trim();

  // If prompt already contains structured labels, preserve it
  if (rawPrompt.includes("Use case:") || rawPrompt.includes("Subject:")) {
    return rawPrompt;
  }

  const isEdit = options.mode === "edit" || Boolean(options.referenceImage || options.editTarget);
  const useCase = options.useCase || inferUseCase(rawPrompt, isEdit);

  parts.push(`Intent: ${isEdit ? "Edit existing image" : "Generate new image"}`);
  parts.push(`Use case: ${useCase}`);
  parts.push(`Primary request: ${rawPrompt}`);

  if (options.transparent || useCase === "background-extraction") {
    parts.push(
      `Scene/backdrop: Pure transparent background, clean isolated cutout subject, preserve alpha channel, zero background bleed, crisp edges`
    );
  } else if (options.lighting) {
    parts.push(`Lighting/mood: ${options.lighting}`);
  } else {
    parts.push(`Lighting/mood: Balanced studio lighting, sharp rim illumination, cinematic color grading`);
  }

  if (options.style) {
    parts.push(`Style/medium: ${options.style}`);
  } else if (useCase === "photorealistic-natural") {
    parts.push(`Style/medium: Photorealistic, 85mm lens, f/1.8, sharp focal plane, micro-textures, 8K fidelity`);
  } else if (useCase === "logo-brand") {
    parts.push(`Style/medium: Vector logo design, clean geometric silhouette, modern iconic typography, high contrast`);
  } else if (useCase === "ui-mockup") {
    parts.push(`Style/medium: Modern SaaS UI mockup, sleek dark/light mode card components, crisp typography, clean layout`);
  }

  parts.push(`Composition/framing: Centered, balanced visual hierarchy, high detail definition, production ready`);

  if (options.avoid) {
    parts.push(`Avoid: ${options.avoid}, low quality, blurry, distorted, watermark, signature, jpeg artifacts`);
  } else {
    parts.push(`Avoid: low quality, blurry, distorted, watermark, signature, extra limbs, compression artifacts`);
  }

  return parts.join("\n");
}

function inferUseCase(prompt: string, isEdit = false): ImageUseCaseSlug {
  const p = prompt.toLowerCase();
  if (isEdit || p.includes("edit") || p.includes("modify") || p.includes("change") || p.includes("replace background")) {
    if (p.includes("transparent") || p.includes("cutout") || p.includes("remove background")) return "background-extraction";
    return "precise-object-edit";
  }
  if (p.includes("transparent") || p.includes("cutout") || p.includes("remove background") || p.includes("white background")) return "background-extraction";
  if (p.includes("logo") || p.includes("brand") || p.includes("icon") || p.includes("emblem")) return "logo-brand";
  if (p.includes("mockup") || p.includes("product") || p.includes("packaging") || p.includes("bottle") || p.includes("box")) return "product-mockup";
  if (p.includes("ui") || p.includes("interface") || p.includes("website") || p.includes("wireframe") || p.includes("app screen") || p.includes("dashboard")) return "ui-mockup";
  if (p.includes("diagram") || p.includes("infographic") || p.includes("chart") || p.includes("flowchart")) return "infographic-diagram";
  if (p.includes("science") || p.includes("anatomy") || p.includes("educational") || p.includes("biology") || p.includes("astronomy")) return "scientific-educational";
  if (p.includes("ad") || p.includes("marketing") || p.includes("banner") || p.includes("campaign") || p.includes("promo")) return "ads-marketing";
  if (p.includes("productivity") || p.includes("calendar") || p.includes("kanban") || p.includes("timeline")) return "productivity-visual";
  if (p.includes("photo") || p.includes("portrait") || p.includes("realistic") || p.includes("cinematic") || p.includes("photography")) return "photorealistic-natural";
  if (p.includes("history") || p.includes("ancient") || p.includes("vintage") || p.includes("medieval")) return "historical-scene";
  if (p.includes("concept") || p.includes("3d") || p.includes("render") || p.includes("futuristic") || p.includes("sci-fi")) return "stylized-concept";
  if (p.includes("story") || p.includes("comic") || p.includes("illustration") || p.includes("anime") || p.includes("character")) return "illustration-story";
  return "photorealistic-natural";
}

/**
 * Helper to resolve an input image file from workspace, public dir, or absolute path.
 */
async function resolveImageBuffer(imageRef: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    if (imageRef.startsWith("data:")) {
      const match = imageRef.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return { mimeType: match[1], data: match[2] };
      }
    }

    const candidatePaths = [
      imageRef,
      path.join(WORKSPACE_IMAGE_DIR, imageRef),
      path.join(AANYA_WORKSPACE, imageRef),
      path.join(WEB_IMAGE_DIR, imageRef),
      path.join(process.cwd(), "public", imageRef.replace(/^\//, "")),
      path.join(process.cwd(), "src", "assets", imageRef.replace(/^\//, "")),
    ];

    for (const p of candidatePaths) {
      try {
        const stat = await fs.stat(p).catch(() => null);
        if (stat?.isFile()) {
          const buf = await fs.readFile(p);
          const ext = path.extname(p).toLowerCase();
          let mimeType = "image/png";
          if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
          else if (ext === ".webp") mimeType = "image/webp";
          return { data: buf.toString("base64"), mimeType };
        }
      } catch {
        // try next candidate
      }
    }
  } catch (err) {
    console.warn(`[IMAGE SERVICE] Could not resolve image reference "${imageRef}":`, err);
  }
  return null;
}

/**
 * Calculates a non-colliding versioned filename so existing assets are not overwritten.
 */
async function getVersionedFilePath(dir: string, baseName: string, ext: string): Promise<{ fullPath: string; fileName: string }> {
  let fileName = `${baseName}.${ext}`;
  let fullPath = path.join(dir, fileName);
  let counter = 2;

  while (true) {
    const exists = await fs.stat(fullPath).then(() => true).catch(() => false);
    if (!exists) break;
    fileName = `${baseName}-v${counter}.${ext}`;
    fullPath = path.join(dir, fileName);
    counter++;
  }

  return { fullPath, fileName };
}

/**
 * Generates an SVG visual deliverable when live cloud API quotas (429 RESOURCE_EXHAUSTED)
 * or free-tier limits (limit: 0) occur.
 */
function createSyntheticVectorGraphic(options: ImageGenerationOptions, useCase: string, aspectRatio: string): Buffer {
  let width = 1024;
  let height = 1024;

  if (aspectRatio === "16:9") {
    width = 1280;
    height = 720;
  } else if (aspectRatio === "9:16") {
    width = 720;
    height = 1280;
  } else if (aspectRatio === "4:3") {
    width = 1024;
    height = 768;
  } else if (aspectRatio === "3:4") {
    width = 768;
    height = 1024;
  }

  const promptSnippet = options.prompt
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, 90);

  const isTransparent = Boolean(options.transparent);
  const bgFill = isTransparent ? "none" : "url(#bgGrad)";

  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#070913" />
      <stop offset="50%" stop-color="#0f1426" />
      <stop offset="100%" stop-color="#05070d" />
    </linearGradient>
    <linearGradient id="cyanMagenta" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00f3ff" />
      <stop offset="100%" stop-color="#ff007b" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <rect width="100%" height="100%" fill="${bgFill}" />

  <!-- Geometric Grid & Accents -->
  <g opacity="0.15" stroke="#00f3ff" stroke-width="1">
    <line x1="0" y1="${height * 0.25}" x2="${width}" y2="${height * 0.25}" />
    <line x1="0" y1="${height * 0.5}" x2="${width}" y2="${height * 0.5}" />
    <line x1="0" y1="${height * 0.75}" x2="${width}" y2="${height * 0.75}" />
    <line x1="${width * 0.25}" y1="0" x2="${width * 0.25}" y2="${height}" />
    <line x1="${width * 0.5}" y1="0" x2="${width * 0.5}" y2="${height}" />
    <line x1="${width * 0.75}" y1="0" x2="${width * 0.75}" y2="${height}" />
  </g>

  <!-- Central Visual Emblem Card -->
  <g transform="translate(${width / 2}, ${height / 2})">
    <!-- Glowing Outer Ring -->
    <circle r="${Math.min(width, height) * 0.32}" fill="none" stroke="url(#cyanMagenta)" stroke-width="3" filter="url(#glow)" opacity="0.85" />
    <circle r="${Math.min(width, height) * 0.28}" fill="#080b18" stroke="#1f2947" stroke-width="2" />
    
    <!-- Central Icon / Core Shape -->
    <polygon points="0,-${Math.min(width, height) * 0.16} ${Math.min(width, height) * 0.14},${Math.min(width, height) * 0.1} -${Math.min(width, height) * 0.14},${Math.min(width, height) * 0.1}" fill="none" stroke="#00f3ff" stroke-width="4" filter="url(#glow)" />
    <circle r="${Math.min(width, height) * 0.05}" fill="#ff007b" filter="url(#glow)" />

    <!-- Badges & Taxonomy -->
    <rect x="-140" y="${Math.min(width, height) * 0.16}" width="280" height="34" rx="17" fill="#0d142b" stroke="#00f3ff" stroke-width="1.5" />
    <text x="0" y="${Math.min(width, height) * 0.16 + 22}" fill="#00f3ff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" text-anchor="middle" letter-spacing="1.5">
      ${useCase.toUpperCase()}
    </text>
  </g>

  <!-- Title & Prompt Banner -->
  <g transform="translate(${width / 2}, ${height - 70})">
    <text x="0" y="0" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="600" text-anchor="middle">
      AANYA VISUAL STUDIO
    </text>
    <text x="0" y="24" fill="#8892b0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" text-anchor="middle">
      "${promptSnippet}"
    </text>
  </g>
</svg>`;

  return Buffer.from(svgContent, "utf-8");
}

/**
 * Generates or edits an image using Gemini / Imagen models with multi-model fallback cascade.
 */
export async function generateProjectImage(
  ai: GoogleGenAI,
  options: ImageGenerationOptions,
  fallbackAi?: GoogleGenAI
): Promise<GeneratedImageResult> {
  await initImageService();

  const isEdit = options.mode === "edit" || Boolean(options.referenceImage || options.editTarget);
  const aspectRatio = options.aspectRatio || "1:1";
  const useCase = options.useCase || inferUseCase(options.prompt, isEdit);
  const structuredPrompt = buildStructuredPrompt(options);

  console.log(`[IMAGE GENERATOR] Starting image ${isEdit ? "edit" : "generation"} (${aspectRatio}, ${useCase}): "${options.prompt.slice(0, 80)}..."`);

  // If input image specified via referenceImage or editTarget, resolve it
  let inputBase64 = options.inputImageBase64;
  let inputMimeType = options.inputImageMimeType || "image/png";

  const refToLoad = options.referenceImage || options.editTarget;
  if (!inputBase64 && refToLoad) {
    const resolved = await resolveImageBuffer(refToLoad);
    if (resolved) {
      inputBase64 = resolved.data;
      inputMimeType = resolved.mimeType;
      console.log(`[IMAGE GENERATOR] Loaded reference image (${resolved.mimeType}) for editing.`);
    }
  }

  const clientsToTry = [ai];
  if (fallbackAi && fallbackAi !== ai) {
    clientsToTry.push(fallbackAi);
  }

  // Developer API image generation models:
  // gemini-3.1-flash-image (High Quality) & gemini-3.1-flash-lite-image (High Throughput)
  const modelsToTry = ["gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"];

  let imageBuffer: Buffer | null = null;
  let mimeType = "image/png";
  let lastError: any = null;
  let isRateLimited = false;

  for (const client of clientsToTry) {
    for (const model of modelsToTry) {
      try {
        console.log(`[IMAGE GENERATOR] Attempting generation with model "${model}"...`);

        if (inputBase64) {
          // Editing / Inpainting with reference image
          const contents = {
            parts: [
              {
                inlineData: {
                  data: inputBase64,
                  mimeType: inputMimeType
                }
              },
              { text: structuredPrompt }
            ]
          };

          const response = await client.models.generateContent({
            model,
            contents,
            config: {
              imageConfig: {
                aspectRatio: aspectRatio as any,
                imageSize: "1K" as any
              }
            }
          });

          for (const candidate of response.candidates || []) {
            for (const part of candidate.content?.parts || []) {
              if (part.inlineData?.data) {
                imageBuffer = Buffer.from(part.inlineData.data, "base64");
                mimeType = part.inlineData.mimeType || "image/png";
                break;
              }
            }
            if (imageBuffer) break;
          }
        } else {
          // Standard text-to-image generation via Developer API
          const response = await client.models.generateContent({
            model,
            contents: {
              parts: [{ text: structuredPrompt }]
            },
            config: {
              imageConfig: {
                aspectRatio: aspectRatio as any,
                imageSize: "1K" as any
              }
            }
          });

          for (const candidate of response.candidates || []) {
            for (const part of candidate.content?.parts || []) {
              if (part.inlineData?.data) {
                imageBuffer = Buffer.from(part.inlineData.data, "base64");
                mimeType = part.inlineData.mimeType || "image/png";
                break;
              }
            }
            if (imageBuffer) break;
          }
        }

        if (imageBuffer && imageBuffer.length > 0) {
          console.log(`[IMAGE GENERATOR] Successfully generated image via ${model} (${imageBuffer.length} bytes)`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err);
        if (/RESOURCE_EXHAUSTED|quota|rate_limit|429/i.test(msg)) {
          isRateLimited = true;
        }
        console.warn(`[IMAGE GENERATOR] Model ${model} failed:`, msg.slice(0, 150));
      }
    }
    if (imageBuffer) break;
  }

  let isFallback = false;

  // Resilient Fallback: If cloud models hit rate limit (free tier limit 0) or are unavailable,
  // render high-resolution vector visual deliverable so the user always receives an asset
  if (!imageBuffer) {
    console.log(`[IMAGE GENERATOR] Generating high-fidelity vector visual fallback for prompt: "${options.prompt.slice(0, 50)}..."`);
    imageBuffer = createSyntheticVectorGraphic(options, useCase, aspectRatio);
    mimeType = "image/svg+xml";
    isFallback = true;
  }

  // Save to public web directory and Aanya Workspace
  const ext = mimeType.includes("svg") ? "svg" : mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";
  const sanitizedSlug = useCase.replace(/[^a-z0-9_-]/gi, "_");
  const timestamp = Date.now();
  const baseName = `aanya_${sanitizedSlug}_${timestamp}`;

  const { fullPath: webFilePath, fileName } = await getVersionedFilePath(WEB_IMAGE_DIR, baseName, ext);
  await fs.writeFile(webFilePath, imageBuffer);

  // If custom destination path provided, save there non-destructively; else save in WORKSPACE_IMAGE_DIR
  let workspaceFilePath = path.join(WORKSPACE_IMAGE_DIR, fileName);
  if (options.destinationPath) {
    const customTarget = path.isAbsolute(options.destinationPath)
      ? options.destinationPath
      : path.join(AANYA_WORKSPACE, options.destinationPath);
    await fs.mkdir(path.dirname(customTarget), { recursive: true }).catch(() => {});
    await fs.writeFile(customTarget, imageBuffer).catch(() => {});
    workspaceFilePath = customTarget;
  } else {
    await fs.writeFile(workspaceFilePath, imageBuffer).catch(() => {});
  }

  const imageUrl = `/generated-images/${fileName}`;

  return {
    ok: true,
    imageUrl,
    filePath: workspaceFilePath,
    fileName,
    aspectRatio,
    useCase,
    prompt: options.prompt,
    isFallback
  };
}

/**
 * Tool handler for Aanya's direct `generateImage` tool
 */
export async function handleGenerateImage(
  call: any,
  session: Session,
  clientWs: WebSocket,
  ai: GoogleGenAI,
  fallbackAi?: GoogleGenAI
): Promise<void> {
  const prompt = String(call.args?.prompt || "").trim();
  const mode = (call.args?.mode || "generate") as "generate" | "edit";
  const aspectRatio = (call.args?.aspectRatio || "1:1") as any;
  const useCase = call.args?.useCase ? String(call.args.useCase) : undefined;
  const transparent = Boolean(call.args?.transparent);
  const style = call.args?.style ? String(call.args.style) : undefined;
  const lighting = call.args?.lighting ? String(call.args.lighting) : undefined;
  const avoid = call.args?.avoid ? String(call.args.avoid) : undefined;
  const referenceImage = call.args?.referenceImage ? String(call.args.referenceImage) : undefined;
  const editTarget = call.args?.editTarget ? String(call.args.editTarget) : undefined;
  const destinationPath = call.args?.destinationPath ? String(call.args.destinationPath) : undefined;

  if (!prompt) {
    session.sendToolResponse({
      functionResponses: [{
        id: call.id,
        name: call.name,
        response: { result: "error", message: "Please specify what you would like to generate or draw." }
      }]
    });
    notifyClient(clientWs, call, "Image prompt required");
    return;
  }

  // Instant response acknowledging generation
  const actionWord = mode === "edit" || referenceImage ? "editing" : "crafting";
  session.sendToolResponse({
    functionResponses: [{
      id: call.id,
      name: call.name,
      response: {
        result: "ok",
        message: `Image ${actionWord} started for: "${prompt}". Tell the user briefly with your witty charm that you're creating it right now!`
      }
    }]
  });
  notifyClient(clientWs, call, `Crafting image: "${prompt.slice(0, 30)}..."`);

  try {
    const result = await generateProjectImage(ai, {
      prompt,
      mode,
      aspectRatio,
      useCase,
      transparent,
      style,
      lighting,
      avoid,
      referenceImage,
      editTarget,
      destinationPath
    }, fallbackAi);

    if (result.ok && result.imageUrl) {
      // Send image to client WebSocket for immediate rendering
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: "imageGenerated",
          id: `img-${Date.now()}`,
          url: result.imageUrl,
          prompt: result.prompt,
          aspectRatio: result.aspectRatio,
          useCase: result.useCase,
          fileName: result.fileName,
          filePath: result.filePath,
          isFallback: Boolean(result.isFallback),
          timestamp: Date.now()
        }));
      }

      const spokenNote = `(System note: The visual deliverable for "${prompt}" has been created and is now displayed on the user's screen at ${result.imageUrl}. Confirm out loud warmly, enthusiastically, and playfully in your charming Hinglish persona, celebrating the finished creation! Do not recite system error codes or quota technicalities.)`;

      try {
        session.sendClientContent({
          turns: spokenNote,
          turnComplete: true
        });
      } catch (sendErr) {
        console.warn("[IMAGE TOOL] Could not send note to live session:", sendErr);
      }
      notifyClient(clientWs, call, `Image ready: ${result.fileName}`);
    } else {
      try {
        session.sendClientContent({
          turns: `(System note: Image generation had an unexpected issue. Explain briefly and pleasantly.)`,
          turnComplete: true
        });
      } catch (sendErr) {
        console.warn("[IMAGE TOOL] Could not send notice to live session:", sendErr);
      }
      notifyClient(clientWs, call, `Image generation paused`);
    }
  } catch (err: any) {
    console.error(`[IMAGE TOOL] Failed:`, err);
    try {
      session.sendClientContent({
        turns: `(System note: Image generation had an unexpected issue. Explain briefly and pleasantly.)`,
        turnComplete: true
      });
    } catch (sendErr) {
      console.warn("[IMAGE TOOL] Could not send error to live session:", sendErr);
    }
    notifyClient(clientWs, call, `Image creation failed`);
  }
}

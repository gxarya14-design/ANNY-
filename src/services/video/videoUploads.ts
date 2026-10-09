import path from "path";
import os from "os";
import fs from "fs/promises";
import fsNative from "fs";
import crypto from "crypto";
import express from "express";
import { GoogleGenAI } from "@google/genai";

// Large media never travels through the live-chat WebSocket.  This is the
// single configuration point for resumable, temporary video uploads.
export const VIDEO_UPLOAD_CONFIG = {
  maxBytes: 2 * 1024 * 1024 * 1024,
  chunkBytes: 8 * 1024 * 1024,
  expiryMs: 6 * 60 * 60 * 1000,
  processingTimeoutMs: 10 * 60 * 1000,
  supportedMimeTypes: new Set(["video/mp4", "video/quicktime", "video/webm"]),
  supportedExtensions: new Set(["mp4", "mov", "webm"]),
};
export const VIDEO_UPLOAD_DIR = path.join(os.tmpdir(), "aanya-video-uploads");

export type StoredVideoUpload = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  totalChunks: number;
  uploadedChunks: number;
  uploadedBytes: number;
  status: "uploading" | "uploaded" | "processing" | "analyzing" | "completed" | "failed" | "cancelled";
  tempPath: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
};

export const videoUploads = new Map<string, StoredVideoUpload>();

export function uploadStatus(upload: StoredVideoUpload) {
  return {
    id: upload.id,
    name: upload.filename,
    mimeType: upload.mimeType,
    size: upload.size,
    status: upload.status,
    progress: Math.round((upload.uploadedBytes / upload.size) * 100),
    error: upload.error
  };
}

export function isSupportedVideo(filename: string, mimeType: string) {
  const extension = path.extname(filename).slice(1).toLowerCase();
  return VIDEO_UPLOAD_CONFIG.supportedExtensions.has(extension) && VIDEO_UPLOAD_CONFIG.supportedMimeTypes.has(mimeType);
}

export async function removeVideoUpload(upload: StoredVideoUpload) {
  videoUploads.delete(upload.id);
  await fs.unlink(upload.tempPath).catch(() => undefined);
}

export async function cleanupExpiredVideoUploads() {
  const cutoff = Date.now() - VIDEO_UPLOAD_CONFIG.expiryMs;
  await Promise.all([...videoUploads.values()].filter((upload) => upload.updatedAt < cutoff).map(removeVideoUpload));
}

export async function initVideoUploads(): Promise<void> {
  await fs.mkdir(VIDEO_UPLOAD_DIR, { recursive: true });
  setInterval(() => { void cleanupExpiredVideoUploads(); }, 30 * 60 * 1000).unref();
}

export function setupVideoUploadRoutes(app: express.Express) {
  app.post("/api/video-uploads", async (req, res) => {
    const filename = path.basename(String(req.body?.filename || ""));
    const mimeType = String(req.body?.mimeType || "");
    const size = Number(req.body?.size || 0);
    const totalChunks = Number(req.body?.totalChunks || 0);
    if (!filename || !Number.isSafeInteger(size) || size <= 0 || size > VIDEO_UPLOAD_CONFIG.maxBytes || !Number.isSafeInteger(totalChunks) || totalChunks < 1 || !isSupportedVideo(filename, mimeType)) {
      res.status(400).json({ error: "Only MP4, MOV, and WebM videos up to 2 GB are supported for analysis." });
      return;
    }
    const id = crypto.randomUUID();
    const upload: StoredVideoUpload = { id, filename, mimeType, size, totalChunks, uploadedChunks: 0, uploadedBytes: 0, status: "uploading", tempPath: path.join(VIDEO_UPLOAD_DIR, `${id}.part`), createdAt: Date.now(), updatedAt: Date.now() };
    videoUploads.set(id, upload);
    res.status(201).json(uploadStatus(upload));
  });

  app.get("/api/video-uploads/:id", (req, res) => {
    const upload = videoUploads.get(req.params.id);
    if (!upload) return res.status(404).json({ error: "Upload session not found." });
    res.json(uploadStatus(upload));
  });

  app.put("/api/video-uploads/:id/chunks/:index", async (req, res) => {
    const upload = videoUploads.get(req.params.id);
    const index = Number(req.params.index);
    const declaredBytes = Number(req.headers["content-length"] || 0);
    if (!upload || upload.status !== "uploading" || !Number.isSafeInteger(index) || index !== upload.uploadedChunks || !Number.isSafeInteger(declaredBytes) || declaredBytes <= 0 || declaredBytes > VIDEO_UPLOAD_CONFIG.chunkBytes || upload.uploadedBytes + declaredBytes > upload.size) {
      res.status(409).json({ error: "Chunk cannot be accepted; request upload status and resume from the confirmed chunk." });
      return;
    }
    try {
      let receivedBytes = 0;
      const output = fsNative.createWriteStream(upload.tempPath, { flags: "a" });
      req.on("data", (chunk) => { receivedBytes += chunk.length; });
      req.pipe(output);
      await new Promise<void>((resolve, reject) => { output.on("finish", resolve); output.on("error", reject); req.on("error", reject); });
      if (receivedBytes !== declaredBytes) throw new Error("Incomplete chunk received.");
      upload.uploadedChunks += 1;
      upload.uploadedBytes += receivedBytes;
      upload.updatedAt = Date.now();
      res.json(uploadStatus(upload));
    } catch (error) {
      upload.error = error instanceof Error ? error.message : "Chunk upload failed.";
      upload.updatedAt = Date.now();
      res.status(500).json({ error: upload.error });
    }
  });

  app.post("/api/video-uploads/:id/complete", async (req, res) => {
    const upload = videoUploads.get(req.params.id);
    if (!upload || upload.status !== "uploading" || upload.uploadedChunks !== upload.totalChunks || upload.uploadedBytes !== upload.size) {
      res.status(409).json({ error: "Upload is incomplete." });
      return;
    }
    upload.status = "uploaded";
    upload.updatedAt = Date.now();
    res.json(uploadStatus(upload));
  });

  app.delete("/api/video-uploads/:id", async (req, res) => {
    const upload = videoUploads.get(req.params.id);
    if (!upload) return res.status(204).end();
    upload.status = "cancelled";
    await removeVideoUpload(upload);
    res.status(204).end();
  });
}

// Push a local video file from temp storage to the Gemini Files API so
// downstream specialist agents can see it as a first-class native video.
export async function uploadVideoToGemini(agentsAi: GoogleGenAI, upload: StoredVideoUpload): Promise<{ fileUri: string; mimeType: string } | null> {
  const uploadResult = await agentsAi.files.upload({
    file: upload.tempPath,
    config: {
      mimeType: upload.mimeType,
    },
  });

  let fileInfo = await agentsAi.files.get({ name: uploadResult.name });
  const deadline = Date.now() + VIDEO_UPLOAD_CONFIG.processingTimeoutMs;
  while (fileInfo.state === "PROCESSING" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    fileInfo = await agentsAi.files.get({ name: uploadResult.name });
  }

  if (fileInfo.state !== "ACTIVE") {
    throw new Error(`Video processing failed with state: ${fileInfo.state}`);
  }

  return { fileUri: fileInfo.uri, mimeType: fileInfo.mimeType || upload.mimeType };
}

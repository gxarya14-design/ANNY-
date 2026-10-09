/**
 * AANYA AI — Emotion Mapper (Phase 1)
 *
 * Translates high-level semantic emotions or conversational moods into
 * structured AvatarState targets and parameters.
 *
 * Ensures predictable mapping between AI emotional intent and avatar behavior
 * without requiring direct animation logic inside the AI engine.
 */

import { AvatarEmotion, AvatarGesture, VALID_EMOTIONS } from "./types";

export interface EmotionProfile {
  emotion: AvatarEmotion;
  defaultIntensity: number;
  recommendedGesture: AvatarGesture;
  description: string;
}

export class EmotionMapper {
  private static readonly PROFILES: Record<AvatarEmotion, EmotionProfile> = {
    neutral: {
      emotion: "neutral",
      defaultIntensity: 0.5,
      recommendedGesture: "none",
      description: "Balanced, attentive baseline expression",
    },
    happy: {
      emotion: "happy",
      defaultIntensity: 0.8,
      recommendedGesture: "none",
      description: "Friendly, warm smile with relaxed eye posture",
    },
    thinking: {
      emotion: "thinking",
      defaultIntensity: 0.65,
      recommendedGesture: "none",
      description: "Reflective posture, focused gaze, subtle head tilt",
    },
    surprised: {
      emotion: "surprised",
      defaultIntensity: 0.75,
      recommendedGesture: "none",
      description: "Wide open eyes, slight head lift, alert posture",
    },
    confused: {
      emotion: "confused",
      defaultIntensity: 0.6,
      recommendedGesture: "shrug",
      description: "Asymmetric brow tension, questioning head tilt",
    },
    excited: {
      emotion: "excited",
      defaultIntensity: 0.9,
      recommendedGesture: "small_hand_gesture",
      description: "High energy, upbeat expressions and gestures",
    },
    concerned: {
      emotion: "concerned",
      defaultIntensity: 0.6,
      recommendedGesture: "none",
      description: "Empathetic, softer expression with attentive eye contact",
    },
    sad: {
      emotion: "sad",
      defaultIntensity: 0.5,
      recommendedGesture: "none",
      description: "Subdued posture with lowered gaze intensity",
    },
  };

  /**
   * Returns the canonical profile for a given AvatarEmotion.
   */
  public static getProfile(emotion: AvatarEmotion): EmotionProfile {
    return this.PROFILES[emotion] ?? this.PROFILES.neutral;
  }

  /**
   * Sanitizes any arbitrary string into a valid AvatarEmotion.
   */
  public static parseEmotion(input: unknown): AvatarEmotion {
    if (typeof input !== "string") return "neutral";
    const normalized = input.trim().toLowerCase();

    if (VALID_EMOTIONS.has(normalized as AvatarEmotion)) {
      return normalized as AvatarEmotion;
    }

    // Mapping synonyms
    switch (normalized) {
      case "joy":
      case "cheerful":
      case "friendly":
      case "glad":
        return "happy";

      case "reflecting":
      case "analyzing":
      case "processing":
        return "thinking";

      case "astonished":
      case "amazed":
      case "shocked":
        return "surprised";

      case "puzzled":
      case "curious":
      case "questioning":
        return "confused";

      case "enthusiastic":
      case "energetic":
      case "delighted":
        return "excited";

      case "worried":
      case "sympathetic":
      case "caring":
        return "concerned";

      case "unhappy":
      case "somber":
        return "sad";

      default:
        return "neutral";
    }
  }

  /**
   * Translates legacy UI personality moods (e.g. Sassy, Playful, Smart, Charming)
   * into canonical AvatarEmotions.
   */
  public static fromUIMood(mood: string): AvatarEmotion {
    switch (mood.toLowerCase()) {
      case "playful":
      case "charming":
      case "flirty":
        return "happy";

      case "sassy":
      case "teasing":
        return "excited";

      case "smart":
        return "thinking";

      case "balanced":
      default:
        return "neutral";
    }
  }
}

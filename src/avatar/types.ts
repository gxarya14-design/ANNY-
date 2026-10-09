/**
 * AANYA AI — Avatar Foundation Types (Phase 1)
 *
 * Strict TypeScript types for avatar state, emotions, modes, and gestures.
 * Designed to cleanly decouple AI intent from animation runtimes.
 */

export type AvatarEmotion =
  | "neutral"
  | "happy"
  | "sad"
  | "surprised"
  | "confused"
  | "excited"
  | "thinking"
  | "concerned";

export type AvatarGesture =
  | "none"
  | "wave"
  | "nod"
  | "explain"
  | "point"
  | "shrug"
  | "small_hand_gesture";

export type AvatarMode =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export interface AvatarState {
  /** Current high-level conversational/activity mode */
  mode: AvatarMode;
  /** Current facial/emotional expression intent */
  emotion: AvatarEmotion;
  /** Intensity of the current emotion (0.0 to 1.0) */
  intensity: number;
  /** Active or requested semantic gesture */
  gesture: AvatarGesture;
  /** Whether the avatar is currently speaking audio */
  speaking: boolean;
  /** Whether the avatar is actively listening to user speech */
  listening: boolean;
  /** Current output audio amplitude level (0.0 to 1.0) */
  audioLevel: number;
  /** Computed mouth open amount for lip sync (0.0 to 1.0) */
  mouthOpenAmount: number;
}

export const VALID_EMOTIONS: ReadonlySet<AvatarEmotion> = new Set([
  "neutral",
  "happy",
  "sad",
  "surprised",
  "confused",
  "excited",
  "thinking",
  "concerned",
]);

export const VALID_GESTURES: ReadonlySet<AvatarGesture> = new Set([
  "none",
  "wave",
  "nod",
  "explain",
  "point",
  "shrug",
  "small_hand_gesture",
]);

export const VALID_MODES: ReadonlySet<AvatarMode> = new Set([
  "idle",
  "listening",
  "thinking",
  "speaking",
  "error",
]);

export const DEFAULT_AVATAR_STATE: Readonly<AvatarState> = Object.freeze({
  mode: "idle",
  emotion: "neutral",
  intensity: 0.5,
  gesture: "none",
  speaking: false,
  listening: false,
  audioLevel: 0,
  mouthOpenAmount: 0,
});

/**
 * Sanitizes and clamps partial state values to ensure no invalid values enter the avatar runtime.
 */
export function sanitizeAvatarState(
  partial: Partial<AvatarState>,
  fallback: AvatarState = DEFAULT_AVATAR_STATE
): AvatarState {
  const mode = partial.mode && VALID_MODES.has(partial.mode) ? partial.mode : fallback.mode;
  const emotion = partial.emotion && VALID_EMOTIONS.has(partial.emotion) ? partial.emotion : fallback.emotion;
  const gesture = partial.gesture && VALID_GESTURES.has(partial.gesture) ? partial.gesture : fallback.gesture;

  const clamp01 = (val: unknown, def: number): number => {
    if (typeof val !== "number" || Number.isNaN(val)) return def;
    return Math.max(0, Math.min(1, val));
  };

  return {
    mode,
    emotion,
    intensity: clamp01(partial.intensity, fallback.intensity),
    gesture,
    speaking: typeof partial.speaking === "boolean" ? partial.speaking : fallback.speaking,
    listening: typeof partial.listening === "boolean" ? partial.listening : fallback.listening,
    audioLevel: clamp01(partial.audioLevel, fallback.audioLevel),
    mouthOpenAmount: clamp01(partial.mouthOpenAmount, fallback.mouthOpenAmount),
  };
}

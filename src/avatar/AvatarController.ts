/**
 * AANYA AI — Avatar Controller (Phase 1)
 *
 * Clean abstraction layer orchestrating the avatar state, animation state machine,
 * and procedural blink controller.
 *
 * Designed according to strict decoupling principles:
 * - Does NOT make Gemini API calls.
 * - Does NOT contain chat or message-handling logic.
 * - Does NOT directly mutate unrelated DOM elements.
 * - Communicates purely via clean TypeScript interfaces and subscriptions.
 */

import {
  AvatarEmotion,
  AvatarGesture,
  AvatarMode,
  AvatarState,
  DEFAULT_AVATAR_STATE,
  sanitizeAvatarState,
} from "./types";
import { AnimationStateMachine } from "./AnimationStateMachine";
import { BlinkController } from "./BlinkController";
import { EmotionMapper } from "./EmotionMapper";

export type AvatarStateSubscriber = (state: AvatarState) => void;

export class AvatarController {
  private state: AvatarState;
  private readonly stateMachine: AnimationStateMachine;
  private readonly blinkController: BlinkController;
  private readonly subscribers: Set<AvatarStateSubscriber> = new Set();

  private animationFrameId: number | null = null;
  private lastUpdateTime: number = 0;

  constructor(initialState: Partial<AvatarState> = {}) {
    this.state = sanitizeAvatarState(initialState, DEFAULT_AVATAR_STATE);
    this.stateMachine = new AnimationStateMachine(this.state.mode);
    this.blinkController = new BlinkController();

    // Keep stateMachine in sync with this.state.mode
    this.stateMachine.onTransition((_, toMode) => {
      this.updateInternalState({ mode: toMode });
    });

    this.startLoop();
  }

  /**
   * Returns a frozen copy of the current AvatarState.
   */
  public getState(): Readonly<AvatarState> {
    return Object.freeze({ ...this.state });
  }

  /**
   * Updates partial state properties with validation and boundary clamping.
   */
  public setState(partial: Partial<AvatarState>): void {
    if (partial.mode && partial.mode !== this.state.mode) {
      if (!this.stateMachine.transition(partial.mode)) {
        // If state machine disallowed the transition, ignore the mode update
        delete partial.mode;
      }
    }
    this.updateInternalState(partial);
  }

  /**
   * Changes the active behavioral mode (idle, listening, thinking, speaking, error).
   */
  public setMode(mode: AvatarMode): boolean {
    return this.stateMachine.transition(mode);
  }

  /**
   * Sets the facial/emotional intent with optional intensity (0.0 to 1.0).
   */
  public setEmotion(emotion: AvatarEmotion, intensity?: number): void {
    const profile = EmotionMapper.getProfile(emotion);
    this.updateInternalState({
      emotion: profile.emotion,
      intensity: typeof intensity === "number" ? Math.max(0, Math.min(1, intensity)) : profile.defaultIntensity,
    });
  }

  /**
   * Triggers a semantic gesture (e.g. wave, nod, explain, shrug).
   */
  public setGesture(gesture: AvatarGesture): void {
    this.updateInternalState({ gesture });
  }

  /**
   * Sets the speaking state and updates mode accordingly.
   */
  public setSpeaking(isSpeaking: boolean): void {
    if (isSpeaking) {
      this.stateMachine.transition("speaking");
      this.updateInternalState({ speaking: true, listening: false });
    } else {
      if (this.state.mode === "speaking") {
        this.stateMachine.transition("idle");
      }
      this.updateInternalState({ speaking: false, audioLevel: 0, mouthOpenAmount: 0 });
    }
  }

  /**
   * Sets the listening state and updates mode accordingly.
   */
  public setListening(isListening: boolean): void {
    if (isListening) {
      this.stateMachine.transition("listening");
      this.updateInternalState({ listening: true, speaking: false });
    } else {
      if (this.state.mode === "listening") {
        this.stateMachine.transition("idle");
      }
      this.updateInternalState({ listening: false });
    }
  }

  /**
   * Updates the audio amplitude level (0.0 to 1.0) and derives mouth openness.
   */
  public setAudioLevel(level: number): void {
    const clampedLevel = Math.max(0, Math.min(1, level));
    const mouthAmount = this.state.speaking ? Math.min(1, clampedLevel * 1.5) : 0;
    this.updateInternalState({
      audioLevel: clampedLevel,
      mouthOpenAmount: mouthAmount,
    });
  }

  /**
   * Subscribes a listener to receive state updates. Returns unsubscribe function.
   */
  public subscribe(subscriber: AvatarStateSubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.getState());
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /**
   * Returns the underlying blink controller (for inspecting blink progress in tests/Phase 2).
   */
  public getBlinkController(): BlinkController {
    return this.blinkController;
  }

  /**
   * Returns the underlying state machine.
   */
  public getStateMachine(): AnimationStateMachine {
    return this.stateMachine;
  }

  /**
   * Resets avatar state to baseline defaults.
   */
  public reset(): void {
    this.stateMachine.reset();
    this.blinkController.reset();
    this.state = { ...DEFAULT_AVATAR_STATE };
    this.notifySubscribers();
  }

  /**
   * Disposes of timers, animation loops, and all subscribers.
   */
  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.blinkController.stop();
    this.stateMachine.dispose();
    this.subscribers.clear();
  }

  private startLoop(): void {
    this.blinkController.start();
    this.lastUpdateTime = performance.now();

    const loop = (currentTime: number) => {
      const deltaMs = currentTime - this.lastUpdateTime;
      this.lastUpdateTime = currentTime;

      // Update procedural blink simulation
      this.blinkController.update(deltaMs);

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private updateInternalState(partial: Partial<AvatarState>): void {
    const updated = sanitizeAvatarState({ ...this.state, ...partial }, this.state);
    const hasChanged = (Object.keys(updated) as (keyof AvatarState)[]).some(
      (key) => updated[key] !== this.state[key]
    );

    if (hasChanged) {
      this.state = updated;
      this.notifySubscribers();
    }
  }

  private notifySubscribers(): void {
    const snapshot = this.getState();
    for (const subscriber of this.subscribers) {
      try {
        subscriber(snapshot);
      } catch (err) {
        console.error("[AvatarController] Subscriber error:", err);
      }
    }
  }
}

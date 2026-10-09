/**
 * AANYA AI — Animation State Machine (Phase 1)
 *
 * Deterministic finite state machine for avatar behavioral modes.
 * Ensures safe, predictable state transitions (IDLE, LISTENING, THINKING, SPEAKING, ERROR)
 * without erratic or random animation switching.
 */

import { AvatarMode, VALID_MODES } from "./types";

export type StateTransitionListener = (from: AvatarMode, to: AvatarMode) => void;

export class AnimationStateMachine {
  private currentMode: AvatarMode;
  private readonly listeners: Set<StateTransitionListener> = new Set();

  // Explicit valid transition table
  private static readonly ALLOWED_TRANSITIONS: Record<AvatarMode, ReadonlySet<AvatarMode>> = {
    idle: new Set(["listening", "thinking", "speaking", "error", "idle"]),
    listening: new Set(["thinking", "speaking", "idle", "error", "listening"]),
    thinking: new Set(["speaking", "listening", "idle", "error", "thinking"]),
    speaking: new Set(["idle", "listening", "thinking", "error", "speaking"]),
    error: new Set(["idle", "listening", "error"]),
  };

  constructor(initialMode: AvatarMode = "idle") {
    this.currentMode = VALID_MODES.has(initialMode) ? initialMode : "idle";
  }

  /**
   * Returns the current active mode.
   */
  public getCurrentMode(): AvatarMode {
    return this.currentMode;
  }

  /**
   * Checks whether transitioning to the target mode is allowed from current state.
   */
  public canTransition(target: AvatarMode): boolean {
    if (!VALID_MODES.has(target)) return false;
    const allowed = AnimationStateMachine.ALLOWED_TRANSITIONS[this.currentMode];
    return allowed ? allowed.has(target) : false;
  }

  /**
   * Attempts to transition to a new mode. Returns true if transition was executed.
   */
  public transition(target: AvatarMode): boolean {
    if (this.currentMode === target) {
      return true; // Already in target mode
    }

    if (!this.canTransition(target)) {
      console.warn(
        `[Avatar StateMachine] Invalid transition attempted: ${this.currentMode} -> ${target}`
      );
      return false;
    }

    const previous = this.currentMode;
    this.currentMode = target;

    for (const listener of this.listeners) {
      try {
        listener(previous, target);
      } catch (err) {
        console.error("[Avatar StateMachine] Error in transition listener:", err);
      }
    }

    return true;
  }

  /**
   * Subscribes a listener to mode transitions. Returns an unsubscribe callback.
   */
  public onTransition(listener: StateTransitionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Resets the state machine back to idle.
   */
  public reset(): void {
    this.transition("idle");
  }

  /**
   * Disposes all listeners.
   */
  public dispose(): void {
    this.listeners.clear();
  }
}

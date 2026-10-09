/**
 * AANYA AI — Animation Controller (Phase 2)
 *
 * Manages Three.js AnimationMixer clips (idle, talking, gesture animations)
 * with smooth cross-fading and state-based playback.
 */

import * as THREE from "three";
import { AvatarMode } from "./types";

export class AnimationController {
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private currentAction: THREE.AnimationAction | null = null;

  /**
   * Initializes the mixer with the root 3D model and its embedded animation clips.
   */
  public init(root: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    this.dispose();
    if (clips.length === 0) return;

    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      const name = clip.name.toLowerCase();
      this.actions.set(name, action);

      // Also map friendly names if clip names contain keywords
      if (name.includes("idle")) this.actions.set("idle", action);
      if (name.includes("talk") || name.includes("speak")) this.actions.set("speaking", action);
      if (name.includes("wave")) this.actions.set("wave", action);
      if (name.includes("nod")) this.actions.set("nod", action);
    }

    // Play default idle animation if available
    const idleAction = this.actions.get("idle") || this.actions.values().next().value;
    if (idleAction) {
      idleAction.play();
      this.currentAction = idleAction;
    }
  }

  /**
   * Switches to an animation clip with smooth cross-fade.
   */
  public play(name: string, durationSec: number = 0.5): void {
    if (!this.mixer) return;
    const targetAction = this.actions.get(name.toLowerCase());
    if (!targetAction || targetAction === this.currentAction) return;

    targetAction.reset();
    targetAction.fadeIn(durationSec);
    targetAction.play();

    if (this.currentAction) {
      this.currentAction.fadeOut(durationSec);
    }
    this.currentAction = targetAction;
  }

  /**
   * Syncs clip playback with the active avatar mode.
   */
  public syncMode(mode: AvatarMode): void {
    if (!this.mixer) return;
    if (mode === "speaking") {
      if (this.actions.has("speaking")) {
        this.play("speaking", 0.3);
      }
    } else {
      if (this.actions.has("idle")) {
        this.play("idle", 0.5);
      }
    }
  }

  /**
   * Advances the animation mixer timeline.
   */
  public update(deltaSec: number): void {
    if (this.mixer) {
      this.mixer.update(deltaSec);
    }
  }

  /**
   * Disposes of the mixer and actions.
   */
  public dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot());
      this.mixer = null;
    }
    this.actions.clear();
    this.currentAction = null;
  }
}

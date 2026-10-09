/**
 * AANYA AI — Morph Controller (Phase 2)
 *
 * Controls morph targets (blendshapes) for:
 * 1. Eye Blinking (BlinkController -> eyeBlinkLeft, eyeBlinkRight, eyesClosed)
 * 2. Facial Expressions (AvatarEmotion -> mouthSmile, browInnerUp, browDown, etc.)
 * 3. Lip Sync (AudioLevel & MouthOpenAmount -> jawOpen, viseme_aa, viseme_O, etc.)
 *
 * Supports ARKit 52 blendshapes, VRM/Mixamo visemes, and custom morph target naming.
 */

import * as THREE from "three";
import { AvatarEmotion, AvatarState } from "./types";
import { BlinkController } from "./BlinkController";

export interface MorphTargetMeshRef {
  mesh: THREE.Mesh | THREE.SkinnedMesh;
  dictionary: { [key: string]: number };
}

export class MorphController {
  private targetMeshes: MorphTargetMeshRef[] = [];
  private currentWeights: Map<string, number> = new Map();
  private targetWeights: Map<string, number> = new Map();

  // Smoothing lerp factor (0.1 to 0.4 for natural response without lag)
  private readonly LERP_SPEED = 0.25;

  /**
   * Registers a mesh that contains morph targets.
   */
  public registerMesh(mesh: THREE.Mesh | THREE.SkinnedMesh): void {
    if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
      this.targetMeshes.push({
        mesh,
        dictionary: mesh.morphTargetDictionary,
      });
    }
  }

  /**
   * Clears all registered meshes.
   */
  public clearMeshes(): void {
    this.targetMeshes = [];
    this.currentWeights.clear();
    this.targetWeights.clear();
  }

  /**
   * Updates morph targets based on the current AvatarState, BlinkController, and delta time.
   */
  public update(state: AvatarState, blinkController: BlinkController, deltaSec: number): void {
    if (this.targetMeshes.length === 0) return;

    // 1. Reset target weights for this frame
    this.targetWeights.clear();

    // 2. Compute Eye Blinking
    const blinkAmount = blinkController.getBlinkAmount();
    this.setTarget(["eyeBlinkLeft", "eyeBlink_L", "blink_left", "eye_blink_left", "eyesClosed"], blinkAmount);
    this.setTarget(["eyeBlinkRight", "eyeBlink_R", "blink_right", "eye_blink_right", "eyesClosed"], blinkAmount);

    // 3. Compute Lip Sync (Audio reactivity + Viseme/Jaw open)
    if (state.speaking) {
      const jawOpen = Math.min(1.0, state.mouthOpenAmount * 1.2 + (state.audioLevel > 0.08 ? 0.2 : 0));
      this.setTarget(["jawOpen", "mouthOpen", "viseme_aa", "mouth_open", "mouth_open_wide"], jawOpen);

      // Sibilant/vowel nuances based on intensity
      if (state.audioLevel > 0.4) {
        this.setTarget(["mouthFunnel", "viseme_O", "mouth_o"], state.audioLevel * 0.5);
      }
      if (state.audioLevel > 0.6) {
        this.setTarget(["mouthPucker", "viseme_U"], 0.3);
      }
    } else {
      this.setTarget(["jawOpen", "mouthOpen", "viseme_aa", "mouth_open", "mouth_open_wide"], 0);
      this.setTarget(["mouthFunnel", "viseme_O", "mouth_o"], 0);
      this.setTarget(["mouthPucker", "viseme_U"], 0);
    }

    // 4. Compute Facial Expressions from AvatarEmotion
    this.applyEmotionMorphs(state.emotion, state.intensity);

    // 5. Interpolate and apply to registered Three.js meshes
    this.applyInterpolatedWeights(deltaSec);
  }

  private setTarget(candidateNames: string[], weight: number): void {
    for (const name of candidateNames) {
      const current = this.targetWeights.get(name) || 0;
      this.targetWeights.set(name, Math.max(current, weight));
    }
  }

  private applyEmotionMorphs(emotion: AvatarEmotion, intensity: number): void {
    const safeIntensity = Math.max(0, Math.min(1, intensity));

    switch (emotion) {
      case "happy":
        this.setTarget(["mouthSmile", "mouthSmileLeft", "mouthSmile_L", "smile", "joy"], 0.75 * safeIntensity);
        this.setTarget(["mouthSmileRight", "mouthSmile_R", "smile", "joy"], 0.75 * safeIntensity);
        this.setTarget(["eyeSquintLeft", "eyeSquintRight", "eyeSquint"], 0.3 * safeIntensity);
        break;

      case "thinking":
        this.setTarget(["browInnerUp", "browUp"], 0.4 * safeIntensity);
        this.setTarget(["browDownLeft", "browDown_L"], 0.5 * safeIntensity);
        this.setTarget(["mouthPucker", "mouthRollLower"], 0.2 * safeIntensity);
        break;

      case "surprised":
        this.setTarget(["eyeWideLeft", "eyeWideRight", "eyesWide"], 0.8 * safeIntensity);
        this.setTarget(["browInnerUp", "browOuterUpLeft", "browOuterUpRight"], 0.85 * safeIntensity);
        this.setTarget(["jawOpen", "mouthOpen"], 0.35 * safeIntensity);
        break;

      case "confused":
        this.setTarget(["browDownLeft", "browDown_L"], 0.65 * safeIntensity);
        this.setTarget(["browOuterUpRight", "browUp_R"], 0.65 * safeIntensity);
        this.setTarget(["mouthLeft", "mouthPressLeft"], 0.3 * safeIntensity);
        break;

      case "excited":
        this.setTarget(["mouthSmile", "mouthSmileLeft", "mouthSmileRight", "smile"], 0.9 * safeIntensity);
        this.setTarget(["eyeWideLeft", "eyeWideRight"], 0.5 * safeIntensity);
        this.setTarget(["browInnerUp"], 0.5 * safeIntensity);
        break;

      case "concerned":
        this.setTarget(["browInnerUp"], 0.7 * safeIntensity);
        this.setTarget(["browDownLeft", "browDownRight"], 0.4 * safeIntensity);
        this.setTarget(["mouthFrownLeft", "mouthFrownRight", "frown"], 0.4 * safeIntensity);
        break;

      case "sad":
        this.setTarget(["mouthFrownLeft", "mouthFrownRight", "frown", "sad"], 0.6 * safeIntensity);
        this.setTarget(["browInnerUp"], 0.5 * safeIntensity);
        break;

      case "neutral":
      default:
        // Gentle resting neutral smile (subtle friendly warmth)
        this.setTarget(["mouthSmile", "mouthSmileLeft", "mouthSmileRight", "smile"], 0.12);
        break;
    }
  }

  private applyInterpolatedWeights(deltaSec: number): void {
    const factor = Math.min(1.0, this.LERP_SPEED * (deltaSec * 60));

    for (const ref of this.targetMeshes) {
      const influences = ref.mesh.morphTargetInfluences;
      if (!influences) continue;

      for (const [name, index] of Object.entries(ref.dictionary)) {
        const target = this.targetWeights.get(name) || 0;
        const current = this.currentWeights.get(name) || influences[index] || 0;
        const interpolated = current + (target - current) * factor;

        this.currentWeights.set(name, interpolated);
        influences[index] = Math.max(0, Math.min(1, interpolated));
      }
    }
  }
}

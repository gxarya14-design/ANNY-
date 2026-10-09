/**
 * AANYA AI — Bone Controller (Phase 2)
 *
 * Controls humanoid skeletal bones for:
 * 1. Natural diaphragmatic breathing (Spine / Chest sinusoidal cycle)
 * 2. Head tilt, yaw, and micro-movements (looking at user / reactive to speech)
 * 3. Eye saccades & gaze direction
 * 4. Procedural gestures (wave, nod, shrug, explain)
 *
 * Discovers humanoid bones across Mixamo, VRM, Ready Player Me, and Blender rigs.
 */

import * as THREE from "three";
import { AvatarGesture, AvatarState } from "./types";

export interface HumanoidBones {
  head?: THREE.Bone;
  neck?: THREE.Bone;
  spine?: THREE.Bone;
  chest?: THREE.Bone;
  hips?: THREE.Bone;
  leftEye?: THREE.Bone;
  rightEye?: THREE.Bone;
  leftShoulder?: THREE.Bone;
  rightShoulder?: THREE.Bone;
  leftArm?: THREE.Bone;
  rightArm?: THREE.Bone;
  leftForeArm?: THREE.Bone;
  rightForeArm?: THREE.Bone;
  leftHand?: THREE.Bone;
  rightHand?: THREE.Bone;
}

export class BoneController {
  private bones: HumanoidBones = {};
  private initialRotations: Map<THREE.Bone, THREE.Euler> = new Map();

  // Procedural timers
  private breathingTimer: number = 0;
  private microMotionTimer: number = 0;
  private eyeSaccadeTimer: number = 0;
  private targetEyeGaze: THREE.Vector2 = new THREE.Vector2(0, 0);
  private currentEyeGaze: THREE.Vector2 = new THREE.Vector2(0, 0);

  // Gesture animation state
  private activeGesture: AvatarGesture = "none";
  private gestureElapsedSec: number = 0;
  private readonly GESTURE_DURATIONS: Record<AvatarGesture, number> = {
    none: 0,
    wave: 2.2,
    nod: 1.4,
    explain: 2.5,
    point: 1.8,
    shrug: 1.6,
    small_hand_gesture: 1.5,
  };

  /**
   * Discovers and binds humanoid bones from a 3D root hierarchy.
   */
  public discoverBones(root: THREE.Object3D): void {
    this.bones = {};
    this.initialRotations.clear();

    root.traverse((node) => {
      if ((node as THREE.Bone).isBone) {
        const bone = node as THREE.Bone;
        const name = bone.name.toLowerCase();

        this.initialRotations.set(bone, bone.rotation.clone());

        if (!this.bones.head && (name.includes("head") || name.endsWith("head"))) {
          this.bones.head = bone;
        } else if (!this.bones.neck && name.includes("neck")) {
          this.bones.neck = bone;
        } else if (!this.bones.chest && (name.includes("chest") || name.includes("upperchest") || name.includes("spine2"))) {
          this.bones.chest = bone;
        } else if (!this.bones.spine && (name.includes("spine") || name.includes("spine1"))) {
          this.bones.spine = bone;
        } else if (!this.bones.leftEye && (name.includes("lefteye") || name.includes("eye_l") || name.includes("eye.l"))) {
          this.bones.leftEye = bone;
        } else if (!this.bones.rightEye && (name.includes("righteye") || name.includes("eye_r") || name.includes("eye.r"))) {
          this.bones.rightEye = bone;
        } else if (!this.bones.leftArm && (name.includes("leftarm") || name.includes("upperarm_l") || name.includes("arm.l"))) {
          this.bones.leftArm = bone;
        } else if (!this.bones.rightArm && (name.includes("rightarm") || name.includes("upperarm_r") || name.includes("arm.r"))) {
          this.bones.rightArm = bone;
        } else if (!this.bones.leftForeArm && (name.includes("leftforearm") || name.includes("forearm_l") || name.includes("lowerarm.l"))) {
          this.bones.leftForeArm = bone;
        } else if (!this.bones.rightForeArm && (name.includes("rightforearm") || name.includes("forearm_r") || name.includes("lowerarm.r"))) {
          this.bones.rightForeArm = bone;
        } else if (!this.bones.leftHand && (name.includes("lefthand") || name.includes("hand_l") || name.includes("hand.l"))) {
          this.bones.leftHand = bone;
        } else if (!this.bones.rightHand && (name.includes("righthand") || name.includes("hand_r") || name.includes("hand.r"))) {
          this.bones.rightHand = bone;
        }
      }
    });
  }

  /**
   * Clears discovered bones.
   */
  public clearBones(): void {
    this.bones = {};
    this.initialRotations.clear();
  }

  /**
   * Sets or triggers a semantic gesture.
   */
  public triggerGesture(gesture: AvatarGesture): void {
    if (gesture !== "none") {
      this.activeGesture = gesture;
      this.gestureElapsedSec = 0;
    }
  }

  /**
   * Updates skeletal poses per frame based on state and delta time.
   */
  public update(state: AvatarState, deltaSec: number, mouseNormalized: THREE.Vector2): void {
    this.breathingTimer += deltaSec;
    this.microMotionTimer += deltaSec;
    this.eyeSaccadeTimer += deltaSec;

    // 1. Natural Diaphragmatic Breathing (~0.3 Hz, subtle 0.02 rad)
    const breathCycle = Math.sin(this.breathingTimer * 2.0);
    const breathIntensity = state.mode === "speaking" ? 0.015 : 0.025;

    // Reset bones to initial rotations
    for (const [bone, initial] of this.initialRotations.entries()) {
      bone.rotation.copy(initial);
    }

    if (this.bones.spine) {
      this.bones.spine.rotation.x += breathCycle * breathIntensity;
    }
    if (this.bones.chest) {
      this.bones.chest.rotation.x += breathCycle * breathIntensity * 1.2;
    }

    // 2. Micro-motion / Living idling (subtle alive drift)
    const microYaw = Math.sin(this.microMotionTimer * 0.7) * 0.02;
    const microPitch = Math.cos(this.microMotionTimer * 0.5) * 0.015;

    // 3. Head Orientation (Reacts smoothly to mouse gaze or conversational mode)
    if (this.bones.head) {
      // Look towards mouse / screen center with soft damping
      const targetHeadYaw = mouseNormalized.x * 0.28 + microYaw;
      const targetHeadPitch = -mouseNormalized.y * 0.2 + microPitch;
      let targetHeadRoll = -mouseNormalized.x * 0.05;

      if (state.mode === "thinking") {
        // Pensive head tilt during thinking
        targetHeadRoll += 0.12;
      } else if (state.mode === "listening") {
        // Attentive slight forward tilt during listening
        targetHeadRoll -= 0.04;
      }

      this.bones.head.rotation.y += targetHeadYaw;
      this.bones.head.rotation.x += targetHeadPitch;
      this.bones.head.rotation.z += targetHeadRoll;
    }

    if (this.bones.neck) {
      this.bones.neck.rotation.y += mouseNormalized.x * 0.1;
      this.bones.neck.rotation.x += -mouseNormalized.y * 0.08;
    }

    // 4. Eye Gaze & Saccades
    if (this.eyeSaccadeTimer > 2.5 + Math.random() * 2.0) {
      this.eyeSaccadeTimer = 0;
      this.targetEyeGaze.set(
        (Math.random() - 0.5) * 0.15,
        (Math.random() - 0.5) * 0.1
      );
    }
    this.currentEyeGaze.lerp(this.targetEyeGaze, 0.1);

    if (this.bones.leftEye) {
      this.bones.leftEye.rotation.y += mouseNormalized.x * 0.12 + this.currentEyeGaze.x;
      this.bones.leftEye.rotation.x += -mouseNormalized.y * 0.1 + this.currentEyeGaze.y;
    }
    if (this.bones.rightEye) {
      this.bones.rightEye.rotation.y += mouseNormalized.x * 0.12 + this.currentEyeGaze.x;
      this.bones.rightEye.rotation.x += -mouseNormalized.y * 0.1 + this.currentEyeGaze.y;
    }

    // 5. Procedural Gestures (Wave, Nod, Shrug, Explain)
    if (state.gesture !== "none" && this.activeGesture === "none") {
      this.triggerGesture(state.gesture);
    }

    this.updateGestures(deltaSec);
  }

  private updateGestures(deltaSec: number): void {
    if (this.activeGesture === "none") return;

    this.gestureElapsedSec += deltaSec;
    const duration = this.GESTURE_DURATIONS[this.activeGesture] || 2.0;
    const progress = Math.min(1.0, this.gestureElapsedSec / duration);

    // Sine envelope (0 -> 1 -> 0)
    const envelope = Math.sin(progress * Math.PI);

    switch (this.activeGesture) {
      case "nod":
        if (this.bones.head) {
          this.bones.head.rotation.x += Math.sin(progress * Math.PI * 4.0) * 0.18 * envelope;
        }
        break;

      case "wave":
        if (this.bones.rightArm && this.bones.rightForeArm) {
          // Raise upper arm
          this.bones.rightArm.rotation.z -= 1.2 * envelope;
          this.bones.rightArm.rotation.x += 0.4 * envelope;
          // Wave forearm back and forth
          this.bones.rightForeArm.rotation.y += Math.sin(this.gestureElapsedSec * 12.0) * 0.35 * envelope;
        }
        break;

      case "shrug":
        if (this.bones.leftShoulder && this.bones.rightShoulder) {
          this.bones.leftShoulder.rotation.z += 0.2 * envelope;
          this.bones.rightShoulder.rotation.z -= 0.2 * envelope;
        }
        if (this.bones.head) {
          this.bones.head.rotation.z += 0.08 * envelope;
        }
        break;

      case "explain":
      case "small_hand_gesture":
        if (this.bones.rightArm) {
          this.bones.rightArm.rotation.x += 0.35 * envelope;
          this.bones.rightArm.rotation.y += 0.2 * envelope;
        }
        if (this.bones.leftArm) {
          this.bones.leftArm.rotation.x += 0.2 * envelope;
        }
        break;
    }

    if (progress >= 1.0) {
      this.activeGesture = "none";
      this.gestureElapsedSec = 0;
    }
  }
}

/**
 * AANYA AI — Model Rig Manager (Phase 2)
 *
 * Coordinates loading of GLTF/GLB 3D humanoid avatars (via GLTFLoader).
 * Discovers and binds:
 * - Humanoid Bones (BoneController)
 * - Facial Morph Targets & Visemes (MorphController)
 * - Animation Clips (AnimationController)
 *
 * If an external .glb asset is not found at /models/AANYA.glb, it provides
 * a fully functional, stylized procedural 3D humanoid rig with real bones
 * and morph targets so the Three.js pipeline works immediately.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BoneController } from "./BoneController";
import { MorphController } from "./MorphController";
import { AnimationController } from "./AnimationController";

export interface LoadedAvatarResult {
  root: THREE.Object3D;
  isProcedural: boolean;
  hasBones: boolean;
  hasMorphs: boolean;
  modelName: string;
}

export class ModelRigManager {
  private currentModelRoot: THREE.Object3D | null = null;
  private isProcedural: boolean = false;
  private readonly gltfLoader: GLTFLoader;

  constructor() {
    this.gltfLoader = new GLTFLoader();
  }

  /**
   * Attempts to load a GLTF/GLB model from a URL or File Buffer.
   * If loading fails (e.g. 404), resolves with null.
   */
  public async loadGLB(
    urlOrBuffer: string | ArrayBuffer,
    boneController: BoneController,
    morphController: MorphController,
    animationController: AnimationController
  ): Promise<LoadedAvatarResult | null> {
    try {
      const gltf = await new Promise<any>((resolve, reject) => {
        if (typeof urlOrBuffer === "string") {
          this.gltfLoader.load(urlOrBuffer, resolve, undefined, reject);
        } else {
          this.gltfLoader.parse(urlOrBuffer, "", resolve, reject);
        }
      });

      const root = gltf.scene || gltf.scenes[0];
      if (!root) return null;

      this.disposeCurrentModel();
      this.currentModelRoot = root;
      this.isProcedural = false;

      // Auto-scale and center the avatar
      this.normalizeAvatarTransform(root);

      // Register bones and morphs
      morphController.clearMeshes();
      let hasMorphs = false;
      root.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh || (child as THREE.SkinnedMesh).isSkinnedMesh) {
          const mesh = child as THREE.Mesh | THREE.SkinnedMesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
            morphController.registerMesh(mesh);
            hasMorphs = true;
          }
        }
      });

      boneController.discoverBones(root);
      animationController.init(root, gltf.animations || []);

      return {
        root,
        isProcedural: false,
        hasBones: true,
        hasMorphs,
        modelName: typeof urlOrBuffer === "string" ? urlOrBuffer.split("/").pop() || "AANYA.glb" : "Uploaded.glb",
      };
    } catch (err) {
      console.warn("[ModelRigManager] External GLB load failed, falling back to procedural rig:", err);
      return null;
    }
  }

  /**
   * Constructs a stylized 3D avatar rig with humanoid bones and functional morph targets.
   * Enables immediate 3D rendering and verification of the pipeline.
   */
  public createProceduralRig(
    themeColor: string = "#ec4899",
    boneController: BoneController,
    morphController: MorphController,
    animationController: AnimationController
  ): LoadedAvatarResult {
    this.disposeCurrentModel();

    const root = new THREE.Group();
    root.name = "AANYA_Procedural_Rig";

    // 1. Materials
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5d0b5,
      roughness: 0.6,
      metalness: 0.05,
    });

    const hairMaterial = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.4,
      metalness: 0.1,
    });

    const suitMaterial = new THREE.MeshStandardMaterial({
      color: 0x09090b,
      roughness: 0.35,
      metalness: 0.4,
    });

    const cyberGlowMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(themeColor),
      emissive: new THREE.Color(themeColor),
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.8,
    });

    // 2. Bone Hierarchy
    const hips = new THREE.Bone();
    hips.name = "hips";
    hips.position.set(0, -0.6, 0);

    const spine = new THREE.Bone();
    spine.name = "spine";
    spine.position.set(0, 0.45, 0);
    hips.add(spine);

    const chest = new THREE.Bone();
    chest.name = "chest";
    chest.position.set(0, 0.45, 0);
    spine.add(chest);

    const neck = new THREE.Bone();
    neck.name = "neck";
    neck.position.set(0, 0.35, 0);
    chest.add(neck);

    const head = new THREE.Bone();
    head.name = "head";
    head.position.set(0, 0.25, 0);
    neck.add(head);

    // Left Arm
    const leftShoulder = new THREE.Bone();
    leftShoulder.name = "leftshoulder";
    leftShoulder.position.set(0.35, 0.2, 0);
    chest.add(leftShoulder);

    const leftArm = new THREE.Bone();
    leftArm.name = "leftarm";
    leftArm.position.set(0.15, -0.1, 0);
    leftShoulder.add(leftArm);

    const leftForeArm = new THREE.Bone();
    leftForeArm.name = "leftforearm";
    leftForeArm.position.set(0.05, -0.4, 0);
    leftArm.add(leftForeArm);

    // Right Arm
    const rightShoulder = new THREE.Bone();
    rightShoulder.name = "rightshoulder";
    rightShoulder.position.set(-0.35, 0.2, 0);
    chest.add(rightShoulder);

    const rightArm = new THREE.Bone();
    rightArm.name = "rightarm";
    rightArm.position.set(-0.15, -0.1, 0);
    rightShoulder.add(rightArm);

    const rightForeArm = new THREE.Bone();
    rightForeArm.name = "rightforearm";
    rightForeArm.position.set(-0.05, -0.4, 0);
    rightArm.add(rightForeArm);

    root.add(hips);

    // 3. Torso & Cybernetic Suit
    const torsoGeom = new THREE.CylinderGeometry(0.32, 0.26, 0.8, 24);
    const torsoMesh = new THREE.Mesh(torsoGeom, suitMaterial);
    torsoMesh.position.set(0, 0.2, 0);
    chest.add(torsoMesh);

    // Cyber accent strip on suit
    const stripGeom = new THREE.TorusGeometry(0.32, 0.018, 12, 32);
    const stripMesh = new THREE.Mesh(stripGeom, cyberGlowMaterial);
    stripMesh.rotation.x = Math.PI / 2;
    stripMesh.position.set(0, 0.22, 0);
    chest.add(stripMesh);

    // Neck Mesh
    const neckGeom = new THREE.CylinderGeometry(0.12, 0.14, 0.28, 20);
    const neckMesh = new THREE.Mesh(neckGeom, skinMaterial);
    neckMesh.position.set(0, 0.12, 0);
    neck.add(neckMesh);

    // 4. Head with Morph Targets (Blendshapes)
    const headGeom = new THREE.SphereGeometry(0.32, 32, 32);
    headGeom.scale(1.0, 1.15, 1.05);

    // Add morph targets to head geometry: jawOpen, mouthSmile, eyeBlinkLeft, eyeBlinkRight, browInnerUp
    const pos = headGeom.attributes.position;
    const vertexCount = pos.count;

    // Morph 1: jawOpen
    const jawOpenPos: number[] = [];
    // Morph 2: mouthSmile
    const mouthSmilePos: number[] = [];
    // Morph 3: eyeBlinkLeft
    const blinkLeftPos: number[] = [];
    // Morph 4: eyeBlinkRight
    const blinkRightPos: number[] = [];
    // Morph 5: browInnerUp
    const browUpPos: number[] = [];

    for (let i = 0; i < vertexCount; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      // Jaw open: pull lower chin/jaw downwards & slightly forwards
      if (y < -0.15 && z > 0.1) {
        jawOpenPos.push(x, y - 0.12 * ((-y - 0.15) / 0.2), z + 0.02);
      } else {
        jawOpenPos.push(x, y, z);
      }

      // Mouth smile: pull corners of mouth up and outwards
      if (y > -0.22 && y < -0.05 && z > 0.22) {
        const sideSign = x >= 0 ? 1 : -1;
        mouthSmilePos.push(x + sideSign * 0.03, y + 0.04, z);
      } else {
        mouthSmilePos.push(x, y, z);
      }

      // Blink left: upper eyelid down
      if (x < -0.05 && x > -0.22 && y > 0.02 && y < 0.15 && z > 0.24) {
        blinkLeftPos.push(x, y - 0.08, z);
      } else {
        blinkLeftPos.push(x, y, z);
      }

      // Blink right: upper eyelid down
      if (x > 0.05 && x < 0.22 && y > 0.02 && y < 0.15 && z > 0.24) {
        blinkRightPos.push(x, y - 0.08, z);
      } else {
        blinkRightPos.push(x, y, z);
      }

      // Brow inner up: lift center brows
      if (Math.abs(x) < 0.12 && y > 0.14 && y < 0.26 && z > 0.22) {
        browUpPos.push(x, y + 0.06, z);
      } else {
        browUpPos.push(x, y, z);
      }
    }

    headGeom.morphAttributes.position = [
      new THREE.Float32BufferAttribute(jawOpenPos, 3),
      new THREE.Float32BufferAttribute(mouthSmilePos, 3),
      new THREE.Float32BufferAttribute(blinkLeftPos, 3),
      new THREE.Float32BufferAttribute(blinkRightPos, 3),
      new THREE.Float32BufferAttribute(browUpPos, 3),
    ];

    const headMesh = new THREE.Mesh(headGeom, skinMaterial);
    headMesh.name = "AANYA_Head_Mesh";
    headMesh.morphTargetDictionary = {
      jawOpen: 0,
      viseme_aa: 0,
      mouthSmile: 1,
      eyeBlinkLeft: 2,
      eyeBlinkRight: 3,
      browInnerUp: 4,
    };
    headMesh.morphTargetInfluences = [0, 0, 0, 0, 0];
    headMesh.position.set(0, 0.24, 0);
    head.add(headMesh);

    // Hair Styling (Cyberpunk sleek bob)
    const hairGeom = new THREE.SphereGeometry(0.35, 24, 24);
    hairGeom.scale(1.03, 1.15, 1.05);
    const hairMesh = new THREE.Mesh(hairGeom, hairMaterial);
    hairMesh.position.set(0, 0.28, -0.04);
    head.add(hairMesh);

    // Eyes
    const eyeGeom = new THREE.SphereGeometry(0.055, 16, 16);
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e1b4b,
      roughness: 0.1,
      metalness: 0.2,
    });

    const leftEyeMesh = new THREE.Mesh(eyeGeom, eyeMaterial);
    leftEyeMesh.position.set(0.12, 0.27, 0.28);
    head.add(leftEyeMesh);

    const rightEyeMesh = new THREE.Mesh(eyeGeom, eyeMaterial);
    rightEyeMesh.position.set(-0.12, 0.27, 0.28);
    head.add(rightEyeMesh);

    // Cyber Earring / Headset Accent
    const headsetGeom = new THREE.CylinderGeometry(0.045, 0.045, 0.06, 16);
    const headsetMesh = new THREE.Mesh(headsetGeom, cyberGlowMaterial);
    headsetMesh.rotation.z = Math.PI / 2;
    headsetMesh.position.set(0.34, 0.24, 0);
    head.add(headsetMesh);

    // Arm Meshes
    const armGeom = new THREE.CylinderGeometry(0.09, 0.08, 0.45, 16);
    const leftArmMesh = new THREE.Mesh(armGeom, suitMaterial);
    leftArmMesh.position.set(0, -0.2, 0);
    leftArm.add(leftArmMesh);

    const rightArmMesh = new THREE.Mesh(armGeom, suitMaterial);
    rightArmMesh.position.set(0, -0.2, 0);
    rightArm.add(rightArmMesh);

    // Position overall avatar within view
    root.position.set(0, -0.45, 0);

    this.currentModelRoot = root;
    this.isProcedural = true;

    // Register with controllers
    boneController.discoverBones(root);
    morphController.clearMeshes();
    morphController.registerMesh(headMesh);
    animationController.init(root, []);

    return {
      root,
      isProcedural: true,
      hasBones: true,
      hasMorphs: true,
      modelName: "AANYA (Procedural Rig)",
    };
  }

  public getModel(): THREE.Object3D | null {
    return this.currentModelRoot;
  }

  public isProceduralModel(): boolean {
    return this.isProcedural;
  }

  public dispose(): void {
    this.disposeCurrentModel();
  }

  private normalizeAvatarTransform(root: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Target height around 1.8 units
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const targetHeight = 1.8;
      const scale = targetHeight / (size.y > 0.5 ? size.y : maxDim);
      root.scale.setScalar(scale);

      // Re-center so upper torso and head align nicely with camera
      box.setFromObject(root);
      box.getCenter(center);
      root.position.x -= center.x;
      root.position.y -= center.y - 0.15; // Framed nicely around chest/head
      root.position.z -= center.z;
    }
  }

  private disposeCurrentModel(): void {
    if (this.currentModelRoot) {
      this.currentModelRoot.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: any) => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.currentModelRoot = null;
    }
  }
}

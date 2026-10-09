/**
 * AANYA AI — Three.js Avatar Scene (Phase 2)
 *
 * Manages the WebGLRenderer, PerspectiveCamera, Lighting, and Animation Loop.
 * Integrates:
 * - ModelRigManager (GLB loader & procedural rig fallback)
 * - BoneController (Breathing, Head tilt, Gaze saccades, Gestures)
 * - MorphController (Blink, Facial expressions, Lip sync)
 * - AnimationController (Clips & mixers)
 */

import * as THREE from "three";
import { AvatarState } from "./types";
import { BlinkController } from "./BlinkController";
import { BoneController } from "./BoneController";
import { MorphController } from "./MorphController";
import { AnimationController } from "./AnimationController";
import { ModelRigManager, LoadedAvatarResult } from "./ModelRigManager";

export interface ThreeAvatarSceneOptions {
  container: HTMLElement;
  themeColor?: string;
  onModelLoaded?: (info: LoadedAvatarResult) => void;
  onError?: (err: string) => void;
}

export class ThreeAvatarScene {
  private readonly container: HTMLElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  // Controllers
  private readonly boneController: BoneController;
  private readonly morphController: MorphController;
  private readonly animationController: AnimationController;
  private readonly rigManager: ModelRigManager;

  // Lights
  private ambientLight: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private rimLight: THREE.PointLight;

  // State & interaction
  private currentState: AvatarState;
  private readonly blinkController: BlinkController;
  private mouseNormalized: THREE.Vector2 = new THREE.Vector2(0, 0);
  private targetMouseNormalized: THREE.Vector2 = new THREE.Vector2(0, 0);

  // Loop & sizing
  private animationFrameId: number | null = null;
  private lastTimeMs: number = 0;
  private resizeObserver: ResizeObserver | null = null;
  private isDisposed: boolean = false;

  constructor(options: ThreeAvatarSceneOptions, blinkController: BlinkController, initialState: AvatarState) {
    this.container = options.container;
    this.blinkController = blinkController;
    this.currentState = initialState;

    // 1. Scene
    this.scene = new THREE.Scene();

    // 2. Camera (Framed for portrait/upper torso)
    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 500;
    this.camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 50);
    this.camera.position.set(0, 0.15, 2.4);
    this.camera.lookAt(0, 0.1, 0);

    // 3. Lighting Setup (Cyberpunk Portrait Lighting)
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(this.ambientLight);

    this.keyLight = new THREE.DirectionalLight(0xfff5ea, 1.6);
    this.keyLight.position.set(1.5, 2.5, 2.5);
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight(0xdbeafe, 0.8);
    this.fillLight.position.set(-2, 1, 1.5);
    this.scene.add(this.fillLight);

    const themeHex = options.themeColor || "#ec4899";
    this.rimLight = new THREE.PointLight(new THREE.Color(themeHex), 2.5, 8);
    this.rimLight.position.set(0, 1.2, -1.2);
    this.scene.add(this.rimLight);

    // 4. Controllers
    this.boneController = new BoneController();
    this.morphController = new MorphController();
    this.animationController = new AnimationController();
    this.rigManager = new ModelRigManager();

    // 5. Renderer
    this.initRenderer();

    // 6. Event Listeners
    this.setupEventListeners();

    // 7. Initial Model Load
    this.initModel(options.onModelLoaded, options.onError);

    // 8. Start Loop
    this.startLoop();
  }

  /**
   * Updates avatar state (mode, emotion, audioLevel, mouthOpenAmount, etc.).
   */
  public updateState(state: AvatarState): void {
    this.currentState = state;
    this.animationController.syncMode(state.mode);
  }

  /**
   * Updates the theme color used for the cyberpunk rim light and procedural glow.
   */
  public setThemeColor(hex: string): void {
    if (this.rimLight) {
      this.rimLight.color.set(hex);
    }
  }

  /**
   * Loads a custom GLB model by URL or File buffer.
   */
  public async loadCustomGLB(urlOrBuffer: string | ArrayBuffer): Promise<LoadedAvatarResult | null> {
    const result = await this.rigManager.loadGLB(
      urlOrBuffer,
      this.boneController,
      this.morphController,
      this.animationController
    );

    if (result) {
      this.scene.add(result.root);
      return result;
    }
    return null;
  }

  public getRigManager(): ModelRigManager {
    return this.rigManager;
  }

  /**
   * Disposes all WebGL resources and event listeners.
   */
  public dispose(): void {
    this.isDisposed = true;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.container.removeEventListener("mousemove", this.handleMouseMove);
    this.container.removeEventListener("mouseleave", this.handleMouseLeave);

    this.animationController.dispose();
    this.rigManager.dispose();

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }
  }

  private initRenderer(): void {
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });

      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(
        this.container.clientWidth || 400,
        this.container.clientHeight || 500
      );
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.1;

      this.renderer.domElement.style.width = "100%";
      this.renderer.domElement.style.height = "100%";
      this.renderer.domElement.style.display = "block";
      this.renderer.domElement.style.position = "absolute";
      this.renderer.domElement.style.top = "0";
      this.renderer.domElement.style.left = "0";

      this.container.appendChild(this.renderer.domElement);
    } catch (err) {
      console.error("[ThreeAvatarScene] Failed to create WebGLRenderer:", err);
    }
  }

  private setupEventListeners(): void {
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);

    this.container.addEventListener("mousemove", this.handleMouseMove);
    this.container.addEventListener("mouseleave", this.handleMouseLeave);

    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.container);
  }

  private handleMouseMove(e: MouseEvent): void {
    const rect = this.container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      this.targetMouseNormalized.set(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
    }
  }

  private handleMouseLeave(): void {
    // Smoothly return gaze towards center
    this.targetMouseNormalized.set(0, 0);
  }

  private handleResize(): void {
    if (!this.renderer || this.isDisposed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width > 0 && height > 0) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    }
  }

  private async initModel(
    onLoaded?: (info: LoadedAvatarResult) => void,
    onError?: (err: string) => void
  ): Promise<void> {
    // 1. Try to load external AANYA.glb if present in /models/AANYA.glb
    const loaded = await this.rigManager.loadGLB(
      "/models/AANYA.glb",
      this.boneController,
      this.morphController,
      this.animationController
    );

    if (loaded) {
      this.scene.add(loaded.root);
      if (onLoaded) onLoaded(loaded);
      return;
    }

    // 2. Fallback to procedural rigged 3D avatar
    try {
      const procedural = this.rigManager.createProceduralRig(
        this.rimLight.color.getHexString(),
        this.boneController,
        this.morphController,
        this.animationController
      );
      this.scene.add(procedural.root);
      if (onLoaded) onLoaded(procedural);
    } catch (err: any) {
      console.error("[ThreeAvatarScene] Procedural rig generation failed:", err);
      if (onError) onError(err.message || "Failed to initialize 3D scene");
    }
  }

  private startLoop(): void {
    this.lastTimeMs = performance.now();

    const loop = (time: number) => {
      if (this.isDisposed) return;

      const deltaMs = Math.min(time - this.lastTimeMs, 100);
      const deltaSec = deltaMs / 1000;
      this.lastTimeMs = time;

      // Mouse gaze smoothing
      this.mouseNormalized.lerp(this.targetMouseNormalized, 0.08);

      // 1. Update Skeleton / Bones
      this.boneController.update(this.currentState, deltaSec, this.mouseNormalized);

      // 2. Update Morph Targets (Blink, Expressions, Lip Sync)
      this.morphController.update(this.currentState, this.blinkController, deltaSec);

      // 3. Update Animation Mixer
      this.animationController.update(deltaSec);

      // 4. Render Frame
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }
}

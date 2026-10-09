/**
 * AANYA AI — Blink Controller (Phase 1)
 *
 * Configurable, procedural eye-blink timing controller.
 * Computes deterministic blink curves (0.0 = open, 1.0 = fully closed)
 * over randomized intervals (default 2 to 6 seconds, 120-180ms duration).
 *
 * NOTE FOR PHASE 1:
 * This controller provides pure mathematical timing and state.
 * It intentionally does NOT warp or fake deformation on the static 2D image.
 * In Phase 2 & 3, `getBlinkAmount()` will directly drive the 3D model's
 * `eyeBlinkLeft` and `eyeBlinkRight` morph target blendshapes.
 */

export interface BlinkControllerConfig {
  /** Minimum interval between blinks in milliseconds (default: 2000) */
  minIntervalMs?: number;
  /** Maximum interval between blinks in milliseconds (default: 6000) */
  maxIntervalMs?: number;
  /** Total duration of a blink from open -> closed -> open in ms (default: 150) */
  blinkDurationMs?: number;
  /** Probability (0.0 to 1.0) of a quick double-blink (default: 0.12) */
  doubleBlinkChance?: number;
}

export class BlinkController {
  private readonly config: Required<BlinkControllerConfig>;

  private isRunning: boolean = false;
  private timeUntilNextBlinkMs: number = 0;
  private currentBlinkElapsedMs: number = 0;
  private isCurrentlyBlinking: boolean = false;
  private blinkAmount: number = 0; // 0.0 (open) to 1.0 (closed)

  constructor(config: BlinkControllerConfig = {}) {
    this.config = {
      minIntervalMs: config.minIntervalMs ?? 2000,
      maxIntervalMs: config.maxIntervalMs ?? 6000,
      blinkDurationMs: config.blinkDurationMs ?? 150,
      doubleBlinkChance: config.doubleBlinkChance ?? 0.12,
    };

    this.scheduleNextBlink();
  }

  /**
   * Starts the procedural blink timer.
   */
  public start(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      this.scheduleNextBlink();
    }
  }

  /**
   * Stops the procedural blink timer and resets eyes to open (0.0).
   */
  public stop(): void {
    this.isRunning = false;
    this.isCurrentlyBlinking = false;
    this.blinkAmount = 0;
    this.currentBlinkElapsedMs = 0;
  }

  /**
   * Advances the blink simulation by delta milliseconds.
   */
  public update(deltaTimeMs: number): void {
    if (!this.isRunning || deltaTimeMs <= 0) return;

    if (this.isCurrentlyBlinking) {
      this.currentBlinkElapsedMs += deltaTimeMs;
      const progress = this.currentBlinkElapsedMs / this.config.blinkDurationMs;

      if (progress >= 1.0) {
        // Blink finished
        this.isCurrentlyBlinking = false;
        this.blinkAmount = 0;
        this.currentBlinkElapsedMs = 0;
        this.scheduleNextBlink();
      } else {
        // Bell-shaped smooth curve for eyelid motion:
        // Sine wave from 0 -> PI: peaks at 1.0 at midpoint (progress = 0.5)
        this.blinkAmount = Math.sin(progress * Math.PI);
      }
    } else {
      this.timeUntilNextBlinkMs -= deltaTimeMs;
      if (this.timeUntilNextBlinkMs <= 0) {
        this.triggerBlink();
      }
    }
  }

  /**
   * Manually triggers an immediate blink.
   */
  public triggerBlink(): void {
    this.isCurrentlyBlinking = true;
    this.currentBlinkElapsedMs = 0;
    this.blinkAmount = 0;
  }

  /**
   * Returns the current blink weight between 0.0 (open) and 1.0 (closed).
   */
  public getBlinkAmount(): number {
    return this.blinkAmount;
  }

  /**
   * Returns whether a blink is currently in progress.
   */
  public isBlinking(): boolean {
    return this.isCurrentlyBlinking;
  }

  /**
   * Resets all timers back to baseline.
   */
  public reset(): void {
    this.stop();
    this.scheduleNextBlink();
  }

  private scheduleNextBlink(): void {
    const isDouble = Math.random() < this.config.doubleBlinkChance;
    if (isDouble) {
      // Short delay for a rapid double blink
      this.timeUntilNextBlinkMs = 120 + Math.random() * 100;
    } else {
      const range = this.config.maxIntervalMs - this.config.minIntervalMs;
      this.timeUntilNextBlinkMs = this.config.minIntervalMs + Math.random() * range;
    }
  }
}

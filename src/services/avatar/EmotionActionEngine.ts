export type EmotionType =
  | 'neutral'
  | 'happy'
  | 'sassy'
  | 'surprised'
  | 'thinking'
  | 'flirty'
  | 'teasing'
  | 'listening'
  | 'speaking';

export type GestureType =
  | 'idle'
  | 'nod'
  | 'shake_head'
  | 'tilt_curious'
  | 'wave_hand'
  | 'point'
  | 'thinking_pose'
  | 'celebrate'
  | 'talking_gesture';

export interface AvatarEmotionState {
  emotion: EmotionType;
  intensity: number; // 0.0 to 1.0
  gesture: GestureType;
  gestureProgress: number; // 0.0 to 1.0
}

/**
 * Extracts and maps emotions from Gemini conversational text, tone, and tool events.
 */
export class EmotionActionEngine {
  private currentEmotion: EmotionType = 'neutral';
  private currentGesture: GestureType = 'idle';
  private gestureStartTime: number = 0;
  private gestureDuration: number = 2000;

  public analyzeTextIntent(text: string, isUser: boolean): { emotion: EmotionType; gesture: GestureType } {
    if (isUser) {
      return { emotion: 'listening', gesture: 'tilt_curious' };
    }

    const lower = text.toLowerCase();

    // Sassy / Teasing patterns
    if (
      lower.includes('babe') ||
      lower.includes('flattery') ||
      lower.includes('smart') ||
      lower.includes('obviously') ||
      lower.includes('as if') ||
      lower.includes('ha ha') ||
      lower.includes('haha') ||
      lower.includes('dekh rahi hoon') ||
      lower.includes('tease')
    ) {
      return { emotion: 'sassy', gesture: 'talking_gesture' };
    }

    // Playful / Happy
    if (
      lower.includes('awesome') ||
      lower.includes('super') ||
      lower.includes('great') ||
      lower.includes('celebrat') ||
      lower.includes('ho gaya') ||
      lower.includes('done') ||
      lower.includes('yay') ||
      lower.includes('badhiya') ||
      lower.includes('shandar')
    ) {
      return { emotion: 'happy', gesture: 'celebrate' };
    }

    // Surprised
    if (lower.includes('wow') || lower.includes('arre') || lower.includes('kya baat') || lower.includes('really') || lower.includes('!')) {
      return { emotion: 'surprised', gesture: 'nod' };
    }

    // Thinking / Analyzing
    if (
      lower.includes('soch') ||
      lower.includes('let me check') ||
      lower.includes('ek second') ||
      lower.includes('check kar rahi hoon') ||
      lower.includes('searching') ||
      lower.includes('analyz')
    ) {
      return { emotion: 'thinking', gesture: 'thinking_pose' };
    }

    // Flirty / Charming
    if (lower.includes('sweet') || lower.includes('charming') || lower.includes('cute') || lower.includes('pyaar')) {
      return { emotion: 'flirty', gesture: 'tilt_curious' };
    }

    return { emotion: 'speaking', gesture: 'talking_gesture' };
  }

  public triggerAction(gesture: GestureType, durationMs: number = 2200): void {
    this.currentGesture = gesture;
    this.gestureStartTime = Date.now();
    this.gestureDuration = durationMs;
  }

  public setEmotion(emotion: EmotionType): void {
    this.currentEmotion = emotion;
  }

  public update(): { emotion: EmotionType; gesture: GestureType; gestureProgress: number } {
    const elapsed = Date.now() - this.gestureStartTime;
    if (elapsed > this.gestureDuration) {
      this.currentGesture = 'idle';
      return { emotion: this.currentEmotion, gesture: 'idle', gestureProgress: 0 };
    }
    const progress = Math.min(1, elapsed / this.gestureDuration);
    return { emotion: this.currentEmotion, gesture: this.currentGesture, gestureProgress: progress };
  }
}

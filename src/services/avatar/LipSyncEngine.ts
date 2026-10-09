import { AudioPlayer } from '../AudioPlayer';

export interface LipSyncParams {
  mouthOpen: number; // 0.0 to 1.0 (jaw drop)
  mouthWidth: number; // 0.0 to 1.0 (smile/stretch)
  lipRound: number; // 0.0 to 1.0 (pucker/o-shape)
  intensity: number; // 0.0 to 1.0 overall speech energy
}

/**
 * Real-time audio frequency-domain analysis to drive high-accuracy procedural lip sync
 * analyzing vocal band frequencies (vowels A, O, E, U) with low latency.
 */
export class LipSyncEngine {
  private freqBuffer = new Uint8Array(128);
  private currentParams: LipSyncParams = {
    mouthOpen: 0,
    mouthWidth: 0.5,
    lipRound: 0,
    intensity: 0,
  };

  public update(player: AudioPlayer | null, isSpeaking: boolean): LipSyncParams {
    if (!player || !isSpeaking) {
      // Smoothly return to relaxed neutral mouth
      this.currentParams.mouthOpen *= 0.7;
      this.currentParams.mouthWidth = this.currentParams.mouthWidth * 0.8 + 0.5 * 0.2;
      this.currentParams.lipRound *= 0.7;
      this.currentParams.intensity *= 0.6;
      return this.currentParams;
    }

    player.getFrequencyData(this.freqBuffer);

    // Human speech vowel frequency bands:
    // Low frequencies (150 - 500 Hz): bin 1-4 -> Open vowel resonance (A, O)
    // Mid frequencies (500 - 1500 Hz): bin 5-14 -> Tongue height & jaw drop
    // High-mid frequencies (1500 - 3500 Hz): bin 15-32 -> Formants (E, I, Sibilants)
    let lowEnergy = 0;
    for (let i = 1; i <= 4; i++) lowEnergy += this.freqBuffer[i] || 0;
    lowEnergy /= 4 * 255;

    let midEnergy = 0;
    for (let i = 5; i <= 14; i++) midEnergy += this.freqBuffer[i] || 0;
    midEnergy /= 10 * 255;

    let highEnergy = 0;
    for (let i = 15; i <= 30; i++) highEnergy += this.freqBuffer[i] || 0;
    highEnergy /= 16 * 255;

    const overallIntensity = Math.min(1, lowEnergy * 0.5 + midEnergy * 0.8 + highEnergy * 0.3);

    // Target calculations
    const targetMouthOpen = Math.min(1, (midEnergy * 1.3 + lowEnergy * 0.7) * 1.4);
    const targetMouthWidth = Math.min(1, Math.max(0.2, 0.4 + highEnergy * 0.8 - lowEnergy * 0.3));
    const targetLipRound = Math.min(1, Math.max(0, lowEnergy * 1.2 - highEnergy * 0.5));

    // Smooth interpolations (attack fast, release slightly slower)
    const attack = 0.45;
    const release = 0.25;

    const openCoeff = targetMouthOpen > this.currentParams.mouthOpen ? attack : release;
    this.currentParams.mouthOpen += (targetMouthOpen - this.currentParams.mouthOpen) * openCoeff;

    this.currentParams.mouthWidth += (targetMouthWidth - this.currentParams.mouthWidth) * 0.3;
    this.currentParams.lipRound += (targetLipRound - this.currentParams.lipRound) * 0.3;
    this.currentParams.intensity += (overallIntensity - this.currentParams.intensity) * 0.4;

    return this.currentParams;
  }
}

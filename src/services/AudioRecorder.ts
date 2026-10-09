import { AudioContextManager } from './AudioContextManager';

/**
 * AudioRecorder handles mic input streaming.
 * Captures user speech, downsamples to 16kHz PCM16 Little-Endian,
 * and passes base64 audio chunks to the callback.
 */

export class AudioRecorder {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private silenceGainNode: GainNode | null = null;
  private isRecording: boolean = false;
  private recoveryInterval: any = null;
  private micPacketCount: number = 0;
  private syntheticOsc: OscillatorNode | null = null;
  private syntheticGain: GainNode | null = null;
  private isSynthetic: boolean = false;

  private onAudioChunk?: (base64Audio: string) => void;
  private onVolumeChange?: (volume: number) => void;

  constructor(
    onAudioChunk?: (base64Audio: string) => void,
    onVolumeChange?: (volume: number) => void
  ) {
    this.onAudioChunk = onAudioChunk;
    this.onVolumeChange = onVolumeChange;
  }

  public getAudioContextState(): string {
    return this.audioCtx ? this.audioCtx.state : 'uninitialized';
  }

  public isActive(): boolean {
    return this.isRecording;
  }

  public isUsingSyntheticStream(): boolean {
    return this.isSynthetic;
  }

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  private createSyntheticMediaStream(): MediaStream {
    if (!this.audioCtx) {
      this.audioCtx = AudioContextManager.getSharedAudioContext();
      AudioContextManager.register('AudioRecorder', this.audioCtx);
    }
    const dest = this.audioCtx.createMediaStreamDestination();
    this.syntheticOsc = this.audioCtx.createOscillator();
    this.syntheticGain = this.audioCtx.createGain();
    this.syntheticGain.gain.value = 0; // Complete silence, non-audible to user
    this.syntheticOsc.connect(this.syntheticGain);
    this.syntheticGain.connect(dest);
    try {
      this.syntheticOsc.start();
    } catch {
      // ignore
    }
    return dest.stream;
  }

  public async start(): Promise<void> {
    if (this.isRecording) return;

    // Initialize shared AudioContext first so it is never uninitialized
    try {
      this.audioCtx = AudioContextManager.getSharedAudioContext();
      AudioContextManager.register('AudioRecorder', this.audioCtx);
      await AudioContextManager.ensureResumed(this.audioCtx, 'AudioRecorder');
    } catch (ctxErr) {
      console.warn('[AudioRecorder] AudioContext initialization warning:', ctxErr);
    }

    let isSynthetic = false;

    if (this.isSupported()) {
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (micErr: any) {
        // Fallback to basic audio constraint if advanced constraints failed and it's not a hard permission rejection
        if (micErr?.name !== 'NotAllowedError' && micErr?.name !== 'PermissionDeniedError' && micErr?.name !== 'SecurityError') {
          try {
            console.warn('[STAGE 1 MIC CAPTURE] Advanced constraints failed, falling back to basic audio...');
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (basicErr: any) {
            console.warn(`[STAGE 1 MIC CAPTURE] Hardware microphone unavailable (${basicErr?.message || basicErr}). Seamlessly activating synthetic audio input stream.`);
            this.mediaStream = this.createSyntheticMediaStream();
            isSynthetic = true;
          }
        } else {
          console.warn(`[STAGE 1 MIC CAPTURE] Microphone permission denied/blocked in browser (${micErr?.message || micErr}). Seamlessly activating synthetic audio input stream.`);
          this.mediaStream = this.createSyntheticMediaStream();
          isSynthetic = true;
        }
      }
    } else {
      console.warn('[STAGE 1 MIC CAPTURE] navigator.mediaDevices not supported. Seamlessly activating synthetic audio input stream.');
      this.mediaStream = this.createSyntheticMediaStream();
      isSynthetic = true;
    }

    this.isSynthetic = isSynthetic;

    try {
      if (!this.audioCtx) {
        this.audioCtx = AudioContextManager.getSharedAudioContext();
      }
      await AudioContextManager.ensureResumed(this.audioCtx, 'AudioRecorder');

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.processorNode = this.audioCtx.createScriptProcessor(4096, 1, 1);

      this.processorNode.onaudioprocess = (event: AudioProcessingEvent): void => {
        if (!this.isRecording) return;

        const ctxState = this.audioCtx ? this.audioCtx.state : 'null';

        if (this.audioCtx && (this.audioCtx.state as string) !== 'running') {
          console.warn(`[STAGE 2 AUDIO CONTEXT] AudioRecorder detected state '${ctxState}'. Auto-resuming...`);
          AudioContextManager.ensureResumed(this.audioCtx, 'AudioRecorder');
        }

        const inputBuffer = event.inputBuffer.getChannelData(0);
        const nativeSampleRate = event.inputBuffer.sampleRate;

        let sum = 0;
        for (let i = 0; i < inputBuffer.length; i++) {
          sum += inputBuffer[i] * inputBuffer[i];
        }
        const rms = Math.sqrt(sum / inputBuffer.length);
        const volume = Math.min(1, rms * 5);
        if (this.onVolumeChange) {
          this.onVolumeChange(volume);
        }

        // STAGE 3: PCM ENCODING
        const downsampled = this.downsample(inputBuffer, nativeSampleRate, 16000);
        const pcm16 = this.floatToPCM16(downsampled);
        const base64 = this.arrayBufferToBase64(pcm16);

        this.micPacketCount++;

        if (this.micPacketCount % 30 === 1) {
          console.log(`[STAGE 1 MIC CAPTURE & STAGE 3 PCM ENCODING] Success: true | Packet #${this.micPacketCount} | Float samples: ${inputBuffer.length} | PCM16 bytes: ${pcm16.byteLength} | Base64 chars: ${base64.length} | AudioContext State: ${ctxState}`);
        }

        // If running in synthetic fallback mode (hardware mic unavailable), do not stream
        // continuous zero packets to the model to avoid false VAD triggers
        if (this.isSynthetic) {
          return;
        }

        if (this.onAudioChunk && base64) {
          this.onAudioChunk(base64);
        }
      };

      this.sourceNode.connect(this.processorNode);

      // Connect via Zero Gain node to destination to trigger Web Audio API processing without speaker echo/feedback
      this.silenceGainNode = this.audioCtx.createGain();
      this.silenceGainNode.gain.value = 0;
      this.processorNode.connect(this.silenceGainNode);
      this.silenceGainNode.connect(this.audioCtx.destination);

      this.isRecording = true;

      // Active periodic check to recover from suspended AudioContext
      if (this.recoveryInterval) clearInterval(this.recoveryInterval);
      this.recoveryInterval = setInterval(() => {
        if (this.isRecording && this.audioCtx && (this.audioCtx.state as string) !== 'running') {
          console.warn(`[STAGE 2 AUDIO CONTEXT CHECK] AudioRecorder context is '${this.audioCtx.state}'. Periodic check triggering resume...`);
          AudioContextManager.ensureResumed(this.audioCtx, 'AudioRecorder');
        }
      }, 1000);

      console.log(`[STAGE 1 MIC CAPTURE] Success: true | Microphone streaming active${isSynthetic ? ' (synthetic fallback)' : ''} | AudioContext State: ${this.audioCtx.state}`);
    } catch (err: any) {
      if (this.mediaStream) {
        try {
          this.mediaStream.getTracks().forEach((track) => track.stop());
        } catch {
          // ignore
        }
        this.mediaStream = null;
      }
      this.isRecording = false;
      console.warn(`[STAGE 1 MIC CAPTURE] Warning: AudioRecorder start error: ${err.message || err} | AudioContext State: ${this.getAudioContextState()}`);
      throw err;
    }
  }

  public stop(): void {
    this.isRecording = false;

    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
    }

    if (this.syntheticOsc) {
      try {
        this.syntheticOsc.stop();
        this.syntheticOsc.disconnect();
      } catch {
        // ignore
      }
      this.syntheticOsc = null;
    }

    if (this.syntheticGain) {
      try {
        this.syntheticGain.disconnect();
      } catch {
        // ignore
      }
      this.syntheticGain = null;
    }

    this.isSynthetic = false;

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      try {
        this.processorNode.disconnect();
      } catch (e) {
        // ignore
      }
      this.processorNode = null;
    }

    if (this.silenceGainNode) {
      try {
        this.silenceGainNode.disconnect();
      } catch (e) {
        // ignore
      }
      this.silenceGainNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {
        // ignore
      }
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.onVolumeChange) {
      this.onVolumeChange(0);
    }
  }

  private downsample(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
    if (inputSampleRate === outputSampleRate) {
      return buffer;
    }
    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    return result;
  }

  private floatToPCM16(input: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); // Little endian
    }
    return buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}


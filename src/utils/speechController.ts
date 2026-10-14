/**
 * Shared Speech Controller for Flexdemy.
 * Manages window.speechSynthesis playback, Pause/Resume, Stop,
 * chained question/option utterances, and notifies subscribers.
 */

export type PlaybackState = 'idle' | 'speaking' | 'paused' | 'error';

export interface SpeechControllerState {
  playbackState: PlaybackState;
  currentPassageId: string | null;
  currentText: string | null;
  rate: number;
  lang: string;
  error: string | null;
  isSupported: boolean;
}

export interface SpeechPlayOptions {
  rate?: number;
  lang?: string;
  onBoundary?: (event: SpeechSynthesisEvent) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export class SpeechController {
  private playbackState: PlaybackState = 'idle';
  private currentPassageId: string | null = null;
  private currentText: string | null = null;
  private defaultRate = 1.0;
  private defaultLang = 'en-US';
  private currentRate = 1.0;
  private currentLang = 'en-US';
  private error: string | null = null;
  private listeners = new Set<(state: SpeechControllerState) => void>();

  // Reference retention prevents Chromium / GC from dropping paused utterances
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private activeQueue: SpeechSynthesisUtterance[] = [];
  private onChainEndCallback: (() => void) | null = null;

  // Monotonically increasing generation ID to invalidate callbacks from cancelled utterances
  private currentGeneration = 0;

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const hasSpeechSynthesis =
      'speechSynthesis' in window && Boolean(window.speechSynthesis);
    const hasUtterance =
      typeof (window as any).SpeechSynthesisUtterance !== 'undefined' ||
      typeof (globalThis as any).SpeechSynthesisUtterance !== 'undefined';
    return Boolean(hasSpeechSynthesis && hasUtterance);
  }

  public setRate(rate: number): void {
    this.defaultRate = rate;
    this.currentRate = rate;
  }

  public setLang(lang: string): void {
    this.defaultLang = lang;
    this.currentLang = lang;
  }

  public getState(): SpeechControllerState {
    return {
      playbackState: this.playbackState,
      currentPassageId: this.currentPassageId,
      currentText: this.currentText,
      rate: this.currentRate,
      lang: this.currentLang,
      error: this.error,
      isSupported: this.isSupported(),
    };
  }

  public subscribe(listener: (state: SpeechControllerState) => void): () => void {
    this.listeners.add(listener);
    // Initial notification
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch {
        // ignore listener errors
      }
    });
  }

  /**
   * Speak a single text passage.
   */
  public play(passageId: string, text: string, options?: SpeechPlayOptions): void {
    if (!this.isSupported()) {
      this.playbackState = 'error';
      this.error = 'Speech synthesis is not supported in this browser.';
      this.notify();
      return;
    }

    if (!text || !text.trim()) {
      return;
    }

    // Cancel existing speech before starting a new passage
    this.stopInternal(/* incrementGeneration = */ true);

    const generation = this.currentGeneration;
    const UtteranceCtor =
      (window as any).SpeechSynthesisUtterance ||
      (globalThis as any).SpeechSynthesisUtterance;
    const utterance: SpeechSynthesisUtterance = new UtteranceCtor(text);

    const chosenRate = options?.rate ?? this.defaultRate;
    const chosenLang = options?.lang ?? this.defaultLang;
    utterance.rate = chosenRate;
    utterance.lang = chosenLang;

    this.currentRate = chosenRate;
    this.currentLang = chosenLang;
    this.currentText = text;
    this.currentPassageId = passageId;
    this.activeUtterance = utterance;
    this.error = null;
    this.playbackState = 'speaking';

    this.setupUtteranceEvents(utterance, generation, passageId, {
      onBoundary: options?.onBoundary,
      onEnd: options?.onEnd,
      onError: options?.onError,
    });

    try {
      window.speechSynthesis.speak(utterance);
      this.notify();
    } catch (err: any) {
      if (generation === this.currentGeneration) {
        this.playbackState = 'error';
        this.error = err?.message || 'Failed to start speech playback.';
        this.activeUtterance = null;
        this.notify();
      }
    }
  }

  /**
   * Play a sequence of utterances (e.g. Question followed by Option A, B, C, D)
   * while preserving Pause, Resume, and Stop across the entire chain.
   */
  public playChained(
    passageId: string,
    utterances: SpeechSynthesisUtterance[],
    options?: { onEnd?: () => void; onError?: (err: string) => void }
  ): void {
    if (!this.isSupported()) {
      this.playbackState = 'error';
      this.error = 'Speech synthesis is not supported in this browser.';
      this.notify();
      return;
    }

    if (!utterances || utterances.length === 0) {
      return;
    }

    // Cancel existing playback
    this.stopInternal(/* incrementGeneration = */ true);

    const generation = this.currentGeneration;
    this.currentPassageId = passageId;
    this.activeQueue = [...utterances];
    this.onChainEndCallback = options?.onEnd || null;
    this.error = null;
    this.playbackState = 'speaking';

    this.playNextInQueue(generation, passageId, options);
  }

  private playNextInQueue(
    generation: number,
    passageId: string,
    options?: { onEnd?: () => void; onError?: (err: string) => void }
  ): void {
    if (generation !== this.currentGeneration) return;

    if (this.activeQueue.length === 0) {
      this.playbackState = 'idle';
      this.currentPassageId = null;
      this.currentText = null;
      this.activeUtterance = null;
      this.notify();
      this.onChainEndCallback?.();
      return;
    }

    const nextUtterance = this.activeQueue.shift()!;
    this.activeUtterance = nextUtterance;
    this.currentText = nextUtterance.text;
    if (nextUtterance.rate) this.currentRate = nextUtterance.rate;
    if (nextUtterance.lang) this.currentLang = nextUtterance.lang;

    this.setupUtteranceEvents(nextUtterance, generation, passageId, {
      onEnd: () => {
        if (generation === this.currentGeneration) {
          this.playNextInQueue(generation, passageId, options);
        }
      },
      onError: options?.onError,
    });

    try {
      window.speechSynthesis.speak(nextUtterance);
      this.notify();
    } catch (err: any) {
      if (generation === this.currentGeneration) {
        this.playbackState = 'error';
        this.error = err?.message || 'Failed to speak chained utterance.';
        this.activeUtterance = null;
        this.notify();
      }
    }
  }

  private setupUtteranceEvents(
    utterance: SpeechSynthesisUtterance,
    generation: number,
    passageId: string,
    callbacks?: {
      onBoundary?: (e: SpeechSynthesisEvent) => void;
      onEnd?: () => void;
      onError?: (err: string) => void;
    }
  ): void {
    // Preserve any existing boundary handler on the utterance
    const existingBoundary = utterance.onboundary;
    utterance.onboundary = (e: SpeechSynthesisEvent) => {
      if (generation !== this.currentGeneration) return;
      existingBoundary?.call(utterance, e);
      callbacks?.onBoundary?.(e);
    };

    utterance.onstart = () => {
      if (generation !== this.currentGeneration) return;
      this.playbackState = 'speaking';
      this.currentPassageId = passageId;
      this.error = null;
      this.notify();
    };

    utterance.onpause = () => {
      if (generation !== this.currentGeneration) return;
      this.playbackState = 'paused';
      this.notify();
    };

    utterance.onresume = () => {
      if (generation !== this.currentGeneration) return;
      this.playbackState = 'speaking';
      this.notify();
    };

    const existingEnd = utterance.onend;
    utterance.onend = (e: SpeechSynthesisEvent) => {
      if (generation !== this.currentGeneration) return;
      existingEnd?.call(utterance, e);
      if (callbacks?.onEnd) {
        callbacks.onEnd();
      } else {
        this.playbackState = 'idle';
        this.currentPassageId = null;
        this.currentText = null;
        this.activeUtterance = null;
        this.notify();
      }
    };

    const existingError = utterance.onerror;
    utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
      if (generation !== this.currentGeneration) return;
      existingError?.call(utterance, e);

      // Deliberate cancellations trigger 'canceled' or 'interrupted' in Chromium
      if (e.error === 'canceled' || e.error === 'interrupted') {
        this.playbackState = 'idle';
        this.currentPassageId = null;
        this.currentText = null;
        this.activeUtterance = null;
        this.activeQueue = [];
        this.notify();
        return;
      }

      this.playbackState = 'error';
      this.error = e.error || 'Speech error occurred.';
      this.activeUtterance = null;
      this.activeQueue = [];
      this.notify();
      callbacks?.onError?.(this.error);
    };
  }

  /**
   * Pause the currently speaking utterance without losing position.
   */
  public pause(): void {
    if (!this.isSupported() || this.playbackState !== 'speaking') {
      return;
    }

    try {
      window.speechSynthesis.pause();
      this.playbackState = 'paused';
      this.notify();
    } catch (err: any) {
      this.error = err?.message || 'Failed to pause speech.';
      this.notify();
    }
  }

  /**
   * Resume the paused utterance from the paused position.
   */
  public resume(): void {
    if (!this.isSupported() || this.playbackState !== 'paused') {
      return;
    }

    try {
      window.speechSynthesis.resume();
      this.playbackState = 'speaking';
      this.notify();
    } catch (err: any) {
      this.error = err?.message || 'Failed to resume speech.';
      this.notify();
    }
  }

  /**
   * Stop speech playback and reset state.
   */
  public stop(): void {
    this.stopInternal(/* incrementGeneration = */ true);
    this.notify();
  }

  private stopInternal(incrementGeneration: boolean): void {
    if (incrementGeneration) {
      this.currentGeneration++;
    }

    this.playbackState = 'idle';
    this.currentPassageId = null;
    this.currentText = null;
    this.activeUtterance = null;
    this.activeQueue = [];
    this.onChainEndCallback = null;

    if (this.isSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }
}

// Global singleton controller instance shared across all modes and components
export const speechController = new SpeechController();

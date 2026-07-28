/**
 * Kiosk confirmation sounds.
 *
 * Two tones, synthesised with Web Audio so the kiosk ships no audio files: a
 * rising two-note chime when a booking lands, and a low double-buzz when one
 * fails. Frequencies and envelopes are transcribed from the approved
 * prototypes.
 *
 * Three rules keep this safe on a public device:
 *   - the AudioContext is created lazily, on the first gesture, because
 *     browsers refuse to start one before a user interaction;
 *   - every call is wrapped, so a locked-down or audio-less kiosk degrades to
 *     silence instead of throwing mid-booking;
 *   - a client who has asked for reduced motion is also asking for a calmer
 *     device, so the caller can mute without unmounting anything.
 */

export type KioskSoundKind = "ok" | "error";

type MinimalAudioContext = {
  currentTime: number;
  state: string;
  destination: unknown;
  resume: () => unknown;
  close: () => unknown;
  createOscillator: () => {
    type: string;
    frequency: { value: number };
    connect: (target: unknown) => void;
    start: (when: number) => void;
    stop: (when: number) => void;
  };
  createGain: () => {
    gain: {
      setValueAtTime: (value: number, when: number) => void;
      exponentialRampToValueAtTime: (value: number, when: number) => void;
    };
    connect: (target: unknown) => void;
  };
};

type AudioContextConstructor = new () => MinimalAudioContext;

/** `[frequencyHz, startOffsetSeconds, durationSeconds, peakGain]` */
const TONES: Record<KioskSoundKind, Array<[number, number, number, number]>> = {
  ok: [
    [880, 0, 0.16, 0.16],
    [1318.5, 0.11, 0.3, 0.18]
  ],
  error: [
    [220, 0, 0.22, 0.18],
    [185, 0.09, 0.28, 0.16]
  ]
};

function resolveAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const candidate = (window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  });

  return candidate.AudioContext ?? candidate.webkitAudioContext ?? null;
}

/**
 * Holds one AudioContext for the life of the kiosk session. A fresh context
 * per booking would leak hardware handles on a device that never reloads.
 */
export class KioskSoundPlayer {
  private context: MinimalAudioContext | null = null;

  constructor(private readonly enabled: () => boolean) {}

  play(kind: KioskSoundKind) {
    if (!this.enabled()) {
      return false;
    }

    const Ctor = resolveAudioContextConstructor();
    if (!Ctor) {
      return false;
    }

    try {
      this.context = this.context ?? new Ctor();
      const context = this.context;
      if (context.state === "suspended") {
        context.resume();
      }

      const now = context.currentTime;
      for (const [frequency, startOffset, duration, peak] of TONES[kind]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        // Exponential ramps cannot touch zero, so the envelope opens and closes
        // on a near-silent floor instead — this is what removes the click.
        gain.gain.setValueAtTime(0.0001, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(peak, now + startOffset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + startOffset);
        oscillator.stop(now + startOffset + duration + 0.05);
      }

      return true;
    } catch {
      // A kiosk that cannot make noise still has to be able to take a booking.
      return false;
    }
  }

  dispose() {
    try {
      this.context?.close();
    } catch {
      // Closing a context that never opened is not an error worth surfacing.
    }
    this.context = null;
  }
}

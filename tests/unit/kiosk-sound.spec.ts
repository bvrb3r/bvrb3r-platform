import { afterEach, describe, expect, it, vi } from "vitest";

import { KioskSoundPlayer } from "@/lib/kiosk/sound";

type Started = { frequency: number; start: number; stop: number };

function installAudioContext(overrides: { throwOnConstruct?: boolean; state?: string } = {}) {
  const started: Started[] = [];
  const resume = vi.fn();
  const close = vi.fn();
  let constructed = 0;

  class FakeAudioContext {
    currentTime = 0;
    state = overrides.state ?? "running";
    destination = {};

    constructor() {
      constructed += 1;
      if (overrides.throwOnConstruct) {
        throw new Error("audio unavailable");
      }
    }

    resume = resume;
    close = close;

    createOscillator() {
      const record: Started = { frequency: 0, start: -1, stop: -1 };
      return {
        type: "",
        frequency: {
          get value() {
            return record.frequency;
          },
          set value(next: number) {
            record.frequency = next;
          }
        },
        connect: () => {},
        start: (when: number) => {
          record.start = when;
          started.push(record);
        },
        stop: (when: number) => {
          record.stop = when;
        }
      };
    }

    createGain() {
      return {
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: () => {}
      };
    }
  }

  Object.defineProperty(window, "AudioContext", { configurable: true, writable: true, value: FakeAudioContext });
  return { started, resume, close, constructedCount: () => constructed };
}

describe("kiosk confirmation sounds", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "AudioContext");
    Reflect.deleteProperty(window, "webkitAudioContext");
  });

  it("plays the two-note rising chime on a confirmed booking", () => {
    const audio = installAudioContext();
    const player = new KioskSoundPlayer(() => true);

    expect(player.play("ok")).toBe(true);
    expect(audio.started.map((tone) => tone.frequency)).toEqual([880, 1318.5]);
    // Second note lands after the first, so it reads as a rise, not a chord.
    expect(audio.started[1].start).toBeGreaterThan(audio.started[0].start);
  });

  it("plays the low double buzz when a booking fails", () => {
    const audio = installAudioContext();
    const player = new KioskSoundPlayer(() => true);

    expect(player.play("error")).toBe(true);
    expect(audio.started.map((tone) => tone.frequency)).toEqual([220, 185]);
  });

  it("stays silent when the kiosk has sound switched off", () => {
    const audio = installAudioContext();
    const player = new KioskSoundPlayer(() => false);

    expect(player.play("ok")).toBe(false);
    expect(audio.started).toHaveLength(0);
    expect(audio.constructedCount()).toBe(0);
  });

  it("reuses one AudioContext across a kiosk session", () => {
    const audio = installAudioContext();
    const player = new KioskSoundPlayer(() => true);

    player.play("ok");
    player.play("error");
    player.play("ok");

    expect(audio.constructedCount()).toBe(1);
  });

  it("resumes a context the browser suspended before the first gesture", () => {
    const audio = installAudioContext({ state: "suspended" });
    const player = new KioskSoundPlayer(() => true);

    player.play("ok");
    expect(audio.resume).toHaveBeenCalled();
  });

  it("degrades to silence instead of breaking a booking when audio is unavailable", () => {
    const audio = installAudioContext({ throwOnConstruct: true });
    const player = new KioskSoundPlayer(() => true);

    expect(() => player.play("ok")).not.toThrow();
    expect(player.play("ok")).toBe(false);
    expect(audio.started).toHaveLength(0);
  });

  it("reports silence when the platform has no Web Audio at all", () => {
    const player = new KioskSoundPlayer(() => true);
    expect(player.play("ok")).toBe(false);
  });

  it("closes its context on dispose without throwing", () => {
    const audio = installAudioContext();
    const player = new KioskSoundPlayer(() => true);

    player.play("ok");
    player.dispose();

    expect(audio.close).toHaveBeenCalledTimes(1);
    expect(() => player.dispose()).not.toThrow();
  });
});

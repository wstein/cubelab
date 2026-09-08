export type SmartCubeAudioCue = "turn" | "correct" | "deviation" | "realigned" | "milestone" | "recenter";

export const SMART_CUBE_SOUND_PREFERENCE = "cube-rosetta:smart-cube-sound";

export const readSmartCubeSoundPreference = (storage: Pick<Storage, "getItem"> | null): boolean =>
  storage?.getItem(SMART_CUBE_SOUND_PREFERENCE) !== "off";

export const writeSmartCubeSoundPreference = (
  storage: Pick<Storage, "setItem"> | null,
  enabled: boolean,
): void => {
  try {
    storage?.setItem(SMART_CUBE_SOUND_PREFERENCE, enabled ? "on" : "off");
  } catch {
    // Private browsing and embedded contexts may deny storage; sound still works for this session.
  }
};

type AudioContextConstructor = new () => AudioContext;

export type SmartCubeAudioFeedback = {
  isEnabled: () => boolean;
  setEnabled: (enabled: boolean) => void;
  unlock: () => Promise<void>;
  play: (cue: SmartCubeAudioCue) => void;
  dispose: () => void;
};

export const createSmartCubeAudioFeedback = (
  initialEnabled: boolean,
): SmartCubeAudioFeedback => {
  let enabled = initialEnabled;
  let context: AudioContext | null = null;

  const audioConstructor = (): AudioContextConstructor | null => {
    if (typeof window === "undefined") return null;
    const host = window as typeof window & {webkitAudioContext?: AudioContextConstructor};
    return window.AudioContext ?? host.webkitAudioContext ?? null;
  };

  const ensureContext = (): AudioContext | null => {
    if (context) return context;
    const Constructor = audioConstructor();
    if (!Constructor) return null;
    context = new Constructor();
    return context;
  };

  const voice = (
    frequency: number,
    start: number,
    duration: number,
    wave: OscillatorType,
    volume: number,
    endFrequency = frequency,
  ) => {
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.008, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  };

  const play = (cue: SmartCubeAudioCue) => {
    if (!enabled) return;
    const active = ensureContext();
    if (!active || active.state !== "running") return;
    const now = active.currentTime + 0.004;
    if (cue === "turn") {
      // Neutral tactile click for every physical or virtual cube turn.
      voice(740, now, 0.025, "sine", 0.032, 810);
    } else if (cue === "correct") {
      voice(880, now, 0.04, "sine", 0.055, 1200);
    } else if (cue === "deviation") {
      voice(240, now, 0.15, "triangle", 0.045, 180);
      voice(180, now + 0.025, 0.14, "triangle", 0.035, 150);
    } else if (cue === "realigned") {
      voice(523.25, now, 0.08, "sine", 0.045, 659.25);
      voice(659.25, now + 0.07, 0.1, "sine", 0.04, 783.99);
    } else if (cue === "recenter") {
      // Subtle haptic snap: two crisp micro-blips evoking precision lens snap
      voice(987.77, now, 0.022, "sine", 0.035, 1050);
      voice(1318.51, now + 0.024, 0.028, "sine", 0.04, 1400);
    } else {
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        voice(frequency, now + index * 0.075, 0.18, "sine", 0.04, frequency * 1.01);
      });
    }
  };

  return {
    isEnabled: () => enabled,
    setEnabled(next) {
      enabled = next;
      if (!enabled && context?.state === "running") void context.suspend();
    },
    async unlock() {
      if (!enabled) return;
      const active = ensureContext();
      if (active?.state === "suspended") await active.resume();
    },
    play,
    dispose() {
      const active = context;
      context = null;
      if (active && active.state !== "closed") void active.close();
    },
  };
};

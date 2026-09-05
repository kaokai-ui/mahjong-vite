import chiVoiceUrl from "../retropie/assets/voices/chi.wav";
import zimoVoiceUrl from "../retropie/assets/voices/zimo.wav";
import gangVoiceUrl from "../retropie/assets/voices/gang.wav";
import huVoiceUrl from "../retropie/assets/voices/hu.wav";
import pungVoiceUrl from "../retropie/assets/voices/pung.wav";

export type VoiceActionKind = "chi" | "pung" | "kong" | "hu" | "zimo";

const VOICE_SOURCES: Record<VoiceActionKind, string> = {
  chi: chiVoiceUrl,
  pung: pungVoiceUrl,
  kong: gangVoiceUrl,
  hu: huVoiceUrl,
  zimo: zimoVoiceUrl,
};

// Voices are announced from a state change rather than from a click handler, so
// iOS Safari would block a plain <audio> element forever: it only unblocks an
// element that already played inside a user gesture. An AudioContext opened and
// resumed on the first interaction keeps working for every later cue.
const UNLOCK_EVENTS = ["pointerdown", "touchend", "keydown"] as const;

let audioContext: AudioContext | null = null;
let unlockListenersAttached = false;
const clipBuffers = new Map<VoiceActionKind, AudioBuffer>();
const clipLoads = new Map<VoiceActionKind, Promise<AudioBuffer | null>>();

function getAudioContext(): AudioContext | null {
  if (audioContext) {
    return audioContext;
  }
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  audioContext = new AudioContextCtor();
  return audioContext;
}

function loadClip(kind: VoiceActionKind): Promise<AudioBuffer | null> {
  const pending = clipLoads.get(kind);
  if (pending) {
    return pending;
  }

  const context = getAudioContext();
  if (!context) {
    return Promise.resolve(null);
  }

  const load = (async () => {
    try {
      const response = await fetch(VOICE_SOURCES[kind]);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      clipBuffers.set(kind, buffer);
      return buffer;
    } catch {
      clipLoads.delete(kind);
      return null;
    }
  })();

  clipLoads.set(kind, load);
  return load;
}

function startClip(context: AudioContext, buffer: AudioBuffer): void {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
}

export function playVoice(kind: VoiceActionKind): void {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    void context.resume();
  }

  const buffer = clipBuffers.get(kind);
  if (buffer) {
    startClip(context, buffer);
    return;
  }

  void loadClip(kind).then((loaded) => {
    if (loaded) {
      startClip(context, loaded);
    }
  });
}

export function primeVoicePlayback(): void {
  if (unlockListenersAttached || typeof document === "undefined") {
    return;
  }
  unlockListenersAttached = true;

  const unlock = () => {
    for (const eventName of UNLOCK_EVENTS) {
      document.removeEventListener(eventName, unlock);
    }

    const context = getAudioContext();
    if (!context) {
      return;
    }
    void context.resume();
    for (const kind of Object.keys(VOICE_SOURCES) as VoiceActionKind[]) {
      void loadClip(kind);
    }
  };

  for (const eventName of UNLOCK_EVENTS) {
    document.addEventListener(eventName, unlock);
  }
}

export function meldTypeToVoiceKind(meldType: string | null | undefined): VoiceActionKind | null {
  if (meldType === "chow") {
    return "chi";
  }
  if (meldType === "pung") {
    return "pung";
  }
  if (meldType === "kong") {
    return "kong";
  }
  return null;
}

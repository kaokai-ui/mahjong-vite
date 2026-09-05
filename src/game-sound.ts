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

const audioCache = new Map<VoiceActionKind, HTMLAudioElement>();

function getVoiceAudio(kind: VoiceActionKind): HTMLAudioElement | null {
  if (typeof Audio === "undefined") {
    return null;
  }

  let audio = audioCache.get(kind);
  if (!audio) {
    audio = new Audio(VOICE_SOURCES[kind]);
    audio.preload = "auto";
    audioCache.set(kind, audio);
  }
  return audio;
}

export function playVoice(kind: VoiceActionKind): void {
  const audio = getVoiceAudio(kind);
  if (!audio) {
    return;
  }

  try {
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Playback can be rejected before the first user gesture; ignore.
    });
  } catch {
    // Some browsers throw synchronously instead of rejecting; ignore either way.
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

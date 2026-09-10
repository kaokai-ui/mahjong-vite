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

const TILE_NUMBER_NAMES = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const TILE_HONOR_NAMES: Record<string, string> = {
  E: "東風",
  S: "南風",
  W: "西風",
  N: "北風",
  R: "紅中",
  G: "發財",
  B: "白板",
};

// Tile names use bundled WAV files so iOS can play automatic Firebase/React
// discard events through the same unlocked AudioContext as the action cues.
// `new URL` keeps the files hashed and cacheable in the Vite production build.
const TILE_VOICE_SOURCES: Record<string, string> = {
  m1: new URL("../retropie/assets/voices/tiles/m1.wav", import.meta.url).href,
  m2: new URL("../retropie/assets/voices/tiles/m2.wav", import.meta.url).href,
  m3: new URL("../retropie/assets/voices/tiles/m3.wav", import.meta.url).href,
  m4: new URL("../retropie/assets/voices/tiles/m4.wav", import.meta.url).href,
  m5: new URL("../retropie/assets/voices/tiles/m5.wav", import.meta.url).href,
  m6: new URL("../retropie/assets/voices/tiles/m6.wav", import.meta.url).href,
  m7: new URL("../retropie/assets/voices/tiles/m7.wav", import.meta.url).href,
  m8: new URL("../retropie/assets/voices/tiles/m8.wav", import.meta.url).href,
  m9: new URL("../retropie/assets/voices/tiles/m9.wav", import.meta.url).href,
  p1: new URL("../retropie/assets/voices/tiles/p1.wav", import.meta.url).href,
  p2: new URL("../retropie/assets/voices/tiles/p2.wav", import.meta.url).href,
  p3: new URL("../retropie/assets/voices/tiles/p3.wav", import.meta.url).href,
  p4: new URL("../retropie/assets/voices/tiles/p4.wav", import.meta.url).href,
  p5: new URL("../retropie/assets/voices/tiles/p5.wav", import.meta.url).href,
  p6: new URL("../retropie/assets/voices/tiles/p6.wav", import.meta.url).href,
  p7: new URL("../retropie/assets/voices/tiles/p7.wav", import.meta.url).href,
  p8: new URL("../retropie/assets/voices/tiles/p8.wav", import.meta.url).href,
  p9: new URL("../retropie/assets/voices/tiles/p9.wav", import.meta.url).href,
  s1: new URL("../retropie/assets/voices/tiles/s1.wav", import.meta.url).href,
  s2: new URL("../retropie/assets/voices/tiles/s2.wav", import.meta.url).href,
  s3: new URL("../retropie/assets/voices/tiles/s3.wav", import.meta.url).href,
  s4: new URL("../retropie/assets/voices/tiles/s4.wav", import.meta.url).href,
  s5: new URL("../retropie/assets/voices/tiles/s5.wav", import.meta.url).href,
  s6: new URL("../retropie/assets/voices/tiles/s6.wav", import.meta.url).href,
  s7: new URL("../retropie/assets/voices/tiles/s7.wav", import.meta.url).href,
  s8: new URL("../retropie/assets/voices/tiles/s8.wav", import.meta.url).href,
  s9: new URL("../retropie/assets/voices/tiles/s9.wav", import.meta.url).href,
  E: new URL("../retropie/assets/voices/tiles/E.wav", import.meta.url).href,
  S: new URL("../retropie/assets/voices/tiles/S.wav", import.meta.url).href,
  W: new URL("../retropie/assets/voices/tiles/W.wav", import.meta.url).href,
  N: new URL("../retropie/assets/voices/tiles/N.wav", import.meta.url).href,
  R: new URL("../retropie/assets/voices/tiles/R.wav", import.meta.url).href,
  G: new URL("../retropie/assets/voices/tiles/G.wav", import.meta.url).href,
  B: new URL("../retropie/assets/voices/tiles/B.wav", import.meta.url).href,
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
const tileClipBuffers = new Map<string, AudioBuffer>();
const tileClipLoads = new Map<string, Promise<AudioBuffer | null>>();
let speechVoices: SpeechSynthesisVoice[] = [];
let speechVoicesListenerAttached = false;

function tileTypeToSpeechText(tileType: string): string {
  const normalized = String(tileType || "");
  const suit = normalized[0];
  const rank = Number(normalized[1]);
  if ((suit === "m" || suit === "p" || suit === "s") && rank >= 1 && rank <= 9) {
    const suitName = suit === "m" ? "萬" : suit === "p" ? "筒" : "條";
    return `${TILE_NUMBER_NAMES[rank]}${suitName}`;
  }
  return TILE_HONOR_NAMES[normalized] || "";
}

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  const synthesis = window.speechSynthesis;
  if (!speechVoicesListenerAttached) {
    speechVoicesListenerAttached = true;
    synthesis.addEventListener("voiceschanged", () => {
      speechVoices = synthesis.getVoices();
    });
  }
  if (!speechVoices.length) {
    speechVoices = synthesis.getVoices();
  }
  return synthesis;
}

function selectChineseSpeechVoice(): SpeechSynthesisVoice | null {
  return speechVoices.find((voice) => /^zh-TW/i.test(voice.lang))
    || speechVoices.find((voice) => /^zh/i.test(voice.lang))
    || null;
}

function primeSpeechSynthesis(): void {
  const synthesis = getSpeechSynthesis();
  if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") {
    return;
  }

  try {
    // iOS Safari requires the first speech request to happen synchronously in
    // a user gesture before later Firebase/React callbacks can speak.
    const utterance = new SpeechSynthesisUtterance("");
    utterance.lang = "zh-TW";
    utterance.volume = 0;
    synthesis.speak(utterance);
  } catch {
    // Speech synthesis is optional; missing Siri/voice support must not affect play.
  }
}

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

function loadTileClip(tileType: string): Promise<AudioBuffer | null> {
  const normalized = String(tileType || "");
  const source = TILE_VOICE_SOURCES[normalized];
  if (!source) {
    return Promise.resolve(null);
  }

  const pending = tileClipLoads.get(normalized);
  if (pending) {
    return pending;
  }

  const context = getAudioContext();
  if (!context) {
    return Promise.resolve(null);
  }

  const load = (async () => {
    try {
      const response = await fetch(source);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      tileClipBuffers.set(normalized, buffer);
      return buffer;
    } catch {
      tileClipLoads.delete(normalized);
      return null;
    }
  })();

  tileClipLoads.set(normalized, load);
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

    primeSpeechSynthesis();
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

export function preloadTileVoiceClips(): void {
  for (const tileType of Object.keys(TILE_VOICE_SOURCES)) {
    void loadTileClip(tileType);
  }
}

function speakTileWithBrowser(text: string): void {
  const synthesis = getSpeechSynthesis();
  if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") {
    return;
  }

  synthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-TW";
  utterance.rate = 1.08;
  utterance.pitch = 1;
  utterance.volume = 1;
  const voice = selectChineseSpeechVoice();
  if (voice) {
    utterance.voice = voice;
  }
  synthesis.speak(utterance);
}

/**
 * Announces a discarded tile with a bundled WAV through the already-unlocked
 * AudioContext. This works for Firebase/React state callbacks on iOS because it
 * does not need a new user gesture. Browser speech remains a graceful fallback
 * when an AudioContext or tile asset is unavailable.
 */
export function speakTile(tileType: string): void {
  const normalized = String(tileType || "");
  const text = tileTypeToSpeechText(normalized);
  if (!text) {
    return;
  }

  const context = getAudioContext();
  if (!context || !TILE_VOICE_SOURCES[normalized]) {
    speakTileWithBrowser(text);
    return;
  }

  if (context.state === "suspended") {
    void context.resume();
  }

  const buffer = tileClipBuffers.get(normalized);
  if (buffer) {
    startClip(context, buffer);
    return;
  }

  void loadTileClip(normalized).then((loaded) => {
    if (loaded) {
      startClip(context, loaded);
      return;
    }

    speakTileWithBrowser(text);
  });
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

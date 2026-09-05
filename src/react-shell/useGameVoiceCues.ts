import { useEffect, useRef } from "react";
import { meldTypeToVoiceKind, playVoice, primeVoicePlayback } from "../game-sound";
import type { LobbyBridgeSnapshot } from "./useAppBridge";

type TableStageSnapshot = LobbyBridgeSnapshot["gamePanel"]["tableStage"];

type VoiceCueTrackerState = {
  meldTypesById: Map<number, string>;
  resultSignaled: boolean;
};

function createTrackerState(): VoiceCueTrackerState {
  return { meldTypesById: new Map(), resultSignaled: false };
}

// Announces chi/pung/kong/zimo/hu by diffing meld state and the win result
// against what was already seen this round, so it fires once per real event
// for every seat, in both solo (vs. bots) and online multiplayer tables.
export function useGameVoiceCues(tableStage: TableStageSnapshot): void {
  const trackerRef = useRef<VoiceCueTrackerState>(createTrackerState());

  useEffect(() => {
    primeVoicePlayback();
  }, []);

  useEffect(() => {
    if (!tableStage.visible) {
      trackerRef.current = createTrackerState();
      return;
    }

    const tracker = trackerRef.current;
    const allMelds = [
      ...tableStage.opponentSection.melds,
      ...tableStage.leftSection.melds,
      ...tableStage.rightSection.melds,
      ...tableStage.selfSection.melds,
    ];

    for (const meld of allMelds) {
      const previousType = tracker.meldTypesById.get(meld.id);
      if (previousType === meld.type) {
        continue;
      }
      tracker.meldTypesById.set(meld.id, meld.type);

      if (previousType === undefined) {
        const voiceKind = meldTypeToVoiceKind(meld.type);
        if (voiceKind) {
          playVoice(voiceKind);
        }
      } else if (meld.type === "kong") {
        // An existing pung was promoted to a kong (added kong).
        playVoice("kong");
      }
    }

    if (tableStage.resultOverlay.visible && !tracker.resultSignaled) {
      tracker.resultSignaled = true;
      const winKind = tableStage.resultOverlay.winKind;
      if (winKind === "selfDraw") {
        playVoice("zimo");
      } else if (winKind === "discardWin" || winKind === "robKong") {
        playVoice("hu");
      }
    } else if (!tableStage.resultOverlay.visible) {
      tracker.resultSignaled = false;
    }
  });
}

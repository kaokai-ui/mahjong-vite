import { useEffect, useRef } from "react";
import { meldTypeToVoiceKind, playVoice, preloadTileVoiceClips, primeVoicePlayback, speakTile } from "../game-sound";
import type { LobbyBridgeSnapshot } from "./useAppBridge";

type TableStageSnapshot = LobbyBridgeSnapshot["gamePanel"]["tableStage"];

type VoiceCueTrackerState = {
  meldTypesById: Map<number, string>;
  discardIdsByRow: Map<number, Set<string>>;
  roundNumber: number | null;
  resultSignaled: boolean;
};

function createTrackerState(): VoiceCueTrackerState {
  return { meldTypesById: new Map(), discardIdsByRow: new Map(), roundNumber: null, resultSignaled: false };
}

// Announces chi/pung/kong/zimo/hu by diffing meld state and the win result
// against what was already seen this round, so it fires once per real event
// for every seat, in both solo (vs. bots) and online multiplayer tables.
export function useGameVoiceCues(tableStage: TableStageSnapshot, voiceEnabled: boolean): void {
  const trackerRef = useRef<VoiceCueTrackerState>(createTrackerState());

  useEffect(() => {
    if (voiceEnabled) {
      primeVoicePlayback();
    }
    if (voiceEnabled && tableStage.visible) {
      preloadTileVoiceClips();
    }
  }, [voiceEnabled, tableStage.visible]);

  useEffect(() => {
    if (!tableStage.visible) {
      trackerRef.current = createTrackerState();
      return;
    }

    const tracker = trackerRef.current;
    const roundChanged = tracker.roundNumber !== tableStage.roundNumber;
    if (roundChanged) {
      tracker.roundNumber = tableStage.roundNumber;
      tracker.meldTypesById.clear();
      tracker.discardIdsByRow.clear();
      tracker.resultSignaled = false;
    }

    const newDiscards: Array<{ tileId: string; tileType: string }> = [];
    tableStage.discardRows.forEach((row, rowIndex) => {
      const seenIds = tracker.discardIdsByRow.get(rowIndex) || new Set<string>();
      for (const discard of row.tiles) {
        if (!seenIds.has(discard.tile.tileId)) {
          if (!roundChanged) {
            newDiscards.push({ tileId: discard.tile.tileId, tileType: discard.tile.tileType });
          }
          seenIds.add(discard.tile.tileId);
        }
      }
      tracker.discardIdsByRow.set(rowIndex, seenIds);
    });

    if (voiceEnabled && newDiscards.length) {
      const latestTileId = tableStage.latestDiscard?.tileId || "";
      const latestDiscard = newDiscards.find((discard) => discard.tileId === latestTileId) || newDiscards[0];
      speakTile(latestDiscard.tileType);
    }

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
        if (voiceEnabled && voiceKind) {
          playVoice(voiceKind);
        }
      } else if (voiceEnabled && meld.type === "kong") {
        // An existing pung was promoted to a kong (added kong).
        playVoice("kong");
      }
    }

    if (voiceEnabled && tableStage.resultOverlay.visible && !tracker.resultSignaled) {
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

import { DEFAULT_RULESET, getRuleset } from "./rules.js";
import { DEFAULT_SOLO_DIFFICULTY, SOLO_DIFFICULTY_LABELS } from "./solo-controller.js";
import {
  describeGamePhase,
  formatSeat,
  getSeatLabelText,
  getSeatScoreSummary,
  isScoringEnabled,
  isSoloRoom,
} from "./bridge-view-helpers";
import type { LobbyBridgeSnapshot } from "./react-shell/useAppBridge";

type RoomPanelSnapshot = LobbyBridgeSnapshot["roomPanel"];

type PlayerLike = {
  id: string;
  name?: string;
  seat: number;
  type?: string;
};

type GameLike = {
  status?: string;
  roundNumber?: number | null;
  rulesetId?: string;
  dealerSeat?: number | null;
  turnSeat?: number | null;
  wall?: unknown[];
  scoringEnabled?: boolean;
};

type RoomLike = {
  roomId?: string;
  rulesetId?: string;
  hostPlayerId?: string;
  meta?: {
    soloDifficulty?: string;
    gameMode?: string;
  } | null;
  gameMode?: string;
  game?: GameLike | null;
};

type BuildRoomPanelSnapshotContext = {
  room: RoomLike | null;
  isSoloSetup: boolean;
  roomPanelRulesetId: string;
  isHost: boolean;
  players: PlayerLike[];
  currentPlayer: PlayerLike | null;
};

export function buildRoomPanelSnapshot(context: BuildRoomPanelSnapshotContext): RoomPanelSnapshot {
  const { room, isSoloSetup, roomPanelRulesetId, isHost, players, currentPlayer } = context;

  if (!room) {
    return {
      hasRoom: false,
      title: isSoloSetup ? "單人設定" : "房間資訊",
      description: isSoloSetup
        ? "選好規則、難度與台數計算後，即可開始單人對電腦。"
        : "建立房間或加入房間後，這裡會顯示目前對局資訊。",
      emptyStateText: isSoloSetup
        ? "開始單人遊戲後，這裡會顯示目前對局狀態。"
        : "建立或加入房間後，這裡會顯示目前房間狀態。",
      canCopyLink: false,
      canEditRuleset: false,
      roomRulesetId: getRuleset(roomPanelRulesetId || DEFAULT_RULESET).id,
      startLabel: "開始對局",
      startDisabled: true,
      phaseCopy: "",
      seats: [],
      pills: [],
    };
  }

  const game = room.game || null;
  const isSoloMode = isSoloRoom(room);
  const canStart = players.length === 2 && (!game || game.status !== "playing");
  const currentRuleset = getRuleset(room.rulesetId || game?.rulesetId || DEFAULT_RULESET);
  const selectedRoomRulesetId = getRuleset(roomPanelRulesetId || currentRuleset.id).id;
  const displayRuleset = !game || game.status !== "playing" ? getRuleset(selectedRoomRulesetId) : currentRuleset;
  const startLabel = game && game.status === "finished" ? "重新開始" : "開始對局";
  const currentPlayerId = currentPlayer ? currentPlayer.id : "";
  const currentPlayerSeat = currentPlayer ? currentPlayer.seat : 0;
  const scoringStatus = isScoringEnabled(game) ? "開啟" : "關閉";
  const soloDifficultyKey = (room.meta?.soloDifficulty || DEFAULT_SOLO_DIFFICULTY) as keyof typeof SOLO_DIFFICULTY_LABELS;
  const seats: RoomPanelSnapshot["seats"] = [0, 1].map((seat) => {
    const player = players.find((item) => item && item.seat === seat);
    if (!player) {
      return {
        seat,
        empty: true,
        title: "空位",
        subtitle: "等待玩家加入",
        badges: [],
        scoreBadge: "",
      };
    }

    return {
      seat,
      empty: false,
      title: player.name || formatSeat(player.seat),
      subtitle: formatSeat(player.seat),
      badges: [
        player.id === room.hostPlayerId ? "房主" : "",
        player.id === currentPlayerId ? "你" : "",
        player.type === "bot" ? "電腦" : "",
      ].filter(isNonEmptyString),
      scoreBadge: getSeatScoreSummary(game, player.seat),
    };
  });

  return {
    hasRoom: true,
    title: isSoloMode ? "單人對局" : `房間 ${room.roomId}`,
    description: displayRuleset.description,
    emptyStateText: "",
    canCopyLink: !isSoloMode,
    canEditRuleset: !isSoloMode && isHost,
    roomRulesetId: selectedRoomRulesetId,
    startLabel,
    startDisabled: !canStart,
    phaseCopy: describeGamePhase(game, currentPlayerSeat, room),
    seats,
    pills: [
      isSoloMode ? "模式：單人對電腦" : "",
      isSoloMode
        ? `難度：${
            SOLO_DIFFICULTY_LABELS[soloDifficultyKey] ||
            SOLO_DIFFICULTY_LABELS[DEFAULT_SOLO_DIFFICULTY]
          }`
        : "",
      `規則：${displayRuleset.name}`,
      `台數計算：${scoringStatus}`,
      isScoringEnabled(game) ? "統計：胡牌數（分數）" : "",
      `第 ${game && game.roundNumber != null ? game.roundNumber : 0} 局`,
      `牌牆：${game && game.wall ? game.wall.length : 0}`,
      `莊家：${getSeatLabelText(game, game ? game.dealerSeat : null)}`,
      `輪到：${getSeatLabelText(game, game ? game.turnSeat : null)}`,
    ].filter(isNonEmptyString),
  };
}

function isNonEmptyString(value: string): value is string {
  return Boolean(value);
}

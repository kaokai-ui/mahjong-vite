const SOLO_GAME_MODE = "solo-bot";

export type BridgePlayerLike = {
  id: string;
  name?: string;
  seat: number;
  type?: string;
};

type RoomMetaLike = {
  gameMode?: string;
  botThinking?: boolean;
  godViewEnabled?: boolean;
  [key: string]: unknown;
} | null;

export type BridgeRoomLike = {
  activePlayers?: BridgePlayerLike[];
  players?: Record<string, BridgePlayerLike | undefined>;
  meta?: RoomMetaLike;
  gameMode?: string;
} | null | undefined;

export type BridgeGameLike = {
  status?: string;
  turnSeat?: number | null;
  dealerSeat?: number | null;
  phase?: string;
  pendingClaim?: {
    toSeat?: number | null;
  } | null;
  result?: {
    message?: string;
  } | null;
  wins?: Array<number | string | null | undefined>;
  winCounts?: Array<number | string | null | undefined>;
  scores?: Array<number | string | null | undefined>;
  scoringEnabled?: boolean;
} | null | undefined;

export type BridgeClientStateLike = {
  canSelfDraw?: boolean;
  canDraw?: boolean;
  canDiscard?: boolean;
  concealedKongs?: unknown[] | null;
  addedKongs?: unknown[] | null;
  claimOptions?: unknown[] | null;
} | null | undefined;

const TILE_NUMBER_LABELS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const HONOR_TILE_NAMES: Record<string, string> = {
  E: "東風",
  S: "南風",
  W: "西風",
  N: "北風",
  R: "紅中",
  G: "發財",
  B: "白板",
};

export function getPlayers(room: BridgeRoomLike): BridgePlayerLike[] {
  if (!room) {
    return [];
  }

  if (Array.isArray(room.activePlayers) && room.activePlayers.length) {
    return room.activePlayers;
  }

  return Object.values(room.players || {}).filter(isPlayerLike).sort((left, right) => (left.seat ?? 0) - (right.seat ?? 0));
}

export function getPlayerById(room: BridgeRoomLike, playerId: string | null | undefined): BridgePlayerLike | null {
  if (!playerId) {
    return null;
  }

  return getPlayers(room).find((player) => player.id === playerId) || null;
}

export function isSoloRoom(room: BridgeRoomLike): boolean {
  return Boolean(room && ((room.meta && room.meta.gameMode === SOLO_GAME_MODE) || room.gameMode === SOLO_GAME_MODE));
}

export function formatSeat(seat: number | null | undefined): string {
  return typeof seat === "number" ? `P${seat + 1}` : "-";
}

export function getPlayerDisplayName(players: BridgePlayerLike[] | null | undefined, seat: number | null | undefined): string {
  if (typeof seat !== "number") {
    return "-";
  }

  const player = (players || []).find((item) => item && item.seat === seat);
  if (!player) {
    return formatSeat(seat);
  }

  return player.name || player.id || formatSeat(seat);
}

export function isScoringEnabled(game: BridgeGameLike): boolean {
  return Boolean(game && game.scoringEnabled);
}

export function getSeatWinCount(game: BridgeGameLike, seat: number | null | undefined): number {
  if (!game || typeof seat !== "number") {
    return 0;
  }

  const winsSource = Array.isArray(game.wins) ? game.wins : Array.isArray(game.winCounts) ? game.winCounts : [];
  const wins = Number(winsSource[seat]);
  return Number.isFinite(wins) && wins > 0 ? Math.floor(wins) : 0;
}

export function getSeatPointScore(game: BridgeGameLike, seat: number | null | undefined): number {
  if (!game || !Array.isArray(game.scores) || typeof seat !== "number") {
    return 0;
  }

  const score = Number(game.scores[seat]);
  return Number.isFinite(score) ? Math.round(score) : 0;
}

export function formatPointScore(score: number | string | null | undefined): string {
  return `${Math.round(Number(score) || 0)}`;
}

export function getSeatScoreSummary(game: BridgeGameLike, seat: number | null | undefined): string {
  if (typeof seat !== "number") {
    return "";
  }

  const wins = getSeatWinCount(game, seat);
  const scoringEnabled = isScoringEnabled(game);
  if (!scoringEnabled && wins <= 0) {
    return "";
  }

  const score = getSeatPointScore(game, seat);
  const pointText = scoringEnabled ? ` (${formatPointScore(score)})` : "";
  return `+${wins}${pointText}`;
}

export function getSeatLabelText(game: BridgeGameLike, seat: number | null | undefined): string {
  if (typeof seat !== "number") {
    return "-";
  }

  const scoreSummary = getSeatScoreSummary(game, seat);
  return scoreSummary ? `${formatSeat(seat)} ${scoreSummary}` : formatSeat(seat);
}

export function getTurnBadge(game: BridgeGameLike, playerSeat: number | null | undefined): string {
  if (!game || game.status !== "playing") {
    return "輪到：-";
  }

  return game.turnSeat === playerSeat ? "輪到：你" : `輪到：${getSeatLabelText(game, game.turnSeat)}`;
}

export function hasSelectableActions(clientState: BridgeClientStateLike): boolean {
  if (!clientState) {
    return false;
  }

  return Boolean(
    clientState.canSelfDraw ||
      (Array.isArray(clientState.concealedKongs) && clientState.concealedKongs.length) ||
      (Array.isArray(clientState.addedKongs) && clientState.addedKongs.length) ||
      (Array.isArray(clientState.claimOptions) && clientState.claimOptions.length),
  );
}

export function getSelfStatusText(
  clientState: BridgeClientStateLike,
  game: BridgeGameLike,
  playerSeat: number | null | undefined,
  room: BridgeRoomLike = null,
): string {
  if (clientState?.canDiscard) {
    return "輪到你打牌";
  }
  if (clientState?.canDraw) {
    return "輪到你摸牌";
  }
  if (hasSelectableActions(clientState)) {
    return "請點選可用操作";
  }
  if (isSoloRoom(room) && room?.meta?.botThinking) {
    return "等待電腦思考";
  }
  if (game && game.status === "playing") {
    return game.turnSeat === playerSeat ? "輪到你操作" : "等待對手";
  }
  return "等待中";
}

export function getIdleActionText(clientState: BridgeClientStateLike): string {
  if (clientState?.canDraw) {
    return "請先摸牌";
  }
  if (clientState?.canDiscard) {
    return "請點一張牌打出";
  }
  return "等待對手操作";
}

export function getMeldLabel(type: string | null | undefined): string {
  if (type === "chow") {
    return "吃";
  }
  if (type === "pung") {
    return "碰";
  }
  if (type === "kong") {
    return "槓";
  }
  return type || "";
}

export function describeGamePhase(game: BridgeGameLike, playerSeat: number | null | undefined, room: BridgeRoomLike = null): string {
  if (!game) {
    return isSoloRoom(room) ? "按下開始單人遊戲後即可直接對局。" : "房間已建立，等待開始對局。";
  }

  if (game.status === "waiting") {
    return isSoloRoom(room) ? "單人模式準備中。" : "兩位玩家都進房後，按下開始對局。";
  }

  if (game.status === "finished") {
    return game.result && game.result.message ? game.result.message : "本局已結束，可以重新開局。";
  }

  if (isSoloRoom(room) && room?.meta?.botThinking) {
    return "電腦思考中...";
  }

  if (game.phase === "draw") {
    return game.turnSeat === playerSeat ? "輪到你摸牌。" : isSoloRoom(room) ? "等待電腦摸牌。" : "等待對手摸牌。";
  }

  if (game.phase === "discard") {
    return game.turnSeat === playerSeat
      ? "輪到你出牌，請點一張手牌。"
      : isSoloRoom(room)
        ? "等待電腦出牌。"
        : "等待對手出牌。";
  }

  if (game.phase === "response") {
    return game.pendingClaim && game.pendingClaim.toSeat === playerSeat
      ? "你可以對這張牌進行吃、碰、槓或胡。"
      : isSoloRoom(room)
        ? "等待電腦回應。"
        : "等待對手回應。";
  }

  if (game.phase === "robKong") {
    return game.pendingClaim && game.pendingClaim.toSeat === playerSeat
      ? "你可以搶槓胡。"
      : isSoloRoom(room)
        ? "等待電腦決定是否搶槓。"
        : "等待搶槓胡回應。";
  }

  return "對局進行中。";
}

export function getTileDisplayName(tileType: string): string {
  if (/^m[1-9]$/.test(tileType)) {
    return `${TILE_NUMBER_LABELS[Number(tileType[1])]}萬`;
  }
  if (/^p[1-9]$/.test(tileType)) {
    return `${TILE_NUMBER_LABELS[Number(tileType[1])]}筒`;
  }
  if (/^s[1-9]$/.test(tileType)) {
    return `${TILE_NUMBER_LABELS[Number(tileType[1])]}索`;
  }
  return HONOR_TILE_NAMES[tileType] || tileType;
}

export function getTileThemeClass(tileType: string): string {
  if (tileType.startsWith("m")) {
    return "tile-theme-man";
  }
  if (tileType.startsWith("p")) {
    return "tile-theme-pin";
  }
  if (tileType.startsWith("s")) {
    return "tile-theme-sou";
  }
  if (tileType === "R") {
    return "tile-theme-dragon-red";
  }
  if (tileType === "G") {
    return "tile-theme-dragon-green";
  }
  if (tileType === "B") {
    return "tile-theme-dragon-white";
  }
  return "tile-theme-wind";
}

function isPlayerLike(value: BridgePlayerLike | undefined): value is BridgePlayerLike {
  return Boolean(value && typeof value.id === "string" && typeof value.seat === "number");
}

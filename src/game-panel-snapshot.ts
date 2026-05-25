import { getTileType, sortTileIds } from "./rules.js";
import { DEFAULT_SOLO_DIFFICULTY, SOLO_DIFFICULTY_LABELS, getSoloBotProfile } from "./solo-controller.js";
import {
  formatPointScore,
  getIdleActionText,
  getMeldLabel,
  getPlayerDisplayName,
  getSeatScoreSummary,
  getSelfStatusText,
  getTileDisplayName,
  getTileThemeClass,
  isOnlineFourPlayerRoom,
} from "./bridge-view-helpers";
import type {
  BridgeDiscardSnapshot,
  BridgeGameActionSnapshot,
  BridgeGameCommandPayload,
  BridgeMeldSnapshot,
  BridgeOpponentSectionSnapshot,
  BridgeSelfSectionSnapshot,
  BridgeTileActionSnapshot,
  BridgeTileSnapshot,
  GameResultOverlaySnapshot,
  LobbyBridgeSnapshot,
} from "./react-shell/useAppBridge";
import type { AppClientStateLike, AppGameLike, AppGamePanelContext, AppPlayerLike, AppRoundStateLike } from "./runtime-shell-types";

type GameTableStageSnapshot = LobbyBridgeSnapshot["gamePanel"]["tableStage"];
type ResultHandGroupSnapshot = GameResultOverlaySnapshot["handGroups"][number];
type ScoringSummarySnapshot = NonNullable<GameResultOverlaySnapshot["scoringSummary"]>;

type DiscardLike = {
  tileId?: string;
  claimed?: boolean;
};

type MeldLike = {
  type?: string;
  tiles?: string[];
};

type ClientStateLike = AppClientStateLike;

type ResultTaiBreakdownLike = {
  key?: string;
  label?: string;
  tai?: number;
};

type ResultLike = {
  winKind?: string;
  winnerSeat?: number;
  loserSeat?: number | number[] | null;
  message?: string;
  winningTileId?: string;
  patterns?: Array<string | null | undefined>;
  taiBreakdown?: ResultTaiBreakdownLike[];
  scoringEnabled?: boolean;
  totalTai?: number;
  roundScore?: number;
};

type RoundStateLike = AppRoundStateLike & {
  hand?: string[];
  melds?: MeldLike[];
  discards?: DiscardLike[];
};

type GameLike = AppGameLike & {
  players?: RoundStateLike[];
  latestDiscard?: DiscardLike;
  result?: ResultLike | null;
};

type PlayerLike = AppPlayerLike;

type DrawRevealLike = {
  tileId: string;
  countdownLabel?: string;
  isGracePeriod?: boolean;
};

type GamePanelContextLike = AppGamePanelContext & {
  players?: PlayerLike[];
  currentPlayer?: PlayerLike | null;
  opponent?: PlayerLike | null;
  game?: GameLike | null;
  selfRoundState?: RoundStateLike;
  opponentRoundState?: RoundStateLike;
  clientState?: ClientStateLike | null;
  drawReveal?: DrawRevealLike | null;
  room?: Parameters<typeof getSelfStatusText>[3];
  seat?: number;
  showOpponentHand?: boolean;
};

const EMPTY_ROUND_STATE: RoundStateLike = {
  hand: [],
  melds: [],
  discards: [],
};

export function getEmptyGameTableStageSnapshot(): GameTableStageSnapshot {
  return {
    seatCount: 0,
    visible: false,
    hasResult: false,
    latestDiscard: null,
    latestDiscardPlaceholder: "目前沒有",
    discardRows: [],
    actions: {
      buttons: [],
      placeholderText: "等待對手操作",
    },
    opponentSection: {
      title: "等待中",
      scoreBadge: "",
      subtitle: "等待對手加入",
      hiddenTileCount: 0,
      revealHand: false,
      handTiles: [],
      melds: [],
    },
    leftSection: {
      title: "等待中",
      scoreBadge: "",
      subtitle: "等待牌列",
      hiddenTileCount: 0,
      revealHand: false,
      handTiles: [],
      melds: [],
    },
    rightSection: {
      title: "等待中",
      scoreBadge: "",
      subtitle: "等待牌列",
      hiddenTileCount: 0,
      revealHand: false,
      handTiles: [],
      melds: [],
    },
    selfSection: {
      title: "",
      scoreBadge: "",
      statusText: "等待中",
      statusTone: "normal",
      activityText: "",
      drawNoticeText: "",
      handTiles: [],
      drawnTile: null,
      melds: [],
    },
    resultOverlay: getEmptyResultOverlaySnapshot(),
  };
}

export function buildGameTableStageSnapshot(context: GamePanelContextLike | null | undefined): GameTableStageSnapshot {
  if (!context || !context.currentPlayer) {
    return getEmptyGameTableStageSnapshot();
  }

  const players = context.players || [];
  const currentPlayer = context.currentPlayer;
  const opponent = context.opponent || null;
  const game = context.game || null;
  const selfRoundState = context.selfRoundState || EMPTY_ROUND_STATE;
  const opponentRoundState = context.opponentRoundState || EMPTY_ROUND_STATE;
  const clientState = context.clientState || {};
  const playerCount = getGamePlayerCount(game, players);
  const currentSeat = typeof context.seat === "number" ? context.seat : currentPlayer.seat;
  const topSeatDistance = playerCount >= 4 ? 2 : 1;
  const topPlayer = getPlayerAtRelativeDistance(players, currentSeat, topSeatDistance, playerCount) || opponent;
  const topRoundState = getRoundState(game, topPlayer?.seat);
  const leftPlayer = playerCount >= 4 ? getPlayerAtRelativeDistance(players, currentSeat, 1, playerCount) : null;
  const rightPlayer = playerCount >= 4 ? getPlayerAtRelativeDistance(players, currentSeat, playerCount - 1, playerCount) : null;
  const leftRoundState = getRoundState(game, leftPlayer?.seat);
  const rightRoundState = getRoundState(game, rightPlayer?.seat);
  const discardRows = {
    top: getDiscardRowSnapshot(topPlayer ? "對家" : "", topRoundState.discards, topPlayer ? "尚未打牌" : ""),
    bottom: getDiscardRowSnapshot(currentPlayer.name ? "你" : "", selfRoundState.discards, "尚未打牌"),
    left: getDiscardRowSnapshot(leftPlayer ? "西家" : "", leftRoundState.discards, ""),
    right: getDiscardRowSnapshot(rightPlayer ? "東家" : "", rightRoundState.discards, ""),
  };

  return {
    seatCount: playerCount,
    visible: true,
    hasResult: Boolean(game && game.result),
    latestDiscard: getLatestDiscardSnapshot(game),
    latestDiscardPlaceholder: "目前沒有",
    discardRows: [discardRows.top, discardRows.bottom, discardRows.left, discardRows.right],
    actions: getActionButtonsSnapshot(clientState),
    opponentSection: getOpponentSectionSnapshot({
      ...context,
      game,
      opponent: topPlayer,
      opponentRoundState: topRoundState,
    }),
    leftSection: getSeatSectionSnapshot({
      player: leftPlayer,
      game,
      room: context.room,
      players,
      roundState: leftRoundState,
      emptySubtitle: "等待牌列",
    }),
    rightSection: getSeatSectionSnapshot({
      player: rightPlayer,
      game,
      room: context.room,
      players,
      roundState: rightRoundState,
      emptySubtitle: "等待牌列",
    }),
    selfSection: getSelfSectionSnapshot({
      ...context,
      currentPlayer,
      game,
      selfRoundState,
      clientState,
    }),
    resultOverlay: buildResultOverlaySnapshot(game, players),
  };
}

function getLatestDiscardSnapshot(game: GameLike | null | undefined): BridgeTileSnapshot | null {
  return createTileSnapshot(game && game.latestDiscard ? game.latestDiscard.tileId : "");
}

function createDiscardSnapshot(discard: DiscardLike | null | undefined): BridgeDiscardSnapshot | null {
  if (!discard || !discard.tileId) {
    return null;
  }

  const tile = createTileSnapshot(discard.tileId);
  if (!tile) {
    return null;
  }

  return {
    claimed: Boolean(discard.claimed),
    tile,
  };
}

function getDiscardRowSnapshot(
  label: string,
  discards: DiscardLike[] | null | undefined = [],
  placeholderText = "尚未打牌",
): GameTableStageSnapshot["discardRows"][number] {
  const discardItems = discards || [];

  return {
    label,
    placeholderText,
    tiles: [...discardItems].reverse().map((discard) => createDiscardSnapshot(discard)).filter(isDefined),
  };
}

function getActionButtonsSnapshot(clientState: ClientStateLike = {}): GameTableStageSnapshot["actions"] {
  const buttons: BridgeGameActionSnapshot[] = [];

  if (clientState.canDraw) {
    buttons.push({
      label: "摸牌",
      command: "drawTile",
      emphasis: false,
      payload: {},
    });
  }

  if (clientState.canSelfDraw) {
    buttons.push({
      label: "自摸",
      command: "declareSelfDraw",
      emphasis: true,
      payload: {},
    });
  }

  for (const tileType of clientState.concealedKongs || []) {
    buttons.push({
      label: `暗槓 ${getTileDisplayName(tileType)}`,
      command: "concealedKong",
      emphasis: false,
      payload: {
        tileType,
      },
    });
  }

  for (const option of clientState.addedKongs || []) {
    buttons.push({
      label: `加槓 ${getTileDisplayName(option.tileType || "")}`,
      command: "addedKong",
      emphasis: false,
      payload: {
        meldId: option.meldId,
        tileId: option.tileId,
      },
    });
  }

  for (const option of clientState.claimOptions || []) {
    buttons.push({
      label: option.label,
      command: option.type,
      emphasis: option.type === "claimWin",
      payload: {
        neededTypes: option.neededTypes || undefined,
      },
    });
  }

  return {
    buttons,
    placeholderText: buttons.length ? "" : getIdleActionText(clientState),
  };
}

function buildResultOverlaySnapshot(
  game: GameLike | null | undefined,
  players: PlayerLike[] = [],
): GameResultOverlaySnapshot {
  if (!game || !game.result) {
    return getEmptyResultOverlaySnapshot();
  }

  const isDraw = game.result.winKind === "draw";
  const winKindLabel =
    game.result.winKind === "selfDraw" ? "自摸" : game.result.winKind === "robKong" ? "搶槓" : "胡牌";
  const winnerName = getPlayerDisplayName(players, game.result.winnerSeat);
  const loserSeat = Array.isArray(game.result.loserSeat) ? game.result.loserSeat[0] : game.result.loserSeat;
  const patternText = getResultPatternText(game.result);
  const sourceLabel =
    game.result.winKind === "discardWin" && typeof loserSeat === "number"
      ? `放炮：${getPlayerDisplayName(players, loserSeat)}`
      : game.result.winKind === "robKong" && typeof loserSeat === "number"
        ? `被搶槓：${getPlayerDisplayName(players, loserSeat)}`
        : "";
  const detail = isDraw ? game.result.message || "本局流局。" : `牌型：${patternText}`;
  const hand = !isDraw ? buildResultHandSnapshot(game) : null;
  const scoringSummary = !isDraw ? buildResultScoringSnapshot(game.result) : null;

  return {
    visible: true,
    eyebrow: isDraw ? "對局結果" : "胡牌結果",
    title: isDraw ? "流局" : winnerName,
    kindLabel: isDraw ? "" : winKindLabel,
    sourceLabel,
    detail,
    winningTile: !isDraw ? createTileSnapshot(game.result.winningTileId) : null,
    handTitle: hand ? hand.title : "",
    handGroups: hand ? hand.groups : [],
    scoringSummary,
    primaryActionLabel: "繼續遊戲",
    secondaryActionLabel: "離開遊戲",
  };
}

function getResultPatternText(result: ResultLike | null | undefined): string {
  const patterns = Array.isArray(result?.patterns) ? result.patterns.filter(isNonEmptyString) : [];
  if (patterns.length) {
    return patterns.join("、");
  }

  const taiBreakdown = Array.isArray(result?.taiBreakdown)
    ? result.taiBreakdown.filter((item) => Boolean(item && item.tai && item.tai > 0 && item.label))
    : [];
  if (taiBreakdown.length === 1 && taiBreakdown[0]?.key === "baseWin") {
    return "基本胡";
  }
  if (taiBreakdown.length > 0) {
    return "標準胡牌";
  }

  return "標準胡牌";
}

function getEmptyResultOverlaySnapshot(): GameResultOverlaySnapshot {
  return {
    visible: false,
    eyebrow: "",
    title: "",
    kindLabel: "",
    sourceLabel: "",
    detail: "",
    winningTile: null,
    handTitle: "",
    handGroups: [],
    scoringSummary: null,
    primaryActionLabel: "繼續遊戲",
    secondaryActionLabel: "離開遊戲",
  };
}

function createTileSnapshot(tileId: string | null | undefined): BridgeTileSnapshot | null {
  if (!tileId) {
    return null;
  }

  const tileType = getTileType(tileId);
  return {
    tileId,
    tileType,
    label: getTileDisplayName(tileType),
    themeClass: getTileThemeClass(tileType),
  };
}

function createTileActionSnapshot(
  tileId: string,
  command: string,
  disabled: boolean,
  ariaLabel: string,
  payload: BridgeGameCommandPayload,
): BridgeTileActionSnapshot | null {
  const tile = createTileSnapshot(tileId);
  if (!tile) {
    return null;
  }

  return {
    tile,
    command,
    ariaLabel,
    disabled: Boolean(disabled),
    payload,
  };
}

function createMeldSnapshot(meld: MeldLike | null | undefined): BridgeMeldSnapshot | null {
  if (!meld || !Array.isArray(meld.tiles) || !meld.tiles.length) {
    return null;
  }

  return {
    label: getMeldLabel(meld.type),
    tiles: meld.tiles.map((tileId) => createTileSnapshot(tileId)).filter(isDefined),
  };
}

function createMeldSnapshots(melds: MeldLike[] | null | undefined = []): BridgeMeldSnapshot[] {
  const meldItems = melds || [];
  return meldItems.map((meld) => createMeldSnapshot(meld)).filter(isDefined);
}

function getOnlineFourPlayerActivityText(
  room: GamePanelContextLike["room"] | null,
  game: GameLike | null,
  players: PlayerLike[] | null | undefined,
): string {
  if (!isOnlineFourPlayerRoom(room) || !game || game.status !== "playing") {
    return "";
  }

  const activityLines: string[] = [];
  const latestDiscardSeat = typeof game.latestDiscard?.seat === "number" ? game.latestDiscard.seat : null;
  const latestDiscardTileId = game.latestDiscard?.tileId || "";
  if (latestDiscardSeat !== null && latestDiscardTileId) {
    const discardPlayerName = getPlayerDisplayName(players, latestDiscardSeat);
    activityLines.push(`${discardPlayerName}打${getTileDisplayName(getTileType(latestDiscardTileId))}`);
  }

  if (typeof game.turnSeat === "number") {
    const turnPlayerName = getPlayerDisplayName(players, game.turnSeat);
    if (game.phase === "discard") {
      activityLines.push(`輪到${turnPlayerName}打牌`);
    } else if (game.phase === "draw") {
      activityLines.push(`輪到${turnPlayerName}摸牌`);
    } else if ((game.phase === "response" || game.phase === "robKong") && typeof game.pendingClaim?.toSeat === "number") {
      const responsePlayerName = getPlayerDisplayName(players, game.pendingClaim.toSeat);
      activityLines.push(`等待${responsePlayerName}回應`);
    }
  }

  return activityLines.filter(Boolean).join("\n");
}

function getOpponentSectionSnapshot(context: GamePanelContextLike): BridgeOpponentSectionSnapshot {
  const opponent = context.opponent || null;
  const game = context.game || null;
  const room = context.room || null;
  const showOpponentHand = Boolean(context.showOpponentHand);
  const opponentRoundState = context.opponentRoundState || EMPTY_ROUND_STATE;
  const opponentHand = opponentRoundState.hand || [];
  const difficultyLabel = getBotDifficultyLabel(room, opponent);

  return {
    title: opponent?.name || "等待中",
    scoreBadge: opponent ? getSeatScoreSummary(game, opponent.seat) : "",
    subtitle: opponent ? [difficultyLabel, `手牌 ${opponentHand.length} 張`].filter(Boolean).join(" ・ ") : "等待對手加入",
    hiddenTileCount: opponent ? opponentHand.length : 0,
    revealHand: Boolean(opponent && showOpponentHand),
    handTiles: showOpponentHand && opponent ? opponentHand.map((tileId) => createTileSnapshot(tileId)).filter(isDefined) : [],
    melds: createMeldSnapshots(opponentRoundState.melds),
  };
}

function getSeatSectionSnapshot({
  player,
  game,
  room,
  players,
  roundState,
  emptySubtitle,
}: {
  player: PlayerLike | null;
  game: GameLike | null;
  room: GamePanelContextLike["room"] | null;
  players?: PlayerLike[] | null;
  roundState: RoundStateLike;
  emptySubtitle: string;
}): BridgeOpponentSectionSnapshot {
  const hand = roundState.hand || [];
  const difficultyLabel = getBotDifficultyLabel(room, player);
  return {
    title: player?.name || "等待中",
    scoreBadge: player ? getSeatScoreSummary(game, player.seat) : "",
    subtitle: player ? [difficultyLabel, `手牌 ${hand.length} 張`].filter(Boolean).join(" ・ ") : emptySubtitle,
    hiddenTileCount: player ? hand.length : 0,
    revealHand: false,
    handTiles: [],
    melds: createMeldSnapshots(roundState.melds),
  };
}

function getSelfSectionSnapshot(context: GamePanelContextLike): BridgeSelfSectionSnapshot {
  const room = context.room ?? null;
  const currentPlayer = context.currentPlayer;
  const game = context.game || null;
  const seat = context.seat;
  const players = context.players;
  const selfRoundState = context.selfRoundState || EMPTY_ROUND_STATE;
  const clientState = context.clientState || {};
  const drawReveal = context.drawReveal || null;
  const onlineFourPlayerActivityText = getOnlineFourPlayerActivityText(room, game, players);
  const onlineFourPlayerSyncStatus = getOnlineFourPlayerSyncStatus(room, currentPlayer, game);

  if (!currentPlayer) {
    return getEmptyGameTableStageSnapshot().selfSection;
  }

  const revealTileId = drawReveal ? drawReveal.tileId : "";
  let skippedRevealTile = false;
  const visibleHand: string[] = [];

  for (const tileId of selfRoundState.hand || []) {
    if (tileId === revealTileId && !skippedRevealTile) {
      skippedRevealTile = true;
      continue;
    }
    visibleHand.push(tileId);
  }

  const handTiles = visibleHand
    .map((tileId) =>
      createTileActionSnapshot(
        tileId,
        "discardTile",
        !clientState.canDiscard,
        `打出 ${getTileDisplayName(getTileType(tileId))}`,
        { tileId },
      ),
    )
    .filter(isDefined);

  const drawnTileButton = drawReveal
    ? createTileActionSnapshot(
        drawReveal.tileId,
        "discardTile",
        !clientState.canDiscard,
        `打出 ${getTileDisplayName(getTileType(drawReveal.tileId))}`,
        { tileId: drawReveal.tileId },
      )
    : null;

  return {
    title: currentPlayer.name || "你",
    scoreBadge: getSeatScoreSummary(game, currentPlayer.seat),
    statusText: onlineFourPlayerSyncStatus.text || getSelfStatusText(clientState, game, seat, room),
    statusTone: onlineFourPlayerSyncStatus.tone,
    activityText: onlineFourPlayerActivityText,
    drawNoticeText: getOnlineFourPlayerDrawNoticeText(room, drawReveal),
    handTiles,
    drawnTile: drawnTileButton
      ? {
          button: drawnTileButton,
          countdownLabel: drawReveal?.countdownLabel || "",
          isGracePeriod: Boolean(drawReveal?.isGracePeriod),
        }
      : null,
    melds: createMeldSnapshots(selfRoundState.melds),
  };
}

function getOnlineFourPlayerDrawNoticeText(
  room: GamePanelContextLike["room"] | null,
  drawReveal: DrawRevealLike | null,
): string {
  if (!isOnlineFourPlayerRoom(room) || !drawReveal?.tileId) {
    return "";
  }

  return `你剛剛摸到 ${getTileDisplayName(getTileType(drawReveal.tileId))}`;
}

function getOnlineFourPlayerSyncStatus(
  room: GamePanelContextLike["room"] | null,
  currentPlayer: PlayerLike | null | undefined,
  game: GameLike | null,
): { text: string; tone: BridgeSelfSectionSnapshot["statusTone"] } {
  if (!room || !isOnlineFourPlayerRoom(room) || !currentPlayer || !game || game.status !== "playing") {
    return {
      text: "",
      tone: "normal",
    };
  }

  const localDebug = room.localDebug || null;
  const lastCombinedSnapshotAt = Number(localDebug?.lastCombinedSnapshotAt) || 0;
  if (!lastCombinedSnapshotAt) {
    return {
      text: "同步：等待第一個房間快照\n4P debug：初始化中",
      tone: "warn",
    };
  }

  const now = Date.now();
  const combinedAgeMs = Math.max(0, now - lastCombinedSnapshotAt);
  const roomAgeMs = Math.max(0, now - (Number(localDebug?.lastRoomSnapshotAt) || lastCombinedSnapshotAt));
  const metaAgeMs = Math.max(0, now - (Number(localDebug?.lastRoomMetaSnapshotAt) || lastCombinedSnapshotAt));
  const pendingCommandCount = Math.max(0, Number(localDebug?.pendingCommandCount) || 0);
  const isHostClient = room.hostPlayerId === currentPlayer.id;

  let headline = `同步：正常（${formatElapsedDebugTime(combinedAgeMs)}前）`;
  if (!isHostClient && pendingCommandCount > 0 && combinedAgeMs >= 1200) {
    headline = `同步中：等待屋主套用（${pendingCommandCount}）`;
  } else if (combinedAgeMs >= 4000) {
    headline = `同步延遲：${formatElapsedDebugTime(combinedAgeMs)}未更新`;
  }

  return {
    text: [
      headline,
      `4P debug：${isHostClient ? "屋主端" : "客方端"} / room ${formatElapsedDebugTime(roomAgeMs)} / meta ${formatElapsedDebugTime(metaAgeMs)} / queue ${pendingCommandCount}`,
    ].join("\n"),
    tone: combinedAgeMs >= 4000 ? "warn" : "normal",
  };
}

function formatElapsedDebugTime(elapsedMs: number) {
  const normalizedMs = Math.max(0, Number(elapsedMs) || 0);
  if (normalizedMs < 1000) {
    return `${(normalizedMs / 1000).toFixed(1)}秒`;
  }
  if (normalizedMs < 10000) {
    return `${(normalizedMs / 1000).toFixed(1)}秒`;
  }
  return `${Math.round(normalizedMs / 1000)}秒`;
}

function buildResultHandSnapshot(
  game: GameLike | null | undefined,
): { title: string; groups: ResultHandGroupSnapshot[] } | null {
  const result = game && game.result ? game.result : null;
  if (!result || typeof result.winnerSeat !== "number") {
    return null;
  }

  const winnerState =
    game && Array.isArray(game.players)
      ? game.players.find((player) => player && player.seat === result.winnerSeat) || game.players[result.winnerSeat]
      : null;
  if (!winnerState) {
    return null;
  }

  const concealedTiles = Array.isArray(winnerState.hand) ? [...winnerState.hand] : [];
  if (result.winningTileId && !concealedTiles.includes(result.winningTileId)) {
    concealedTiles.push(result.winningTileId);
  }

  const sortedConcealedTiles = sortTileIds(concealedTiles);
  const melds = Array.isArray(winnerState.melds) ? winnerState.melds : [];

  return {
    title: "完整牌型",
    groups: [
      ...melds.map((meld) => createResultHandGroup(getMeldLabel(meld.type), meld.tiles)).filter(isDefined),
      createResultHandGroup(melds.length ? "手牌" : "完整牌型", sortedConcealedTiles),
    ].filter(isDefined),
  };
}

function createResultHandGroup(label: string, tileIds: string[] = []): ResultHandGroupSnapshot | null {
  if (!tileIds.length) {
    return null;
  }

  return {
    label,
    tiles: tileIds.map((tileId) => createTileSnapshot(tileId)).filter(isDefined),
  };
}

function buildResultScoringSnapshot(result: ResultLike | null | undefined): ScoringSummarySnapshot | null {
  if (!result || !result.scoringEnabled) {
    return null;
  }

  const taiBreakdown = Array.isArray(result.taiBreakdown)
    ? result.taiBreakdown.filter((item) => Boolean(item && item.tai && item.tai > 0))
    : [];

  return {
    label: "台數計算",
    rows: taiBreakdown.length
      ? taiBreakdown.map((item) => ({
          label: item?.label || "未命名台型",
          valueLabel: `${item?.tai || 0}台`,
        }))
      : [
          {
            label: "未達記分條件",
            valueLabel: "0台",
          },
        ],
    totalTaiLabel: `總共 ${Math.max(0, Number(result.totalTai) || 0)} 台`,
    totalScoreLabel: `總分 ${formatPointScore(Number(result.roundScore) || 0)}`,
  };
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value != null;
}

function getGamePlayerCount(game: GameLike | null | undefined, players: PlayerLike[] = []) {
  if (game && Array.isArray(game.players) && game.players.length >= 2) {
    return game.players.length;
  }
  return Math.max(2, players.length || 0);
}

function getPlayerAtRelativeDistance(
  players: PlayerLike[] = [],
  currentSeat: number | undefined,
  distance: number,
  playerCount: number,
) {
  if (typeof currentSeat !== "number" || playerCount < 2) {
    return null;
  }
  const targetSeat = ((currentSeat + distance) % playerCount + playerCount) % playerCount;
  return players.find((player) => player && player.seat === targetSeat) || null;
}

function getRoundState(game: GameLike | null | undefined, seat: number | undefined) {
  if (!game || !Array.isArray(game.players) || typeof seat !== "number") {
    return EMPTY_ROUND_STATE;
  }

  return game.players[seat] || EMPTY_ROUND_STATE;
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return Boolean(value);
}

function getBotDifficultyLabel(room: GamePanelContextLike["room"] | null, player: PlayerLike | null) {
  if (!room || !player || player.type !== "bot") {
    return "";
  }

  const seatCount = Math.max(
    2,
    Number(
      room.meta?.tablePlayerCount ||
      room.meta?.soloPlayerCount ||
      room.game?.players?.length ||
      room.activePlayers?.reduce((maxSeat, activePlayer) => Math.max(maxSeat, (activePlayer?.seat ?? -1) + 1), 0) ||
      2,
    ),
  );
  const difficulty = (
    room.meta?.botDifficulties?.[String(player.seat)] ||
    getSoloBotProfile(player.seat, seatCount, room.meta?.soloDifficulty || DEFAULT_SOLO_DIFFICULTY).difficulty
  ) as keyof typeof SOLO_DIFFICULTY_LABELS;

  return SOLO_DIFFICULTY_LABELS[difficulty] || SOLO_DIFFICULTY_LABELS[DEFAULT_SOLO_DIFFICULTY];
}

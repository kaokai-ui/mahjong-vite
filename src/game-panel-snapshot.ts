import { getTileType, sortTileIds } from "./rules.js";
import {
  formatPointScore,
  getIdleActionText,
  getMeldLabel,
  getPlayerDisplayName,
  getSeatScoreSummary,
  getSelfStatusText,
  getTileDisplayName,
  getTileThemeClass,
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
    selfSection: {
      title: "",
      scoreBadge: "",
      statusText: "等待中",
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

  return {
    visible: true,
    hasResult: Boolean(game && game.result),
    latestDiscard: getLatestDiscardSnapshot(game),
    latestDiscardPlaceholder: "目前沒有",
    discardRows: [
      getDiscardRowSnapshot(opponent?.name || "對手", opponentRoundState.discards),
      getDiscardRowSnapshot(currentPlayer.name || "你", selfRoundState.discards),
    ],
    actions: getActionButtonsSnapshot(clientState),
    opponentSection: getOpponentSectionSnapshot({
      ...context,
      game,
      opponent,
      opponentRoundState,
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
): GameTableStageSnapshot["discardRows"][number] {
  const discardItems = discards || [];

  return {
    label,
    placeholderText: "尚未打牌",
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
  const patternText = getResultPatternText(game.result);
  const detail = isDraw ? game.result.message || "本局流局。" : `牌型：${patternText}`;
  const hand = !isDraw ? buildResultHandSnapshot(game) : null;
  const scoringSummary = !isDraw ? buildResultScoringSnapshot(game.result) : null;

  return {
    visible: true,
    eyebrow: isDraw ? "對局結果" : "胡牌結果",
    title: isDraw ? "流局" : winnerName,
    kindLabel: isDraw ? "" : winKindLabel,
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

function getOpponentSectionSnapshot(context: GamePanelContextLike): BridgeOpponentSectionSnapshot {
  const opponent = context.opponent || null;
  const game = context.game || null;
  const showOpponentHand = Boolean(context.showOpponentHand);
  const opponentRoundState = context.opponentRoundState || EMPTY_ROUND_STATE;
  const opponentHand = opponentRoundState.hand || [];

  return {
    title: opponent?.name || "等待中",
    scoreBadge: opponent ? getSeatScoreSummary(game, opponent.seat) : "",
    subtitle: opponent ? `手牌 ${opponentHand.length} 張` : "等待對手加入",
    hiddenTileCount: opponent ? opponentHand.length : 0,
    revealHand: Boolean(opponent && showOpponentHand),
    handTiles: showOpponentHand && opponent ? opponentHand.map((tileId) => createTileSnapshot(tileId)).filter(isDefined) : [],
    melds: createMeldSnapshots(opponentRoundState.melds),
  };
}

function getSelfSectionSnapshot(context: GamePanelContextLike): BridgeSelfSectionSnapshot {
  const room = context.room ?? null;
  const currentPlayer = context.currentPlayer;
  const game = context.game || null;
  const seat = context.seat;
  const selfRoundState = context.selfRoundState || EMPTY_ROUND_STATE;
  const clientState = context.clientState || {};
  const drawReveal = context.drawReveal || null;

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
    statusText: getSelfStatusText(clientState, game, seat, room),
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

function isNonEmptyString(value: string | null | undefined): value is string {
  return Boolean(value);
}

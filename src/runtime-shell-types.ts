import type {
  BridgeGameLike,
  BridgePlayerLike,
  BridgeRoomLike,
} from "./bridge-view-helpers";

export type AppGameMode = "online" | "solo-bot";

export type AppPlayerLike = BridgePlayerLike;

export type AppRoundStateLike = {
  seat?: number;
  hand: string[];
  melds: Array<{
    type?: string;
    tiles?: string[];
  }>;
  discards: Array<{
    tileId?: string;
    claimed?: boolean;
  }>;
};

export type AppGameResultLike = {
  winKind?: string;
  winnerSeat?: number;
  message?: string;
  winningTileId?: string;
  patterns?: Array<string | null | undefined>;
  taiBreakdown?: Array<{
    key?: string;
    label?: string;
    tai?: number;
  }>;
  scoringEnabled?: boolean;
  totalTai?: number;
  roundScore?: number;
} | null;

export type AppGameLike = NonNullable<BridgeGameLike> & {
  roundNumber?: number | null;
  rulesetId?: string;
  wall?: unknown[];
  players?: AppRoundStateLike[];
  latestDiscard?: {
    tileId?: string;
    claimed?: boolean;
  };
  result?: AppGameResultLike;
  lastDraw?: {
    initial?: boolean;
    seat?: number;
    tileId?: string;
    source?: string;
  } | null;
  drawRevealSeconds?: number;
};

export type AppRoomLike = NonNullable<BridgeRoomLike> & {
  roomId?: string;
  rulesetId?: string;
  hostPlayerId?: string;
  game?: AppGameLike | null;
  lastError?: {
    playerId?: string;
    message?: string;
  } | null;
  meta?: (NonNullable<BridgeRoomLike>["meta"] & {
    soloDifficulty?: string;
    soloPlayerCount?: number;
    botDifficulties?: Record<string, string>;
  }) | null;
};

export type AppSetupState = {
  ready?: boolean;
  authReady?: boolean;
  configured?: boolean;
  appCheckConfigured?: boolean;
  appCheckEnabled?: boolean;
  appCheckDebug?: boolean;
  appCheckMessage?: string;
} | null;

export type AppGamePanelContext = {
  room: AppRoomLike;
  players: AppPlayerLike[];
  currentPlayer: AppPlayerLike | null;
  seat?: number;
  opponent: AppPlayerLike | null;
  game?: AppGameLike | null;
  showOpponentHand?: boolean;
  selfRoundState?: AppRoundStateLike;
  opponentRoundState?: AppRoundStateLike;
  clientState?: AppClientStateLike;
};

export type AppAddedKongLike = {
  meldId?: number;
  tileId?: string;
  tileType?: string;
};

export type AppClaimOptionLike = {
  label: string;
  type: string;
  neededTypes?: string[];
};

export type AppClientStateLike = {
  canSelfDraw?: boolean;
  canDraw?: boolean;
  canDiscard?: boolean;
  concealedKongs?: string[] | null;
  addedKongs?: AppAddedKongLike[] | null;
  claimOptions?: AppClaimOptionLike[] | null;
};

export type AppState = {
  room: AppRoomLike | null;
  message: string;
  error: string;
  lastLobbyAction: string;
  selectedMode: AppGameMode;
  playerName: string;
  createRoomCode: string;
  joinRoomCode: string;
  selectedRulesetId: string;
  selectedDrawRevealSeconds: number;
  selectedSoloDifficulty: string;
  selectedSoloPlayerCount: number;
  selectedScoringEnabled: boolean;
  roomPanelRulesetId: string;
  roomPanelRulesetDirty: boolean;
  roomPanelRoomId: string;
};

export type BootstrapElements = {
  gamePanel: Element | null;
};

export type ControllerIdentity = {
  playerId: string;
  playerName?: string;
};

export type ControllerLike = {
  init: () => Promise<unknown>;
  leaveRoom: () => void;
  getIdentity: () => ControllerIdentity;
  getSetupState?: () => AppSetupState;
  isHost?: () => boolean;
  sendGameCommand: (command: string, payload?: unknown) => Promise<void>;
};

export type ControllerRuntimeState = {
  controller: ControllerLike | null;
  initToken: number;
};

export type BridgeRuntime = {
  registerBridgeActions: () => void;
  syncBridgeSnapshot: () => void;
};

export type ModeRuntime = {
  getController: () => ControllerLike;
  initializeMode: (mode?: AppGameMode) => void;
  syncActiveControllerPlayerName: () => void;
  switchMode: (mode: AppGameMode) => void;
};

export type RenderRuntime = {
  render: () => void;
  runUiAction: (action: string) => Promise<void>;
};

export type BootstrapRuntimes = {
  bridgeRuntime: BridgeRuntime;
  modeRuntime: ModeRuntime;
  renderRuntime: RenderRuntime;
};

import type { AppGameMode, AppRoomLike, AppState } from "./runtime-shell-types";

type CreateRandomRoomId = () => string;
type NormalizeGameMode = (value: unknown) => AppGameMode;
type NormalizeRoomId = (value: unknown) => string;
type NormalizeScoringEnabled = (value: unknown) => boolean;
type NormalizeSoloDifficulty = (value: unknown) => string;
type ReadInitialAppSettingsContext = {
  createRandomRoomId: CreateRandomRoomId;
  gameModeStorageKey: string;
  normalizeGameMode: NormalizeGameMode;
  normalizeRoomId: NormalizeRoomId;
  normalizeScoringEnabled: NormalizeScoringEnabled;
  normalizeSoloDifficulty: NormalizeSoloDifficulty;
  onlineModeValue: AppGameMode;
  playerNameStorageKey: string;
  queryRoom: string | null;
  scoringEnabledStorageKey: string;
  soloDifficultyStorageKey: string;
  soloModeValue: AppGameMode;
};

type SyncModeSpecificInputsContext = {
  createRandomRoomId: CreateRandomRoomId;
  soloModeValue: AppGameMode;
};

type SyncRoomPanelRulesetStateContext = {
  normalizeRulesetId: (value?: string) => string;
  room?: AppRoomLike | null;
};

type ApplyDefaultSettingsMigrationContext = {
  defaultScoringEnabled: boolean;
  defaultSoloDifficulty: string;
  defaultsVersion: string;
  defaultsVersionStorageKey: string;
  gameModeStorageKey: string;
  normalizeGameMode: NormalizeGameMode;
  normalizeScoringEnabled: NormalizeScoringEnabled;
  normalizeSoloDifficulty: NormalizeSoloDifficulty;
  onlineModeValue: AppGameMode;
  queryRoom: string | null;
  scoringEnabledStorageKey: string;
  soloDifficultyStorageKey: string;
  soloModeValue: AppGameMode;
};

type InitialAppSettings = Pick<
  AppState,
  "selectedMode" | "playerName" | "createRoomCode" | "joinRoomCode" | "selectedSoloDifficulty" | "selectedScoringEnabled"
>;

export function readInitialAppSettings(context: ReadInitialAppSettingsContext): InitialAppSettings {
  const {
    queryRoom,
    gameModeStorageKey,
    playerNameStorageKey,
    soloDifficultyStorageKey,
    scoringEnabledStorageKey,
    soloModeValue,
    onlineModeValue,
    normalizeGameMode,
    normalizeRoomId,
    normalizeSoloDifficulty,
    normalizeScoringEnabled,
    createRandomRoomId,
  } = context;
  const storedMode = readLocalSetting(gameModeStorageKey) || soloModeValue;

  return {
    selectedMode: queryRoom ? onlineModeValue : normalizeGameMode(storedMode),
    playerName: readLocalSetting(playerNameStorageKey) || "",
    createRoomCode: createRandomRoomId(),
    joinRoomCode: queryRoom ? normalizeRoomId(queryRoom) : "",
    selectedSoloDifficulty: normalizeSoloDifficulty(readLocalSetting(soloDifficultyStorageKey)),
    selectedScoringEnabled: normalizeScoringEnabled(readLocalSetting(scoringEnabledStorageKey)),
  };
}

export function syncModeSpecificInputs(appState: AppState, context: SyncModeSpecificInputsContext) {
  const { createRandomRoomId, soloModeValue } = context;
  if (appState.selectedMode === soloModeValue) {
    appState.createRoomCode = "";
    appState.joinRoomCode = "";
    return;
  }

  if (!appState.createRoomCode.trim()) {
    appState.createRoomCode = createRandomRoomId();
  }
}

export function syncRoomPanelRulesetState(appState: AppState, context: SyncRoomPanelRulesetStateContext) {
  const { normalizeRulesetId } = context;
  const room = context.room === undefined ? appState.room : context.room;
  const nextRoomId = room && room.roomId ? room.roomId : "";
  const nextRulesetId = normalizeRulesetId(room ? room.rulesetId || room.game?.rulesetId : appState.selectedRulesetId);

  if (!nextRoomId) {
    appState.roomPanelRoomId = "";
    appState.roomPanelRulesetId = nextRulesetId;
    appState.roomPanelRulesetDirty = false;
    return;
  }

  if (appState.roomPanelRoomId !== nextRoomId) {
    appState.roomPanelRoomId = nextRoomId;
    appState.roomPanelRulesetId = nextRulesetId;
    appState.roomPanelRulesetDirty = false;
    return;
  }

  if (appState.roomPanelRulesetDirty) {
    if (nextRulesetId === appState.roomPanelRulesetId || room?.game?.status === "playing") {
      appState.roomPanelRulesetDirty = false;
    }
    return;
  }

  appState.roomPanelRulesetId = nextRulesetId;
}

export function applyDefaultSettingsMigration(context: ApplyDefaultSettingsMigrationContext) {
  const {
    queryRoom,
    defaultsVersionStorageKey,
    defaultsVersion,
    gameModeStorageKey,
    soloDifficultyStorageKey,
    scoringEnabledStorageKey,
    soloModeValue,
    onlineModeValue,
    defaultSoloDifficulty,
    defaultScoringEnabled,
    normalizeGameMode,
    normalizeSoloDifficulty,
    normalizeScoringEnabled,
  } = context;
  if (queryRoom) {
    return;
  }

  const defaultsVersionValue = readLocalSetting(defaultsVersionStorageKey);
  if (defaultsVersionValue === defaultsVersion) {
    return;
  }

  const storedMode = normalizeGameMode(readLocalSetting(gameModeStorageKey) || soloModeValue);
  const storedDifficulty = normalizeSoloDifficulty(readLocalSetting(soloDifficultyStorageKey));
  const storedScoringEnabled = normalizeScoringEnabled(readLocalSetting(scoringEnabledStorageKey));

  if (storedMode === onlineModeValue) {
    writeLocalSetting(gameModeStorageKey, soloModeValue);
  }

  if (storedDifficulty === "easy") {
    writeLocalSetting(soloDifficultyStorageKey, defaultSoloDifficulty);
  }

  if (!storedScoringEnabled) {
    writeLocalSetting(scoringEnabledStorageKey, String(defaultScoringEnabled));
  }

  writeLocalSetting(defaultsVersionStorageKey, defaultsVersion);
}

export function readLocalSetting(key: string) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

export function writeLocalSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // Ignore Safari private mode write failures.
  }
}

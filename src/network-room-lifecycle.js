import {
  DEFAULT_DRAW_REVEAL_SECONDS,
  createWaitingGame,
} from "./game.js";
import { formatFirebaseClientError } from "./network-client-errors.js";
import {
  normalizeFirebaseRulesetId,
} from "./firebase-rules-contract.js";
import {
  GAME_MODE_ONLINE_2P,
  getOnlineBotSeats,
  getOnlineHumanSeatForSlot,
  getOnlineTablePlayerCount,
  normalizeOnlineGameMode,
} from "./game-mode.js";
import {
  DEFAULT_SOLO_DIFFICULTY,
  getSoloBotProfile,
} from "./solo-controller.js";
import {
  countOccupiedSeats,
  getSeatForBrowser,
  getSeatForPlayer,
  getSeatValue,
  isParticipant,
  isRoomExpired,
  normalizeRoom,
  seatExists,
} from "./network-room-helpers.js";
import {
  getRoomMeta,
  getRoomRecord,
  setWithContext,
  writeInitialRoomRecord,
} from "./network-room-repository.js";
import { DEFAULT_RULESET } from "./rules.js";

const defaultRoomLifecycleDependencies = {
  getRoomMeta,
  getRoomRecord,
  setWithContext,
  writeInitialRoomRecord,
};

export async function createNetworkRoom(
  controller,
  {
    roomId,
    playerName,
    gameMode = GAME_MODE_ONLINE_2P,
    rulesetId = DEFAULT_RULESET,
    drawRevealSeconds = DEFAULT_DRAW_REVEAL_SECONDS,
    scoringEnabled = false,
  },
  dependencies = defaultRoomLifecycleDependencies,
) {
  try {
    await controller.ensureReady();

    const trimmedName = controller.setPlayerName(playerName);
    const normalizedRoomId = controller.normalizeRoomId(roomId);
    const normalizedRulesetId = normalizeFirebaseRulesetId(rulesetId);
    const normalizedGameMode = normalizeOnlineGameMode(gameMode);
    if (!normalizedRoomId) {
      throw new Error("請先輸入房號。");
    }

    const identity = controller.getIdentity();
    if (!identity.playerId || !identity.browserId) {
      throw new Error("連線身分尚未完成，請稍後再試。");
    }

    const existingMeta = await dependencies.getRoomMeta(normalizedRoomId);
    if (existingMeta && !isRoomExpired(existingMeta)) {
      throw new Error("這個房號已經被使用，請換一組房號。");
    }

    const now = Date.now();
    const tablePlayerCount = getOnlineTablePlayerCount(normalizedGameMode);
    const botPlayers = buildNetworkBotPlayers(normalizedGameMode, now);
    const botDifficulties = buildNetworkBotDifficulties(normalizedGameMode);
    const createdMeta = {
      roomId: normalizedRoomId,
      hostPlayerId: identity.playerId,
      hostBrowserId: identity.browserId,
      godViewEnabled: false,
      rulesetId: normalizedRulesetId,
      gameMode: normalizedGameMode,
      createdAt: now,
      updatedAt: now,
      playerCount: 1,
      tablePlayerCount,
      open: true,
      participants: {
        [identity.playerId]: true,
      },
      seats: {
        0: identity.playerId,
      },
      seatBrowserIds: {
        0: identity.browserId,
      },
      botDifficulties,
      botThinking: false,
      botThinkingSeat: null,
    };

    await dependencies.setWithContext(`roomMeta/${normalizedRoomId}`, createdMeta);

    const roomData = {
      roomId: normalizedRoomId,
      hostPlayerId: identity.playerId,
      rulesetId: normalizedRulesetId,
      createdAt: now,
      updatedAt: now,
      lastError: null,
      gameMode: normalizedGameMode,
      players: {
        [identity.playerId]: createHumanPlayerRecord(identity.playerId, trimmedName, 0, now),
        ...botPlayers,
      },
      game: createWaitingGame(normalizedRulesetId, {
        drawRevealSeconds,
        scoringEnabled,
        playerCount: tablePlayerCount,
      }),
      commands: {},
    };

    await dependencies.writeInitialRoomRecord(normalizedRoomId, roomData);
    controller.subscribeToRoom(normalizedRoomId);
  } catch (error) {
    throw new Error(formatFirebaseClientError(error));
  }
}

export async function joinNetworkRoom(controller, { roomId, playerName }, dependencies = defaultRoomLifecycleDependencies) {
  try {
    await controller.ensureReady();

    const trimmedName = controller.setPlayerName(playerName);
    const normalizedRoomId = controller.normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      throw new Error("請先輸入房號。");
    }

    const identity = controller.getIdentity();
    if (!identity.playerId || !identity.browserId) {
      throw new Error("連線身分尚未完成，請稍後再試。");
    }

    let meta = await dependencies.getRoomMeta(normalizedRoomId);
    if (!meta) {
      throw new Error("找不到這個房間。");
    }

    if (isRoomExpired(meta)) {
      throw new Error("這個房間已經超過 8 天未更新，請重新建立房間。");
    }

    const browserSeat = getSeatForBrowser(meta, identity.browserId);
    if (browserSeat != null) {
      await reclaimNetworkSeat(
        controller,
        normalizedRoomId,
        meta,
        browserSeat,
        trimmedName,
        identity,
        dependencies,
      );
      return;
    }

    if (!isParticipant(meta, identity.playerId)) {
      if (!meta.open || seatExists(meta, 1)) {
        throw new Error("這個房間目前無法加入。");
      }

      const now = Date.now();
      meta = {
        ...meta,
        updatedAt: now,
        playerCount: 2,
        open: false,
        participants: {
          ...meta.participants,
          [identity.playerId]: true,
        },
        seats: {
          ...meta.seats,
          1: identity.playerId,
        },
        seatBrowserIds: {
          ...meta.seatBrowserIds,
          1: identity.browserId,
        },
      };
      await dependencies.setWithContext(`roomMeta/${normalizedRoomId}`, meta);
    }

    const seatSlot = getSeatForPlayer(meta, identity.playerId);
    if (seatSlot == null) {
      throw new Error("找不到你在房間中的座位。");
    }

    const actualSeat = getOnlineHumanSeatForSlot(meta.gameMode || GAME_MODE_ONLINE_2P, seatSlot);
    const roomSnapshot = await dependencies.getRoomRecord(normalizedRoomId);
    const roomData = normalizeRoom(roomSnapshot.val(), meta);
    if (!roomData) {
      throw new Error("房間資料讀取失敗，請重新加入。");
    }

    const existingPlayer = roomData.players ? roomData.players[identity.playerId] : null;
    const joinedAt =
      existingPlayer && typeof existingPlayer.joinedAt === "number" ? existingPlayer.joinedAt : Date.now();

    await dependencies.setWithContext(`rooms/${normalizedRoomId}/players/${identity.playerId}`, {
      ...createHumanPlayerRecord(identity.playerId, trimmedName, actualSeat, joinedAt),
    });
    await dependencies.setWithContext(`rooms/${normalizedRoomId}/updatedAt`, Date.now());

    controller.subscribeToRoom(normalizedRoomId);
  } catch (error) {
    throw new Error(formatFirebaseClientError(error));
  }
}

export async function reclaimNetworkSeat(
  controller,
  roomId,
  meta,
  seatSlot,
  playerName,
  identity,
  dependencies = defaultRoomLifecycleDependencies,
) {
  const previousPlayerId = getSeatValue(meta, seatSlot);
  const now = Date.now();
  const nextParticipants = {
    ...(meta.participants || {}),
    [identity.playerId]: true,
  };

  if (previousPlayerId && previousPlayerId !== identity.playerId) {
    delete nextParticipants[previousPlayerId];
  }

  const nextSeats = {
    ...(meta.seats || {}),
    [seatSlot]: identity.playerId,
  };
  const occupiedSeatCount = countOccupiedSeats(nextSeats);
  const nextMeta = {
    ...meta,
    hostPlayerId: seatSlot === 0 ? identity.playerId : meta.hostPlayerId,
    updatedAt: now,
    playerCount: occupiedSeatCount,
    open: occupiedSeatCount < 2,
    participants: nextParticipants,
    seats: nextSeats,
    seatBrowserIds: {
      ...(meta.seatBrowserIds || {}),
      [seatSlot]: identity.browserId,
    },
  };

  await dependencies.setWithContext(`roomMeta/${roomId}`, nextMeta);

  if (seatSlot === 0) {
    await dependencies.setWithContext(`rooms/${roomId}/hostPlayerId`, identity.playerId);
  }

  const actualSeat = getOnlineHumanSeatForSlot(nextMeta.gameMode || GAME_MODE_ONLINE_2P, seatSlot);
  const roomSnapshot = await dependencies.getRoomRecord(roomId);
  const roomData = normalizeRoom(roomSnapshot.val(), nextMeta);
  if (!roomData) {
    throw new Error("房間資料讀取失敗，請重新加入。");
  }

  const previousPlayer =
    previousPlayerId && roomData.players ? roomData.players[previousPlayerId] : null;
  const joinedAt =
    previousPlayer && typeof previousPlayer.joinedAt === "number" ? previousPlayer.joinedAt : now;

  await dependencies.setWithContext(`rooms/${roomId}/players/${identity.playerId}`, {
    ...createHumanPlayerRecord(identity.playerId, playerName, actualSeat, joinedAt),
  });
  await dependencies.setWithContext(`rooms/${roomId}/updatedAt`, now);
  controller.subscribeToRoom(roomId);
}

function createHumanPlayerRecord(playerId, playerName, seat, joinedAt) {
  return {
    id: playerId,
    name: playerName,
    seat,
    joinedAt,
    type: "human",
  };
}

function createBotPlayerRecord(seat, joinedAt) {
  const profile = getSoloBotProfile(seat, 4, DEFAULT_SOLO_DIFFICULTY);
  return {
    id: createNetworkBotPlayerId(seat),
    name: profile.name,
    seat,
    joinedAt,
    type: "bot",
  };
}

function buildNetworkBotPlayers(gameMode, joinedAt) {
  return Object.fromEntries(
    getOnlineBotSeats(gameMode).map((seat) => [createNetworkBotPlayerId(seat), createBotPlayerRecord(seat, joinedAt)]),
  );
}

function buildNetworkBotDifficulties(gameMode) {
  return Object.fromEntries(
    getOnlineBotSeats(gameMode).map((seat) => [seat, getSoloBotProfile(seat, 4, DEFAULT_SOLO_DIFFICULTY).difficulty]),
  );
}

function createNetworkBotPlayerId(seat) {
  return `network-bot-${seat}`;
}

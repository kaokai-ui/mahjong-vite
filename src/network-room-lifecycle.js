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
  normalizeRoomMeta,
  seatExists,
} from "./network-room-helpers.js";
import {
  getRoomMeta,
  getRoomRecord,
  setWithContext,
  writeInitialRoomRecord,
} from "./network-room-repository.js";
import { ref, runTransaction } from "firebase/database";
import { getFirebaseDatabaseInstance } from "./network-firebase-runtime.js";
import { DEFAULT_RULESET } from "./rules.js";

async function runRoomMetaTransaction(roomId, updater) {
  const metaRef = ref(getFirebaseDatabaseInstance(), `roomMeta/${roomId}`);
  const result = await runTransaction(metaRef, (current) => updater(current));
  return {
    committed: Boolean(result.committed),
    meta: result.snapshot ? result.snapshot.val() : null,
  };
}

const defaultRoomLifecycleDependencies = {
  getRoomMeta,
  getRoomRecord,
  setWithContext,
  writeInitialRoomRecord,
  runRoomMetaTransaction,
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

    try {
      await dependencies.writeInitialRoomRecord(normalizedRoomId, roomData);
    } catch (roomWriteError) {
      // The room record write failed after roomMeta was already persisted.
      // Roll back the orphaned roomMeta so this room id is not left permanently
      // blocked (isRoomExpired would keep rejecting new create attempts).
      try {
        await dependencies.setWithContext(`roomMeta/${normalizedRoomId}`, null);
      } catch (cleanupError) {
        // Best-effort cleanup only; surface the original write failure below.
        void cleanupError;
      }
      throw roomWriteError;
    }
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
      const claim = await claimSecondSeat(dependencies, normalizedRoomId, identity);
      if (!claim.committed) {
        if (!claim.meta) {
          throw new Error("找不到這個房間。");
        }
        throw new Error("這個房間目前無法加入。");
      }
      meta = normalizeRoomMeta(claim.meta) || meta;
    }

    const seatSlot = getSeatForPlayer(meta, identity.playerId);
    if (seatSlot == null) {
      throw new Error("找不到你在房間中的座位。");
    }

    await finalizeSeatMembership(controller, normalizedRoomId, meta, seatSlot, trimmedName, identity, {
      lookupPlayerId: identity.playerId,
      now: Date.now(),
      dependencies,
    });
  } catch (error) {
    throw new Error(formatFirebaseClientError(error));
  }
}

// Atomically claim the second seat of a 2-human room. Uses a client-side
// Firebase transaction (via dependencies.runRoomMetaTransaction) so that two
// players joining at the same time cannot both write seat 1 and clobber each
// other. Falls back to a read-then-set when no transaction runner is injected
// (e.g. in unit tests) which preserves the previous single-client behavior.
async function claimSecondSeat(dependencies, roomId, identity) {
  const now = Date.now();
  const applyClaim = (rawMeta) => {
    const current = normalizeRoomMeta(rawMeta);
    if (!current) {
      // Room disappeared between the initial read and this transaction.
      return undefined;
    }
    if (isParticipant(current, identity.playerId)) {
      // Already joined (e.g. duplicate submit); keep the existing meta.
      return current;
    }
    if (!current.open || seatExists(current, 1)) {
      // Room is closed or the seat was taken by someone else -> abort.
      return undefined;
    }
    return {
      ...current,
      updatedAt: now,
      playerCount: 2,
      open: false,
      participants: {
        ...current.participants,
        [identity.playerId]: true,
      },
      seats: {
        ...current.seats,
        1: identity.playerId,
      },
      seatBrowserIds: {
        ...current.seatBrowserIds,
        1: identity.browserId,
      },
    };
  };

  if (typeof dependencies.runRoomMetaTransaction === "function") {
    return dependencies.runRoomMetaTransaction(roomId, applyClaim);
  }

  const rawMeta = await dependencies.getRoomMeta(roomId);
  const nextMeta = applyClaim(rawMeta);
  if (nextMeta === undefined) {
    return { committed: false, meta: rawMeta || null };
  }
  await dependencies.setWithContext(`roomMeta/${roomId}`, nextMeta);
  return { committed: true, meta: nextMeta };
}

async function finalizeSeatMembership(
  controller,
  roomId,
  meta,
  seatSlot,
  playerName,
  identity,
  { lookupPlayerId, now, dependencies },
) {
  const actualSeat = getOnlineHumanSeatForSlot(meta.gameMode || GAME_MODE_ONLINE_2P, seatSlot);
  const roomSnapshot = await dependencies.getRoomRecord(roomId);
  const roomData = normalizeRoom(roomSnapshot.val(), meta);
  if (!roomData) {
    throw new Error("房間資料讀取失敗，請重新加入。");
  }

  const existingPlayer = lookupPlayerId && roomData.players ? roomData.players[lookupPlayerId] : null;
  const joinedAt =
    existingPlayer && typeof existingPlayer.joinedAt === "number" ? existingPlayer.joinedAt : now;

  await dependencies.setWithContext(`rooms/${roomId}/players/${identity.playerId}`, {
    ...createHumanPlayerRecord(identity.playerId, playerName, actualSeat, joinedAt),
  });
  await dependencies.setWithContext(`rooms/${roomId}/updatedAt`, now);
  controller.subscribeToRoom(roomId);
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

  await finalizeSeatMembership(controller, roomId, nextMeta, seatSlot, playerName, identity, {
    lookupPlayerId: previousPlayerId,
    now,
    dependencies,
  });
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

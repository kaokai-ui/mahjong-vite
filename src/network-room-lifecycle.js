import {
  DEFAULT_DRAW_REVEAL_SECONDS,
  createWaitingGame,
} from "./game.js";
import { formatFirebaseClientError } from "./network-client-errors.js";
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
    if (!normalizedRoomId) {
      throw new Error("請輸入房號。");
    }

    const identity = controller.getIdentity();
    if (!identity.playerId || !identity.browserId) {
      throw new Error("匿名登入尚未完成，請稍候再試。");
    }

    const existingMeta = await dependencies.getRoomMeta(normalizedRoomId);
    if (existingMeta && !isRoomExpired(existingMeta)) {
      throw new Error("這個房號已存在，請換一個房號。");
    }

    const now = Date.now();
    const createdMeta = {
      roomId: normalizedRoomId,
      hostPlayerId: identity.playerId,
      hostBrowserId: identity.browserId,
      godViewEnabled: false,
      rulesetId,
      createdAt: now,
      updatedAt: now,
      playerCount: 1,
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
    };

    await dependencies.setWithContext(`roomMeta/${normalizedRoomId}`, createdMeta);

    const roomData = {
      roomId: normalizedRoomId,
      hostPlayerId: identity.playerId,
      rulesetId,
      createdAt: now,
      updatedAt: now,
      lastError: null,
      players: {
        [identity.playerId]: {
          id: identity.playerId,
          name: trimmedName,
          seat: 0,
          joinedAt: now,
        },
      },
      game: createWaitingGame(rulesetId, { drawRevealSeconds, scoringEnabled }),
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
      throw new Error("請輸入房號。");
    }

    const identity = controller.getIdentity();
    if (!identity.playerId || !identity.browserId) {
      throw new Error("匿名登入尚未完成，請稍候再試。");
    }

    let meta = await dependencies.getRoomMeta(normalizedRoomId);
    if (!meta) {
      throw new Error("找不到這個房間。");
    }

    if (isRoomExpired(meta)) {
      throw new Error("這個房間已超過 8 天沒有活動，請重新建立房間。");
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
        throw new Error("房間已滿。");
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

    const seat = getSeatForPlayer(meta, identity.playerId);
    if (seat == null) {
      throw new Error("房間座位資料不完整，請重新建立房間。");
    }

    const roomSnapshot = await dependencies.getRoomRecord(normalizedRoomId);
    const roomData = normalizeRoom(roomSnapshot.val(), meta);
    if (!roomData) {
      throw new Error("房間資料尚未建立完成，請稍後再試。");
    }

    const existingPlayer = roomData.players ? roomData.players[identity.playerId] : null;
    const joinedAt =
      existingPlayer && typeof existingPlayer.joinedAt === "number" ? existingPlayer.joinedAt : Date.now();

    await dependencies.setWithContext(`rooms/${normalizedRoomId}/players/${identity.playerId}`, {
      id: identity.playerId,
      name: trimmedName,
      seat,
      joinedAt,
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
  seat,
  playerName,
  identity,
  dependencies = defaultRoomLifecycleDependencies,
) {
  const previousPlayerId = getSeatValue(meta, seat);
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
    [seat]: identity.playerId,
  };
  const occupiedSeatCount = countOccupiedSeats(nextSeats);
  const nextMeta = {
    ...meta,
    hostPlayerId: seat === 0 ? identity.playerId : meta.hostPlayerId,
    updatedAt: now,
    playerCount: occupiedSeatCount,
    open: occupiedSeatCount < 2,
    participants: nextParticipants,
    seats: nextSeats,
    seatBrowserIds: {
      ...(meta.seatBrowserIds || {}),
      [seat]: identity.browserId,
    },
  };

  await dependencies.setWithContext(`roomMeta/${roomId}`, nextMeta);

  if (seat === 0) {
    await dependencies.setWithContext(`rooms/${roomId}/hostPlayerId`, identity.playerId);
  }

  const roomSnapshot = await dependencies.getRoomRecord(roomId);
  const roomData = normalizeRoom(roomSnapshot.val(), nextMeta);
  if (!roomData) {
    throw new Error("房間資料尚未建立完成，請稍後再試。");
  }

  const previousPlayer =
    previousPlayerId && roomData.players ? roomData.players[previousPlayerId] : null;
  const joinedAt =
    previousPlayer && typeof previousPlayer.joinedAt === "number" ? previousPlayer.joinedAt : now;

  await dependencies.setWithContext(`rooms/${roomId}/players/${identity.playerId}`, {
    id: identity.playerId,
    name: playerName,
    seat,
    joinedAt,
  });
  await dependencies.setWithContext(`rooms/${roomId}/updatedAt`, now);
  controller.subscribeToRoom(roomId);
}

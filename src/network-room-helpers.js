import { normalizeGameState } from "./game.js";
import { DEFAULT_RULESET } from "./rules.js";
import { normalizeFirebaseRulesetId } from "./firebase-rules-contract.js";

const ROOM_EXPIRATION_MS = 8 * 24 * 60 * 60 * 1000;

function normalizeRoom(room, meta = null) {
  if (!room) {
    return null;
  }

  const normalizedMeta = normalizeRoomMeta(meta);
  const normalizedPlayers = room.players || {};

  return {
    ...room,
    roomId: room.roomId || (normalizedMeta && normalizedMeta.roomId) || "",
    hostPlayerId: room.hostPlayerId || (normalizedMeta && normalizedMeta.hostPlayerId) || "",
    rulesetId: normalizeFirebaseRulesetId(room.rulesetId || (normalizedMeta && normalizedMeta.rulesetId) || DEFAULT_RULESET),
    meta: normalizedMeta,
    players: normalizedPlayers,
    activePlayers: buildActivePlayers(normalizedPlayers, normalizedMeta),
    commands: room.commands || {},
    game: normalizeGameState(room.game),
  };
}

function normalizeRoomMeta(meta) {
  if (!meta) {
    return null;
  }

  return {
    roomId: meta.roomId || "",
    hostPlayerId: meta.hostPlayerId || "",
    hostBrowserId: meta.hostBrowserId || "",
    godViewEnabled: Boolean(meta.godViewEnabled),
    rulesetId: normalizeFirebaseRulesetId(meta.rulesetId || DEFAULT_RULESET),
    createdAt: typeof meta.createdAt === "number" ? meta.createdAt : 0,
    updatedAt: typeof meta.updatedAt === "number" ? meta.updatedAt : 0,
    playerCount: typeof meta.playerCount === "number" ? meta.playerCount : 0,
    open: Boolean(meta.open),
    participants: meta.participants || {},
    seats: meta.seats || {},
    seatBrowserIds: meta.seatBrowserIds || {},
  };
}

function buildActivePlayers(players, meta) {
  const normalizedPlayers = players || {};
  if (!meta || !meta.seats) {
    return Object.values(normalizedPlayers).sort((left, right) => left.seat - right.seat);
  }

  return [0, 1]
    .map((seat) => {
      const playerId = getSeatValue(meta, seat);
      if (!playerId) {
        return null;
      }

      const player = normalizedPlayers[playerId];
      if (player) {
        return {
          ...player,
          id: player.id || playerId,
          seat,
        };
      }

      return {
        id: playerId,
        name: "",
        seat,
        joinedAt: 0,
      };
    })
    .filter(Boolean);
}

function getActivePlayers(room) {
  if (!room) {
    return [];
  }

  if (Array.isArray(room.activePlayers) && room.activePlayers.length) {
    return room.activePlayers;
  }

  return buildActivePlayers(room.players || {}, room.meta || null);
}

function isParticipant(meta, playerId) {
  return Boolean(meta && meta.participants && meta.participants[playerId]);
}

function getSeatForPlayer(meta, playerId) {
  if (!meta || !meta.seats) {
    return null;
  }

  if (meta.seats[0] === playerId || meta.seats["0"] === playerId) {
    return 0;
  }
  if (meta.seats[1] === playerId || meta.seats["1"] === playerId) {
    return 1;
  }
  return null;
}

function getSeatForBrowser(meta, browserId) {
  if (!meta || !meta.seatBrowserIds || !browserId) {
    return null;
  }

  if (meta.seatBrowserIds[0] === browserId || meta.seatBrowserIds["0"] === browserId) {
    return 0;
  }
  if (meta.seatBrowserIds[1] === browserId || meta.seatBrowserIds["1"] === browserId) {
    return 1;
  }
  return null;
}

function seatExists(meta, seat) {
  return Boolean(getSeatValue(meta, seat));
}

function getSeatValue(meta, seat) {
  if (!meta || !meta.seats) {
    return "";
  }

  return meta.seats[seat] || meta.seats[String(seat)] || "";
}

function countOccupiedSeats(seats) {
  return [0, 1].reduce((count, seat) => count + (seats && (seats[seat] || seats[String(seat)]) ? 1 : 0), 0);
}

function isRoomExpired(meta, now = Date.now()) {
  if (!meta || typeof meta.updatedAt !== "number" || meta.updatedAt <= 0) {
    return false;
  }

  return now - meta.updatedAt > ROOM_EXPIRATION_MS;
}

function getCommandRulesetId(command, fallbackRulesetId) {
  if (command && command.payload && command.payload.rulesetId) {
    return normalizeFirebaseRulesetId(command.payload.rulesetId);
  }
  return normalizeFirebaseRulesetId(fallbackRulesetId);
}

function getCommandTimestamp(command) {
  return command && typeof command.createdAt === "number" ? command.createdAt : 0;
}

function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).reduce((result, [key, item]) => {
      if (item !== undefined) {
        result[key] = stripUndefined(item);
      }
      return result;
    }, {});
  }

  return value;
}

export {
  buildActivePlayers,
  countOccupiedSeats,
  getActivePlayers,
  getCommandRulesetId,
  getCommandTimestamp,
  getSeatForBrowser,
  getSeatForPlayer,
  getSeatValue,
  isParticipant,
  isRoomExpired,
  normalizeRoom,
  normalizeRoomMeta,
  seatExists,
  stripUndefined,
};

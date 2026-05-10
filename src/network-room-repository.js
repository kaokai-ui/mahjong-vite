import { get, push, ref, remove, set } from "firebase/database";
import { formatFirebaseClientError } from "./network-client-errors.js";
import { getFirebaseDatabaseInstance } from "./network-firebase-runtime.js";
import { normalizeRoomMeta } from "./network-room-helpers.js";

function dbRef(path) {
  return ref(getFirebaseDatabaseInstance(), String(path || "").replace(/^\/+/, ""));
}

async function getValue(path) {
  return get(dbRef(path));
}

async function getRoomMeta(roomId) {
  const snapshot = await getValue(`roomMeta/${roomId}`);
  return normalizeRoomMeta(snapshot.val());
}

async function getRoomRecord(roomId) {
  return getValue(`rooms/${roomId}`);
}

async function writeInitialRoomRecord(roomId, roomData) {
  await setWithContext(`rooms/${roomId}`, roomData);
}

async function writeHostGameState(roomId, { game, rulesetId, updatedAt, lastError }) {
  if (game !== undefined) {
    await setWithContext(`rooms/${roomId}/game`, game);
  }
  if (rulesetId !== undefined) {
    await setWithContext(`rooms/${roomId}/rulesetId`, rulesetId);
    await setWithContext(`roomMeta/${roomId}/rulesetId`, rulesetId);
  }
  if (updatedAt !== undefined) {
    await setWithContext(`rooms/${roomId}/updatedAt`, updatedAt);
  }
  await setWithContext(`rooms/${roomId}/lastError`, lastError === undefined ? null : lastError);
}

async function setWithContext(path, value) {
  try {
    await set(dbRef(path), value);
  } catch (error) {
    throw new Error(`${path}：${formatFirebaseClientError(error)}`);
  }
}

async function pushRoomCommand(roomId, command) {
  try {
    await push(dbRef(`rooms/${roomId}/commands`), command);
  } catch (error) {
    throw new Error(formatFirebaseClientError(error));
  }
}

async function removeRoomCommand(roomId, key) {
  if (!roomId || !key) {
    return;
  }

  try {
    await remove(dbRef(`rooms/${roomId}/commands/${key}`));
  } catch (error) {
    throw new Error(formatFirebaseClientError(error));
  }
}

export {
  dbRef,
  getRoomMeta,
  getRoomRecord,
  getValue,
  pushRoomCommand,
  removeRoomCommand,
  setWithContext,
  writeHostGameState,
  writeInitialRoomRecord,
};

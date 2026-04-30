import {
  emitNetworkStatus,
  ensureNetworkControllerReady,
  getNetworkIdentity,
  getNetworkSetupState,
  initNetworkController,
  isNetworkControllerHost,
  setNetworkPlayerName,
} from "./network-controller-session.js";
import { sendNetworkGameCommand } from "./network-command-runtime.js";
import {
  createNetworkRoom,
  joinNetworkRoom,
  reclaimNetworkSeat,
} from "./network-room-lifecycle.js";
import {
  emitCombinedRoomState,
  leaveSubscribedRoom,
  queuePendingRoomCommand,
  subscribeToRoomState,
} from "./network-room-subscription-runtime.js";

const COMMAND_TYPES = new Set([
  "startGame",
  "restartGame",
  "drawTile",
  "discardTile",
  "passClaim",
  "claimChow",
  "claimPung",
  "claimDiscardKong",
  "declareSelfDraw",
  "claimWin",
  "concealedKong",
  "addedKong",
]);

export class NetworkController {
  constructor({ onRoomChange, onInfo, onError, onStatusChange }) {
    this.onRoomChange = onRoomChange;
    this.onInfo = onInfo;
    this.onError = onError;
    this.onStatusChange = typeof onStatusChange === "function" ? onStatusChange : () => {};
    this.roomId = "";
    this.room = null;
    this.roomSnapshot = "";
    this.roomData = null;
    this.roomMeta = null;
    this.commandChain = Promise.resolve();
    this.processingCommand = false;
    this.roomUnsubscribe = null;
    this.roomMetaUnsubscribe = null;
  }

  async init() {
    return initNetworkController(this);
  }

  getIdentity() {
    return getNetworkIdentity();
  }

  getSetupState() {
    return getNetworkSetupState();
  }

  setPlayerName(playerName) {
    return setNetworkPlayerName(playerName);
  }

  async createRoom(options) {
    return createNetworkRoom(this, options);
  }

  async joinRoom({ roomId, playerName }) {
    return joinNetworkRoom(this, { roomId, playerName });
  }

  async reclaimSeat(roomId, meta, seat, playerName, identity) {
    return reclaimNetworkSeat(this, roomId, meta, seat, playerName, identity);
  }

  async sendGameCommand(type, payload = {}) {
    return sendNetworkGameCommand(this, type, payload, COMMAND_TYPES);
  }

  leaveRoom() {
    leaveSubscribedRoom(this);
  }

  isHost() {
    return isNetworkControllerHost(this);
  }

  subscribeToRoom(roomId) {
    subscribeToRoomState(this, roomId);
  }

  emitCombinedRoom() {
    emitCombinedRoomState(this);
  }

  queuePendingCommand() {
    queuePendingRoomCommand(this);
  }

  async ensureReady() {
    return ensureNetworkControllerReady(this);
  }

  emitStatus() {
    emitNetworkStatus(this);
  }

  normalizeRoomId(roomId) {
    return normalizeRoomId(roomId);
  }
}

export function normalizeRoomId(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export function createRandomRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

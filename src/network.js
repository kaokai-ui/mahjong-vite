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
import {
  FIREBASE_COMMAND_TYPE_SET,
  createRandomFirebaseRoomId,
  normalizeFirebaseRoomId,
} from "./firebase-rules-contract.js";

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
    this.lastRoomSnapshotAt = 0;
    this.lastRoomMetaSnapshotAt = 0;
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
    return sendNetworkGameCommand(this, type, payload);
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
    return normalizeFirebaseRoomId(roomId);
  }
}

export function normalizeRoomId(value) {
  return normalizeFirebaseRoomId(value);
}

export function createRandomRoomId() {
  return createRandomFirebaseRoomId();
}

export const NETWORK_COMMAND_TYPES = FIREBASE_COMMAND_TYPE_SET;

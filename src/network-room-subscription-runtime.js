import { onValue } from "firebase/database";
import { createPendingNetworkBotEntry } from "./network-bot-runtime.js";
import { formatFirebaseClientError } from "./network-client-errors.js";
import { getPendingCommands, processCommandEntry as processNetworkCommandEntry } from "./network-command-processor.js";
import { normalizeRoom, normalizeRoomMeta } from "./network-room-helpers.js";
import {
  dbRef,
  removeRoomCommand,
  writeHostGameState,
} from "./network-room-repository.js";

export function leaveSubscribedRoom(controller) {
  if (typeof controller.roomUnsubscribe === "function") {
    controller.roomUnsubscribe();
    controller.roomUnsubscribe = null;
  }
  if (typeof controller.roomMetaUnsubscribe === "function") {
    controller.roomMetaUnsubscribe();
    controller.roomMetaUnsubscribe = null;
  }

  controller.roomId = "";
  controller.room = null;
  controller.roomSnapshot = "";
  controller.roomData = null;
  controller.roomMeta = null;
  controller.processingCommand = false;
  controller.onRoomChange(null);
}

export function subscribeToRoomState(controller, roomId) {
  leaveSubscribedRoom(controller);
  controller.roomId = roomId;

  controller.roomMetaUnsubscribe = onValue(
    dbRef(`roomMeta/${roomId}`),
    (snapshot) => {
      controller.roomMeta = normalizeRoomMeta(snapshot.val());
      emitCombinedRoomState(controller);
    },
    (error) => {
      controller.onError(formatFirebaseClientError(error));
    },
  );

  controller.roomUnsubscribe = onValue(
    dbRef(`rooms/${roomId}`),
    (snapshot) => {
      controller.roomData = snapshot.val();
      emitCombinedRoomState(controller);
      queuePendingRoomCommand(controller);
    },
    (error) => {
      controller.onError(formatFirebaseClientError(error));
    },
  );
}

export function emitCombinedRoomState(controller) {
  const nextRoom = normalizeRoom(controller.roomData, controller.roomMeta);
  const nextSnapshot = JSON.stringify(nextRoom);
  const changed = nextSnapshot !== controller.roomSnapshot;

  controller.room = nextRoom;
  controller.roomSnapshot = nextSnapshot;

  if (changed) {
    controller.onRoomChange(controller.room);
  }
}

export function queuePendingRoomCommand(controller) {
  if (!controller.roomId || !controller.isHost() || controller.processingCommand) {
    return;
  }

  const pendingCommands = getPendingCommands(controller.room);
  const nextEntry = pendingCommands.length ? pendingCommands[0] : createPendingNetworkBotEntry(controller.room);
  if (!nextEntry) {
    return;
  }

  controller.processingCommand = true;
  controller.commandChain = controller.commandChain
    .then(() =>
      processNetworkCommandEntry({
        roomId: controller.roomId,
        room: controller.room,
        entry: nextEntry,
        repository: {
          removeRoomCommand,
          writeHostGameState,
        },
      }),
    )
    .catch((error) => {
      controller.onError(error.message);
    })
    .then(() => {
      controller.processingCommand = false;
      queuePendingRoomCommand(controller);
    });
}

import { processCommandEntry as processNetworkCommandEntry } from "./network-command-processor.js";
import { formatFirebaseClientError } from "./network-client-errors.js";
import { sanitizeCommandPayload } from "./network-room-helpers.js";
import {
  pushRoomCommand,
  removeRoomCommand,
  writeHostGameState,
} from "./network-room-repository.js";

const defaultNetworkCommandDependencies = {
  processCommandEntry: processNetworkCommandEntry,
  pushRoomCommand,
  removeRoomCommand,
  writeHostGameState,
};

export async function sendNetworkGameCommand(
  controller,
  type,
  payload = {},
  commandTypes,
  dependencies = defaultNetworkCommandDependencies,
) {
  try {
    await controller.ensureReady();
    if (!controller.roomId) {
      throw new Error("尚未加入房間。");
    }

    if (!commandTypes.has(type)) {
      throw new Error("未知的操作。");
    }

    const identity = controller.getIdentity();
    const sanitizedPayload = sanitizeCommandPayload(payload);
    const command = {
      type,
      fromPlayerId: identity.playerId,
      createdAt: Date.now(),
    };

    if (sanitizedPayload !== undefined) {
      command.payload = sanitizedPayload;
    }

    if (controller.isHost()) {
      await dependencies.processCommandEntry({
        roomId: controller.roomId,
        room: controller.room,
        entry: {
          key: null,
          command,
        },
        repository: {
          removeRoomCommand: dependencies.removeRoomCommand,
          writeHostGameState: dependencies.writeHostGameState,
        },
      });
      return;
    }

    await dependencies.pushRoomCommand(controller.roomId, command);
  } catch (error) {
    throw new Error(formatFirebaseClientError(error));
  }
}

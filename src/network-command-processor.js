import { applyGameCommand, createStartedGame } from "./game.js";
import { DEFAULT_RULESET } from "./rules.js";
import {
  getActivePlayers,
  getCommandRulesetId,
  getCommandTimestamp,
} from "./network-room-helpers.js";

function getPendingCommands(room) {
  const commands = (room && room.commands) || {};
  return Object.keys(commands)
    .map((key) => ({ key, command: commands[key] }))
    .sort((left, right) => getCommandTimestamp(left.command) - getCommandTimestamp(right.command));
}

async function processCommandEntry({ roomId, room, entry, repository }) {
  if (!roomId || !room) {
    return;
  }

  const { key, command } = entry || {};
  if (!command) {
    await repository.removeRoomCommand(roomId, key);
    return;
  }

  const players = getActivePlayers(room);
  const player = players.find((item) => item && item.id === command.fromPlayerId);
  if (!player) {
    await repository.removeRoomCommand(roomId, key);
    return;
  }

  let nextGame = null;
  let errorMessage = "";

  try {
    if (command.type === "startGame") {
      if ((Number(room.meta?.playerCount) || 0) < 2) {
        errorMessage = "兩位玩家都加入房間後才能開始對局。";
      } else if (room.game && room.game.status === "playing") {
        return;
      } else {
        nextGame = createStartedGame(
          getCommandRulesetId(command, room.rulesetId || DEFAULT_RULESET),
          room.game,
        );
      }
    } else {
      const result = applyGameCommand(room.game, {
        playerSeat: player.seat,
        type: command.type,
        payload: command.payload || {},
      });

      if (!result.ok) {
        errorMessage = result.message;
      } else {
        nextGame = result.game;
      }
    }

    if (nextGame) {
      await repository.writeHostGameState(roomId, {
        game: nextGame,
        rulesetId: nextGame.rulesetId,
        updatedAt: Date.now(),
        lastError: null,
      });
    } else if (errorMessage) {
      await repository.writeHostGameState(roomId, {
        updatedAt: Date.now(),
        lastError: {
          playerId: command.fromPlayerId,
          message: errorMessage,
          at: Date.now(),
        },
      });
    }
  } catch (error) {
    await repository.writeHostGameState(roomId, {
      updatedAt: Date.now(),
      lastError: {
        playerId: command.fromPlayerId,
        message: error.message || "處理指令時發生錯誤。",
        at: Date.now(),
      },
    });
    throw error;
  } finally {
    await repository.removeRoomCommand(roomId, key);
  }
}

export { getPendingCommands, processCommandEntry };

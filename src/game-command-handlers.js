import { GAME_KONG_COMMAND_HANDLERS } from "./game-kong-command-handlers.js";
import { GAME_RESPONSE_COMMAND_HANDLERS } from "./game-response-command-handlers.js";
import { GAME_TURN_COMMAND_HANDLERS } from "./game-turn-command-handlers.js";
import { GAME_WIN_COMMAND_HANDLERS } from "./game-win-command-handlers.js";

export const GAME_COMMAND_HANDLERS = {
  ...GAME_TURN_COMMAND_HANDLERS,
  ...GAME_RESPONSE_COMMAND_HANDLERS,
  ...GAME_KONG_COMMAND_HANDLERS,
  ...GAME_WIN_COMMAND_HANDLERS,
};

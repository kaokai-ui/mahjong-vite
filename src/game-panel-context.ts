import { getPlayerClientState } from "./game.js";
import { getPlayerById, getPlayers } from "./bridge-view-helpers";
import type { AppGameLike, AppGamePanelContext, AppPlayerLike, AppRoomLike, AppRoundStateLike } from "./runtime-shell-types";

type PlayerLike = AppPlayerLike;

type RoundStateLike = AppRoundStateLike;
type GameLike = AppGameLike;
type RoomLike = AppRoomLike;

type ClientStateLike = ReturnType<typeof getPlayerClientState>;

export type GamePanelContext = AppGamePanelContext;

const EMPTY_ROUND_STATE: RoundStateLike = {
  hand: [],
  melds: [],
  discards: [],
};

export function buildGamePanelContext({ room, playerId }: { room: RoomLike | null; playerId: string }): GamePanelContext | null {
  if (!room) {
    return null;
  }

  const players = getPlayers(room);
  const currentPlayer = getPlayerById(room, playerId);
  if (!currentPlayer) {
    return {
      room,
      players,
      currentPlayer: null,
      opponent: null,
    };
  }

  const seat = currentPlayer.seat;
  const opponent = players.find((player: PlayerLike) => player && player.seat !== seat) || null;
  const game = room.game || null;
  const showOpponentHand = Boolean(room.meta && room.meta.godViewEnabled && room.hostPlayerId === currentPlayer.id);
  const selfRoundState = getRoundState(game, seat);
  const opponentRoundState = getRoundState(game, opponent ? opponent.seat : 0);

  return {
    room,
    players,
    currentPlayer,
    seat,
    opponent,
    game,
    showOpponentHand,
    selfRoundState,
    opponentRoundState,
    clientState: getPlayerClientState(game, seat),
  };
}

function getRoundState(game: GameLike | null | undefined, seat: number | undefined) {
  if (!game || !Array.isArray(game.players) || typeof seat !== "number") {
    return EMPTY_ROUND_STATE;
  }

  return game.players[seat] || EMPTY_ROUND_STATE;
}

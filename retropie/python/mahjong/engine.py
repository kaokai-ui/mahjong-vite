"""Deterministic 2P/4P Mahjong engine for the RetroPie build.

The native build deliberately keeps the game state independent from Pygame so
that it can be checked on a development machine without a framebuffer.  Seat
0 is the human player and every other seat is an AI player.  A drawn tile is
kept in the hand and identified by ``last_draw``; the scene renders it
separately and the red 摸牌 key can discard that exact tile on the next press.

The first RetroPie release was 2P.  The same reducer now also supports a full
four-seat round (one human plus three AI players) without changing the public
command names used by the Pygame front end.
"""

from __future__ import annotations

import json
import random
import secrets
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .evaluator import evaluate_winning_hand
from .scoring import build_score_delta, evaluate_score
from .tiles import (
    can_claim_kong,
    can_claim_pung,
    count_tile_types,
    get_concealed_kong_types,
    get_chow_combos,
    get_tile_type,
    hand_without_tile,
    sort_tile_ids,
    tile_label,
    tiles_by_type,
)


GAME_ID_2P = "mahjong-retropie-2p"
GAME_ID_4P = "mahjong-retropie-4p"
# Keep the old public constant for callers that imported it from the 2P build.
GAME_ID = GAME_ID_2P
SCHEMA_VERSION = 1
DEFAULT_PLAYER_COUNT = 2
SUPPORTED_PLAYER_COUNTS = (2, 4)
# Keep this name as a compatibility export for the original 2P tests/tools.
PLAYER_COUNT = DEFAULT_PLAYER_COUNT
DEFAULT_SEED = 0x20260901
MAX_ROUNDS = 400


def create_player(seat: int, name: str) -> Dict[str, object]:
    return {
        "seat": seat,
        "name": name,
        "hand": [],
        "melds": [],
        "discards": [],
    }


def create_game_state(
    seed: Optional[int] = None,
    previous_state: Optional[Dict[str, object]] = None,
    player_count: int = DEFAULT_PLAYER_COUNT,
) -> Dict[str, object]:
    """Deal a fresh 2P or 4P round.

    The first round is dealer seat 0.  On subsequent rounds the winner becomes
    dealer, otherwise the previous dealer remains dealer.  ``seed`` is
    accepted for deterministic QA and headless smoke tests.  The deck and
    opening deal are the same full 136-tile ruleset in both modes.
    """

    count = _normalise_player_count(player_count)
    if seed is None:
        seed = secrets.randbelow(0x7FFFFFFF) + 1
    rng = random.Random(int(seed))
    deck = _build_deck(rng)
    names = _player_names(count)
    players = [create_player(seat, names[seat]) for seat in range(count)]

    for _ in range(13):
        for player in players:
            player["hand"].append(deck.pop())

    previous = previous_state or {}
    previous_winner = previous.get("winner_seat")
    previous_dealer = previous.get("dealer_seat", 0)
    dealer_source = previous_winner if previous_winner is not None else previous_dealer
    dealer_seat = _normalise_seat(dealer_source, count)
    dealer_tile = deck.pop()
    players[dealer_seat]["hand"].append(dealer_tile)
    for player in players:
        player["hand"] = sort_tile_ids(player["hand"])

    previous_wins = previous.get("win_counts") if isinstance(previous.get("win_counts"), list) else []
    previous_scores = previous.get("scores") if isinstance(previous.get("scores"), list) else []
    wins = [_safe_counter(previous_wins, seat) for seat in range(count)]
    scores = [_safe_counter(previous_scores, seat) for seat in range(count)]
    round_number = _safe_counter(previous, "round_number") + 1
    initial_phase = "discard" if dealer_seat == 0 else "bot_discard"
    initial_message = "輪到你出牌。按 A–M 出牌，或按摸牌丟出摸進牌。" if dealer_seat == 0 else "{}先手。".format(
        players[dealer_seat]["name"]
    )

    return {
        "schema_version": SCHEMA_VERSION,
        "game_id": _game_id_for_count(count),
        "status": "playing",
        "phase": initial_phase,
        "player_count": count,
        "players": players,
        "wall": deck,
        "dealer_seat": dealer_seat,
        "turn_seat": dealer_seat,
        "needs_draw": False,
        "round_number": round_number,
        "next_discard_id": 1,
        "next_meld_id": 1,
        "latest_discard": None,
        "last_draw": {"seat": dealer_seat, "tile_id": dealer_tile, "source": "live", "initial": True},
        "pending_claim": None,
        "winner_seat": None,
        "result": None,
        "win_counts": wins,
        "scores": scores,
        "message": initial_message,
        "action_log": ["{}P 對局開始。".format(count)],
        "seed": int(seed),
    }


def create_initial_state(
    seed: Optional[int] = None, player_count: int = DEFAULT_PLAYER_COUNT
) -> Dict[str, object]:
    return create_game_state(seed=seed, player_count=player_count)


def dispatch_round(state: Dict[str, object], command: Dict[str, object]) -> Dict[str, object]:
    """Apply one command and return a small result envelope.

    The state is intentionally mutated in place, just like the existing solo
    controller's reducer boundary.  Refused commands do not change gameplay
    state and return ``ok=False`` with a readable message for the scene.
    """

    if not isinstance(state, dict) or state.get("status") != "playing":
        return _failure("本局已結束。")
    command_type = command.get("type") if isinstance(command, dict) else ""
    seat = command.get("player_seat") if isinstance(command, dict) else None
    payload = command.get("payload") if isinstance(command, dict) else {}
    payload = payload if isinstance(payload, dict) else {}

    if command_type == "drawTile":
        return _draw_command(state, seat)
    if command_type == "discardTile":
        return _discard_command(state, seat, payload.get("tile_id"))
    if command_type == "declareSelfDraw":
        return _self_draw_command(state, seat)
    if command_type == "declareKong":
        return _declare_kong_command(state, seat, payload.get("tile_type"))
    if command_type == "claimWin":
        return _claim_win_command(state, seat)
    if command_type == "claimKong":
        return _claim_meld_command(state, seat, "kong")
    if command_type == "claimPung":
        return _claim_meld_command(state, seat, "pung")
    if command_type == "claimChow":
        return _claim_meld_command(state, seat, "chow", payload.get("needed_types"))
    if command_type == "passClaim":
        return _pass_claim_command(state, seat)
    return _failure("未知的操作。")


def draw_tile(state: Dict[str, object], seat: int, source: str = "live") -> Optional[str]:
    """Draw and expose one tile without starting a countdown."""

    players = state.get("players") or []
    try:
        seat_index = int(seat)
    except (TypeError, ValueError):
        return None
    if not 0 <= seat_index < len(players):
        return None
    if not state.get("wall"):
        finish_draw(state, "牌牆已摸完，流局。")
        return None
    tile_id = state["wall"].pop()
    player = players[seat_index]
    player["hand"] = sort_tile_ids(list(player.get("hand", [])) + [tile_id])
    state["last_draw"] = {"seat": seat_index, "tile_id": tile_id, "source": source}
    state["latest_discard"] = None
    state["needs_draw"] = False
    state["turn_seat"] = seat_index
    state["phase"] = "discard"
    state["message"] = "{}摸到 {}。".format(player["name"], tile_label(tile_id))
    _log(state, state["message"])
    return tile_id


def current_drawn_tile(state: Dict[str, object], seat: int = 0) -> Optional[str]:
    last_draw = state.get("last_draw") or {}
    tile_id = last_draw.get("tile_id")
    players = state.get("players") or []
    try:
        seat_index = int(seat)
    except (TypeError, ValueError):
        return None
    if not 0 <= seat_index < len(players):
        return None
    if last_draw.get("seat") != seat_index or tile_id not in players[seat_index].get("hand", []):
        return None
    return tile_id


def human_hand_tiles(state: Dict[str, object]) -> List[str]:
    players = state.get("players") or []
    if not players:
        return []
    human = players[0]
    return sort_tile_ids(hand_without_tile(human.get("hand", []), current_drawn_tile(state, 0)))


def get_human_claim_choices(state: Dict[str, object]) -> List[Dict[str, object]]:
    claim = state.get("pending_claim") or {}
    if state.get("phase") != "response" or claim.get("to_seat") != 0:
        return []
    choices: List[Dict[str, object]] = []
    if "win" in claim.get("options", []):
        choices.append({"type": "claimWin", "label": "胡"})
    if "kong" in claim.get("options", []):
        choices.append({"type": "claimKong", "label": "槓"})
    if "pung" in claim.get("options", []):
        choices.append({"type": "claimPung", "label": "碰"})
    if "chow" in claim.get("options", []):
        combos = claim.get("chow_combos") or []
        choices.append({"type": "claimChow", "label": "吃", "combo": combos[0] if combos else None})
    choices.append({"type": "passClaim", "label": "過"})
    return choices


def get_human_kong_types(state: Dict[str, object]) -> List[str]:
    """Return concealed-kong choices available after the human draws."""

    if state.get("phase") != "discard" or state.get("turn_seat") != 0 or not current_drawn_tile(state, 0):
        return []
    players = state.get("players") or []
    return get_concealed_kong_types(players[0].get("hand", [])) if players else []


def step_bot(state: Dict[str, object]) -> str:
    """Advance one visible AI action and stop at a human input point."""

    if state.get("status") != "playing":
        return "finished"
    phase = state.get("phase")
    seat = state.get("turn_seat")
    count = _state_player_count(state)
    if phase not in ("bot", "bot_discard") or not isinstance(seat, int) or not 1 <= seat < count:
        return "waiting"

    player = state["players"][seat]
    if phase == "bot":
        if state.get("needs_draw"):
            if draw_tile(state, seat) is None:
                return "finished"
            evaluation = evaluate_winning_hand(player.get("hand", []), player.get("melds", []))
            if evaluation["can_win"]:
                finish_win(state, seat, None, "selfDraw", (state.get("last_draw") or {}).get("tile_id"), evaluation)
                return "finished"
        state["phase"] = "bot_discard"
        state["turn_seat"] = seat
        state["message"] = "{}正在整理手牌。".format(player["name"])
        return "bot-drew"

    # A dealer starts with 14 tiles, so the same self-draw check also applies
    # before the first AI discard of a round.
    if current_drawn_tile(state, seat):
        evaluation = evaluate_winning_hand(player.get("hand", []), player.get("melds", []))
        if evaluation["can_win"]:
            finish_win(state, seat, None, "selfDraw", (state.get("last_draw") or {}).get("tile_id"), evaluation)
            return "finished"
    tile_id = choose_ai_discard(state, seat)
    if not tile_id:
        finish_draw(state, "{}無法出牌，流局。".format(player["name"]))
        return "finished"
    result = _discard_command(state, seat, tile_id)
    return "bot-discarded" if result["ok"] else "bot-error"


def advance_automatic(state: Dict[str, object], max_steps: int = 12) -> str:
    """Advance AI seats until the human needs to press a physical key."""

    for _ in range(max(1, int(max_steps))):
        if state.get("status") != "playing":
            return "finished"
        if state.get("phase") in ("bot", "bot_discard"):
            step_bot(state)
            continue
        return "human-input"
    return "bot-pending"


def choose_ai_discard(state: Dict[str, object], seat: int = 1) -> Optional[str]:
    players = state.get("players") or []
    try:
        seat_index = int(seat)
    except (TypeError, ValueError):
        return None
    if not 0 <= seat_index < len(players):
        return None
    player = players[seat_index]
    hand = list(player.get("hand", []))
    if not hand:
        return None
    counts = count_tile_types(hand)
    best_tile = hand[-1]
    best_value = float("inf")
    for tile_id in hand:
        tile_type = get_tile_type(tile_id)
        count = counts.get(tile_type, 0)
        value = 0.0
        if count == 1:
            value += 5.0 if not tile_type[:1] in ("m", "p", "s") else 3.0
        elif count == 2:
            value += 1.0
        elif count >= 3:
            value -= 5.0
        if tile_type[:1] in ("m", "p", "s"):
            rank = int(tile_type[1])
            suit = tile_type[0]
            if counts.get("{}{}".format(suit, rank - 1), 0):
                value -= 1.2
            if counts.get("{}{}".format(suit, rank + 1), 0):
                value -= 1.2
            if rank in (1, 9):
                value += 0.6
        if tile_id == (state.get("last_draw") or {}).get("tile_id"):
            value += 0.15
        if value < best_value:
            best_tile, best_value = tile_id, value
    return best_tile


def finish_win(
    state: Dict[str, object],
    winner_seat: int,
    loser_seat: Optional[int],
    win_kind: str,
    winning_tile_id: Optional[str],
    evaluation: Optional[Dict[str, object]] = None,
) -> None:
    winner = state["players"][winner_seat]
    evaluation = evaluation or evaluate_winning_hand(winner.get("hand", []), winner.get("melds", []))
    score_result = evaluate_score(
        winner.get("hand", []),
        winner.get("melds", []),
        win_kind=win_kind,
        winning_tile_id=winning_tile_id,
        last_draw_source=(state.get("last_draw") or {}).get("source", ""),
        additional_tile_id=winning_tile_id if win_kind == "discardWin" else None,
    )
    total_score = int(score_result.get("total_score", 0))
    count = _state_player_count(state)
    score_delta = build_score_delta(
        winner_seat,
        loser_seat,
        total_score,
        player_count=count,
        self_draw=win_kind == "selfDraw",
    )
    state["status"] = "finished"
    state["phase"] = "finished"
    state["winner_seat"] = winner_seat
    state["turn_seat"] = winner_seat
    state["pending_claim"] = None
    state["last_draw"] = None
    state["win_counts"] = _fit_counters(state.get("win_counts"), count)
    state["scores"] = _fit_counters(state.get("scores"), count)
    state["win_counts"][winner_seat] += 1
    state["scores"] = [state["scores"][seat] + score_delta[seat] for seat in range(count)]
    state["result"] = {
        "winner_seat": winner_seat,
        "loser_seat": loser_seat,
        "win_kind": win_kind,
        "winning_tile_id": winning_tile_id,
        "patterns": list(score_result.get("patterns") or evaluation.get("patterns") or []),
        "breakdown": list(score_result.get("breakdown") or []),
        "total_tai": int(score_result.get("total_tai", 0)),
        "round_score": total_score,
        "score_delta": score_delta,
    }
    state["message"] = "{}胡牌。".format(winner["name"])
    _log(state, state["message"])


def finish_draw(state: Dict[str, object], message: str) -> None:
    count = _state_player_count(state)
    state["status"] = "finished"
    state["phase"] = "finished"
    state["pending_claim"] = None
    state["winner_seat"] = None
    state["last_draw"] = None
    state["result"] = {
        "winner_seat": None,
        "loser_seat": None,
        "win_kind": "draw",
        "winning_tile_id": None,
        "patterns": [],
        "breakdown": [],
        "total_tai": 0,
        "round_score": 0,
        "score_delta": [0 for _ in range(count)],
    }
    state["message"] = message
    _log(state, message)


def serialize_state(state: Dict[str, object]) -> str:
    return json.dumps(state, ensure_ascii=False, separators=(",", ":"))


def deserialize_state(payload: str, fallback: Optional[Dict[str, object]] = None) -> Dict[str, object]:
    try:
        value = json.loads(payload)
    except (TypeError, ValueError):
        return fallback or create_game_state()
    if not _is_valid_state(value):
        return fallback or create_game_state()
    return value


def run_headless(seed: int = DEFAULT_SEED, player_count: int = DEFAULT_PLAYER_COUNT) -> Dict[str, object]:
    """Run a deterministic human/AI simulation until win or draw."""

    state = create_game_state(seed=seed, player_count=player_count)
    for _ in range(MAX_ROUNDS):
        if state["status"] != "playing":
            break
        phase = state.get("phase")
        if phase in ("bot", "bot_discard"):
            step_bot(state)
        elif phase == "draw" and state.get("turn_seat") == 0:
            draw_tile(state, 0)
        elif phase == "discard" and state.get("turn_seat") == 0:
            evaluation = evaluate_winning_hand(state["players"][0].get("hand", []), state["players"][0].get("melds", []))
            if evaluation["can_win"]:
                finish_win(state, 0, None, "selfDraw", (state.get("last_draw") or {}).get("tile_id"), evaluation)
            else:
                tile_id = choose_ai_discard(state, 0)
                if tile_id:
                    _discard_command(state, 0, tile_id)
                else:
                    finish_draw(state, "沒有可出的牌，流局。")
        elif phase == "response" and (state.get("pending_claim") or {}).get("to_seat") == 0:
            _pass_claim_command(state, 0)
        else:
            # The simulator should never wait on a bot-only claim state.  A
            # fallback here makes malformed custom fixtures terminate safely.
            finish_draw(state, "自動測試遇到未處理狀態，流局。")

    if state["status"] == "playing":
        finish_draw(state, "自動測試上限已到，流局。")
    result = state.get("result") or {}
    winner_seat = state.get("winner_seat")
    return {
        "round": state.get("round_number"),
        "player_count": state.get("player_count"),
        "wall_remaining": len(state.get("wall", [])),
        "outcome": result.get("win_kind", "draw"),
        "winner": state["players"][winner_seat]["name"] if winner_seat is not None else None,
    }


def _draw_command(state: Dict[str, object], seat: object) -> Dict[str, object]:
    if seat != state.get("turn_seat") or seat != 0 or state.get("phase") != "draw" or not state.get("needs_draw"):
        return _failure("現在不是你的摸牌階段。")
    if draw_tile(state, 0) is None:
        return _success(state)
    return _success(state)


def _discard_command(state: Dict[str, object], seat: object, tile_id: object) -> Dict[str, object]:
    count = _state_player_count(state)
    is_human = seat == 0
    is_bot = isinstance(seat, int) and 1 <= seat < count
    allowed_phase = state.get("phase") == "discard" if is_human else state.get("phase") == "bot_discard"
    if not is_human and not is_bot:
        return _failure("現在不能出牌。")
    if state.get("turn_seat") != seat or not allowed_phase:
        return _failure("現在不能出牌。")
    if not isinstance(tile_id, str):
        return _failure("請選擇一張牌。")
    player = state["players"][seat]
    if tile_id not in player.get("hand", []):
        return _failure("這張牌不在手牌中。")

    player["hand"].remove(tile_id)
    player["hand"] = sort_tile_ids(player["hand"])
    discard_record = {"id": state["next_discard_id"], "tile_id": tile_id, "seat": seat, "claimed": False}
    state["next_discard_id"] += 1
    player["discards"].append(discard_record)
    state["latest_discard"] = discard_record
    state["last_draw"] = None
    state["needs_draw"] = False
    _log(state, "{}打出 {}。".format(player["name"], tile_label(tile_id)))
    _resolve_after_discard(state, seat)
    return _success(state)


def _resolve_after_discard(state: Dict[str, object], discarder: int) -> None:
    """Resolve win/meld claims around a discard for any number of seats."""

    count = _state_player_count(state)
    next_seat = (discarder + 1) % count
    order = _seat_order_after(discarder, count)

    # Win has priority over melds.  For equal-priority claims, table order is
    # deterministic, which avoids random AI races and keeps QA reproducible.
    for option in ("win", "kong", "pung", "chow"):
        for target_seat in order:
            if option == "chow" and target_seat != next_seat:
                continue
            claim = _build_claim(state, target_seat, allow_chow=target_seat == next_seat)
            if option not in claim.get("options", []):
                continue
            if target_seat == 0:
                _open_human_claim(state, claim)
            else:
                _apply_bot_claim(state, target_seat, claim, option)
            return

    _advance_after_discard(state, discarder)


def _open_human_claim(state: Dict[str, object], claim: Dict[str, object]) -> None:
    state["phase"] = "response"
    state["turn_seat"] = 0
    state["needs_draw"] = False
    state["pending_claim"] = claim
    labels = {"win": "胡", "kong": "槓", "pung": "碰", "chow": "吃"}
    options = "、".join(labels[item] for item in claim.get("options", []))
    from_seat = claim.get("from_seat")
    from_name = state["players"][from_seat]["name"] if isinstance(from_seat, int) else "對手"
    state["message"] = "{}打出 {}，你可以{}；按小鍵過。".format(
        from_name, tile_label(claim.get("tile_id")), options
    )


def _apply_bot_claim(state: Dict[str, object], seat: int, claim: Dict[str, object], meld_type: str) -> None:
    player = state["players"][seat]
    if meld_type == "win":
        evaluation = evaluate_winning_hand(
            player.get("hand", []), player.get("melds", []), additional_tile_id=claim.get("tile_id")
        )
        finish_win(state, seat, claim.get("from_seat"), "discardWin", claim.get("tile_id"), evaluation)
        return
    _apply_claim_meld(state, seat, claim, meld_type)
    if meld_type == "kong":
        state["phase"] = "bot"
        state["turn_seat"] = seat
        state["needs_draw"] = True
        state["message"] = "{}槓牌，準備摸補牌。".format(player["name"])
    else:
        state["phase"] = "bot_discard"
        state["turn_seat"] = seat
        state["needs_draw"] = False
        state["message"] = "{}{}，準備出牌。".format(player["name"], "碰牌" if meld_type == "pung" else "吃牌")


def _advance_after_discard(state: Dict[str, object], discarder: int) -> None:
    count = _state_player_count(state)
    next_seat = (discarder + 1) % count
    state["pending_claim"] = None
    state["turn_seat"] = next_seat
    state["needs_draw"] = True
    if next_seat == 0:
        state["phase"] = "draw"
        state["message"] = "輪到你摸牌。"
    else:
        state["phase"] = "bot"
        state["message"] = "{}摸牌中。".format(state["players"][next_seat]["name"])


def _build_claim(state: Dict[str, object], target_seat: int, allow_chow: bool = True) -> Dict[str, object]:
    latest = state.get("latest_discard") or {}
    tile_id = latest.get("tile_id")
    players = state.get("players") or []
    if not 0 <= target_seat < len(players):
        return {"kind": "discard", "options": []}
    player = players[target_seat]
    options: List[str] = []
    if tile_id and evaluate_winning_hand(
        player.get("hand", []), player.get("melds", []), additional_tile_id=tile_id
    )["can_win"]:
        options.append("win")
    if tile_id and can_claim_kong(player.get("hand", []), tile_id):
        options.append("kong")
    if tile_id and can_claim_pung(player.get("hand", []), tile_id):
        options.append("pung")
    chow_combos = get_chow_combos(player.get("hand", []), tile_id) if tile_id and allow_chow else []
    if chow_combos:
        options.append("chow")
    return {
        "kind": "discard",
        "from_seat": latest.get("seat"),
        "to_seat": target_seat,
        "discard_id": latest.get("id"),
        "tile_id": tile_id,
        "options": options,
        "chow_combos": chow_combos,
    }


def _declare_kong_command(state: Dict[str, object], seat: object, tile_type: object) -> Dict[str, object]:
    if seat != 0 or state.get("phase") != "discard" or state.get("turn_seat") != 0:
        return _failure("現在不能槓牌。")
    available_types = get_human_kong_types(state)
    if not available_types:
        return _failure("目前沒有可暗槓的牌。")
    selected_type = str(tile_type) if tile_type in available_types else available_types[0]
    player = state["players"][0]
    used_ids = tiles_by_type(player.get("hand", []), selected_type, 4)
    if len(used_ids) != 4:
        return _failure("這組牌不能暗槓。")
    for used_id in used_ids:
        player["hand"].remove(used_id)
    player["hand"] = sort_tile_ids(player["hand"])
    player["melds"].append(
        {
            "id": state["next_meld_id"],
            "type": "kong",
            "concealed": True,
            "tile_type": selected_type,
            "tiles": used_ids,
            "from_seat": None,
        }
    )
    state["next_meld_id"] += 1
    state["latest_discard"] = None
    state["last_draw"] = None
    state["pending_claim"] = None
    state["needs_draw"] = True
    state["turn_seat"] = 0
    state["phase"] = "draw"
    state["message"] = "你暗槓了 {}，請摸補牌。".format(tile_label(selected_type))
    _log(state, state["message"])
    return _success(state)


def _self_draw_command(state: Dict[str, object], seat: object) -> Dict[str, object]:
    if seat != 0 or state.get("phase") != "discard" or state.get("turn_seat") != 0:
        return _failure("現在不能胡牌。")
    player = state["players"][0]
    evaluation = evaluate_winning_hand(player.get("hand", []), player.get("melds", []))
    if not evaluation["can_win"]:
        return _failure("目前還不能胡牌。")
    finish_win(state, 0, None, "selfDraw", (state.get("last_draw") or {}).get("tile_id"), evaluation)
    return _success(state)


def _claim_win_command(state: Dict[str, object], seat: object) -> Dict[str, object]:
    if seat != 0 or state.get("phase") != "response":
        return _failure("現在沒有可胡的牌。")
    claim = state.get("pending_claim") or {}
    if claim.get("to_seat") != 0 or "win" not in claim.get("options", []):
        return _failure("這張牌不能胡。")
    player = state["players"][0]
    evaluation = evaluate_winning_hand(
        player.get("hand", []), player.get("melds", []), additional_tile_id=claim.get("tile_id")
    )
    if not evaluation["can_win"]:
        return _failure("這張牌沒有完成胡牌。")
    _mark_latest_claimed(state)
    finish_win(state, 0, claim.get("from_seat"), "discardWin", claim.get("tile_id"), evaluation)
    return _success(state)


def _claim_meld_command(
    state: Dict[str, object], seat: object, meld_type: str, needed_types: object = None
) -> Dict[str, object]:
    if seat != 0 or state.get("phase") != "response":
        return _failure("現在不能吃碰槓。")
    claim = state.get("pending_claim") or {}
    if claim.get("to_seat") != 0 or meld_type not in claim.get("options", []):
        return _failure("目前沒有這個操作。")
    if meld_type == "chow" and needed_types:
        combo = next((item for item in claim.get("chow_combos", []) if item.get("needed_types") == needed_types), None)
        if combo is None:
            return _failure("指定的吃牌組合不存在。")
        claim = dict(claim)
        claim["selected_combo"] = combo
    _apply_claim_meld(state, 0, claim, meld_type)
    return _success(state)


def _pass_claim_command(state: Dict[str, object], seat: object) -> Dict[str, object]:
    if seat != 0 or state.get("phase") != "response" or (state.get("pending_claim") or {}).get("to_seat") != 0:
        return _failure("現在沒有要過的牌。")
    claim = state.get("pending_claim") or {}
    from_seat = claim.get("from_seat")
    state["pending_claim"] = None
    state["latest_discard"] = None
    if not isinstance(from_seat, int):
        return _failure("找不到這張棄牌的來源。")
    _advance_after_discard(state, from_seat)
    state["message"] = "你選擇過牌，{}。".format(
        "輪到你摸牌" if state.get("turn_seat") == 0 else "{}摸牌中".format(state["players"][state["turn_seat"]]["name"])
    )
    _log(state, state["message"])
    return _success(state)


def _apply_claim_meld(state: Dict[str, object], seat: int, claim: Dict[str, object], meld_type: str) -> None:
    player = state["players"][seat]
    tile_id = claim.get("tile_id")
    tile_type = get_tile_type(tile_id)
    if meld_type == "pung":
        used_ids = tiles_by_type(player.get("hand", []), tile_type, 2)
        meld_tiles = used_ids + [tile_id]
        label = "碰"
    elif meld_type == "kong":
        used_ids = tiles_by_type(player.get("hand", []), tile_type, 3)
        meld_tiles = used_ids + [tile_id]
        label = "槓"
    else:
        combo = claim.get("selected_combo") or (claim.get("chow_combos") or [])[0]
        needed_types = list(combo.get("needed_types", []))
        used_ids = []
        remaining = list(player.get("hand", []))
        for needed_type in needed_types:
            matching = next((candidate for candidate in remaining if get_tile_type(candidate) == needed_type), None)
            if matching:
                used_ids.append(matching)
                remaining.remove(matching)
        meld_tiles = used_ids + [tile_id]
        tile_type = combo.get("sequence", [tile_type])[0]
        label = "吃"
    for used_id in used_ids:
        if used_id in player["hand"]:
            player["hand"].remove(used_id)
    player["hand"] = sort_tile_ids(player["hand"])
    player["melds"].append(
        {
            "id": state["next_meld_id"],
            "type": meld_type,
            "concealed": False,
            "tile_type": tile_type,
            "tiles": meld_tiles,
            "from_seat": claim.get("from_seat"),
        }
    )
    state["next_meld_id"] += 1
    _mark_latest_claimed(state)
    state["pending_claim"] = None
    state["latest_discard"] = None
    state["last_draw"] = None
    state["needs_draw"] = meld_type == "kong"
    state["turn_seat"] = seat
    state["phase"] = "draw" if meld_type == "kong" and seat == 0 else (
        "bot" if meld_type == "kong" else ("discard" if seat == 0 else "bot_discard")
    )
    state["message"] = "{}{}了 {}，{}。".format(
        player["name"],
        label,
        tile_label(tile_id),
        "請摸補牌" if meld_type == "kong" else "請出牌",
    )
    _log(state, state["message"])


def _mark_latest_claimed(state: Dict[str, object]) -> None:
    latest = state.get("latest_discard") or {}
    for player in state.get("players", []):
        for discard in player.get("discards", []):
            if discard.get("id") == latest.get("id"):
                discard["claimed"] = True
                return


def _build_deck(rng: random.Random) -> List[str]:
    from .tiles import TILE_TYPES

    deck = ["{}-{}".format(tile_type, copy_index) for tile_type in TILE_TYPES for copy_index in range(1, 5)]
    rng.shuffle(deck)
    return deck


def _player_names(player_count: int) -> Tuple[str, ...]:
    if player_count == 4:
        # Seat order is clockwise from the human: 下家、對家、上家.
        return ("你", "下家", "對家", "上家")
    return ("你", "電腦")


def _game_id_for_count(player_count: int) -> str:
    return GAME_ID_4P if player_count == 4 else GAME_ID_2P


def _normalise_player_count(value: object) -> int:
    try:
        value = int(value)
    except (TypeError, ValueError):
        return DEFAULT_PLAYER_COUNT
    return value if value in SUPPORTED_PLAYER_COUNTS else DEFAULT_PLAYER_COUNT


def _state_player_count(state: Dict[str, object]) -> int:
    players = state.get("players")
    if isinstance(players, list) and len(players) in SUPPORTED_PLAYER_COUNTS:
        return len(players)
    return _normalise_player_count(state.get("player_count", DEFAULT_PLAYER_COUNT))


def _seat_order_after(discarder: int, player_count: int) -> List[int]:
    return [(discarder + offset) % player_count for offset in range(1, player_count)]


def _normalise_seat(value: object, player_count: int = DEFAULT_PLAYER_COUNT) -> int:
    count = _normalise_player_count(player_count)
    try:
        return int(value) % count
    except (TypeError, ValueError):
        return 0


def _safe_counter(source: object, index: object) -> int:
    try:
        value = source[index] if isinstance(source, (list, tuple)) else source.get(index, 0)
        return max(0, int(value))
    except (AttributeError, IndexError, TypeError, ValueError):
        return 0


def _fit_counters(source: object, count: int) -> List[int]:
    return [_safe_counter(source, seat) for seat in range(count)]


def _log(state: Dict[str, object], message: str) -> None:
    state.setdefault("action_log", []).append(message)
    if len(state["action_log"]) > 120:
        del state["action_log"][:-120]


def _success(state: Dict[str, object]) -> Dict[str, object]:
    return {"ok": True, "state": state, "message": ""}


def _failure(message: str) -> Dict[str, object]:
    return {"ok": False, "state": None, "message": message}


def _is_valid_state(value: object) -> bool:
    if not isinstance(value, dict) or value.get("schema_version") != SCHEMA_VERSION:
        return False
    if value.get("game_id") not in (GAME_ID_2P, GAME_ID_4P):
        return False
    if value.get("status") not in ("playing", "finished") or not isinstance(value.get("players"), list):
        return False
    players = value["players"]
    count = len(players)
    if count not in SUPPORTED_PLAYER_COUNTS or value.get("player_count", count) != count:
        return False
    if not isinstance(value.get("wall"), list):
        return False
    if not isinstance(value.get("scores", []), list) or not isinstance(value.get("win_counts", []), list):
        return False
    if len(value.get("scores", [])) != count or len(value.get("win_counts", [])) != count:
        return False
    return all(
        isinstance(player, dict)
        and isinstance(player.get("hand"), list)
        and isinstance(player.get("melds"), list)
        and isinstance(player.get("discards"), list)
        for player in players
    )

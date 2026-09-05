"""Profile-aware Mahjong AI for the native RetroPie engine.

The Web game has four solo difficulty levels for the RetroPie menu: easy,
normal, hard, and god.  This module keeps the same strategy shape while using
bounded, Python 3.7-compatible calculations for the Pi Zero 2 W:

* easy uses the simple isolated-tile heuristic;
* normal evaluates hand structure and shanten;
* hard adds visible-tile availability, effective draws, table pressure, and
 discard risk;
* god evaluates the hard candidates and adds one bounded look-ahead layer.

The evaluator never reads concealed opponent hands.  Only the current AI's
hand, public discards, and public melds are used.  The god profile has a
deadline and safely falls back to its hard candidate if the Pi is busy.
"""

from __future__ import annotations

import functools
import time
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .tiles import (
    HONORS,
    TILE_TYPES,
    count_tile_types,
    get_tile_rank,
    get_tile_suit,
    get_tile_type,
    is_honor_tile,
    is_suit_tile,
)


AI_DIFFICULTIES = ("easy", "normal", "hard", "god")
DEFAULT_AI_DIFFICULTY = "hard"
MIXED_AI_DIFFICULTY = "mixed"

# The default Web 4P solo profile order is kept for the native 4P table:
# seat 1 is the next player, seat 2 is the opposite player, and seat 3 is the
# previous player around the table.
FOUR_PLAYER_AI_DIFFICULTIES = {
    1: "god",
    2: "normal",
    3: "hard",
}

DIFFICULTY_PROFILES = {
    "easy": {
        "id": "easy",
        "advanced": False,
        "lookahead": False,
        "action_threshold": 0.0,
        "attack_factor": 1.0,
        "risk_multiplier": 1.0,
        "exposure_penalty": 0.0,
        "lookahead_weight": 0.0,
        "lookahead_candidate_limit": 0,
        "lookahead_draw_limit": 0,
        "candidate_limit": 0,
        "future_draw_limit": 0,
        "time_budget_ms": 0.0,
        "value_weight": 0.0,
    },
    "normal": {
        "id": "normal",
        "advanced": False,
        "lookahead": False,
        "action_threshold": 12.0,
        "attack_factor": 1.0,
        "risk_multiplier": 1.0,
        "exposure_penalty": 18.0,
        "lookahead_weight": 0.0,
        "lookahead_candidate_limit": 0,
        "lookahead_draw_limit": 0,
        "candidate_limit": 0,
        "future_draw_limit": 0,
        "time_budget_ms": 0.0,
        "value_weight": 0.0,
    },
    "hard": {
        "id": "hard",
        "advanced": True,
        "lookahead": False,
        "action_threshold": 7.0,
        "attack_factor": 1.07,
        "risk_multiplier": 0.90,
        "exposure_penalty": 18.0,
        "lookahead_weight": 0.0,
        "lookahead_candidate_limit": 0,
        "lookahead_draw_limit": 0,
        "candidate_limit": 7,
        "future_draw_limit": 16,
        "time_budget_ms": 180.0,
        "value_weight": 0.28,
    },
    "god": {
        "id": "god",
        "advanced": True,
        "lookahead": True,
        "action_threshold": 6.0,
        "attack_factor": 1.14,
        "risk_multiplier": 0.78,
        "exposure_penalty": 30.0,
        "lookahead_weight": 1.55,
        "lookahead_candidate_limit": 3,
        "lookahead_draw_limit": 2,
        "candidate_limit": 5,
        "future_draw_limit": 14,
        "time_budget_ms": 180.0,
        "value_weight": 1.12,
    },
}

_TILE_INDEX = {tile_type: index for index, tile_type in enumerate(TILE_TYPES)}
_SUITS = ("m", "p", "s")


def normalize_ai_difficulty(value: object, player_count: int = 2) -> str:
    """Normalize a saved, menu, or CLI profile for a 2P/4P round."""

    if value in AI_DIFFICULTIES:
        return str(value)
    if value == MIXED_AI_DIFFICULTY and int(player_count) == 4:
        return MIXED_AI_DIFFICULTY
    return MIXED_AI_DIFFICULTY if int(player_count) == 4 else DEFAULT_AI_DIFFICULTY


def get_ai_difficulty(state: Dict[str, object], seat: int) -> str:
    """Return the effective profile for a seat in a 2P or 4P state."""

    players = state.get("players") or []
    player_count = len(players) if len(players) in (2, 4) else int(state.get("player_count", 2) or 2)
    configured = normalize_ai_difficulty(state.get("ai_difficulty"), player_count)
    if player_count == 4 and configured == MIXED_AI_DIFFICULTY:
        return FOUR_PLAYER_AI_DIFFICULTIES.get(int(seat), DEFAULT_AI_DIFFICULTY)
    return configured if configured in AI_DIFFICULTIES else DEFAULT_AI_DIFFICULTY


def get_difficulty_profile(difficulty: object) -> Dict[str, object]:
    normalized = str(difficulty) if difficulty in DIFFICULTY_PROFILES else DEFAULT_AI_DIFFICULTY
    return DIFFICULTY_PROFILES[normalized]


def create_analysis_cache() -> Dict[str, object]:
    """Create per-decision caches so a single discard is analyzed once."""

    return {
        "progress": {},
        "advanced": {},
        "visible": {},
        "availability": {},
        "risk": {},
    }


def _count_vector(tile_ids: Iterable[str]) -> Tuple[int, ...]:
    counts = [0] * len(TILE_TYPES)
    for tile_id in tile_ids or []:
        index = _TILE_INDEX.get(get_tile_type(tile_id))
        if index is not None:
            counts[index] += 1
    return tuple(counts)


def _structure_key(structure: Tuple[int, int, int, int], locked_melds: int) -> Tuple[int, int, int, int, int]:
    melds = min(4, int(locked_melds) + structure[0])
    taatsu = min(structure[1], max(0, 4 - melds))
    pair = structure[2]
    shanten = max(0, 8 - melds * 2 - taatsu - pair)
    return (shanten, -melds, -taatsu, -pair, structure[3])


def _add_structure(structure: Tuple[int, int, int, int], melds: int = 0, taatsu: int = 0, isolated: int = 0):
    return (structure[0] + melds, structure[1] + taatsu, structure[2], structure[3] + isolated)


@functools.lru_cache(maxsize=30000)
def _search_best_structure(
    vector: Tuple[int, ...], pair_used: bool, locked_melds: int
) -> Tuple[int, int, int, int]:
    """Find the best meld/taatsu/pair decomposition for a tile-count vector."""

    index = -1
    for candidate_index, count in enumerate(vector):
        if count > 0:
            index = candidate_index
            break
    if index < 0:
        return (0, 0, 1 if pair_used else 0, 0)

    candidates = []
    count = vector[index]

    def recurse(indexes: Sequence[int], pair_flag: bool = pair_used, meld_delta: int = 0, taatsu_delta: int = 0, isolated_delta: int = 0):
        next_vector = list(vector)
        for remove_index in indexes:
            next_vector[remove_index] -= 1
        result = _search_best_structure(tuple(next_vector), pair_flag, locked_melds)
        candidates.append(_add_structure(result, meld_delta, taatsu_delta, isolated_delta))

    if count >= 3:
        recurse((index, index, index), meld_delta=1)

    if index < 27:
        rank = index % 9 + 1
        if rank <= 7 and vector[index + 1] > 0 and vector[index + 2] > 0:
            recurse((index, index + 1, index + 2), meld_delta=1)

    if count >= 2:
        if not pair_used:
            recurse((index, index), pair_flag=True)
        recurse((index, index), taatsu_delta=1)

    if index < 27:
        rank = index % 9 + 1
        if rank <= 8 and vector[index + 1] > 0:
            recurse((index, index + 1), taatsu_delta=1)
        if rank <= 7 and vector[index + 2] > 0:
            recurse((index, index + 2), taatsu_delta=1)

    recurse((index,), isolated_delta=1)

    return min(candidates, key=lambda item: _structure_key(item, locked_melds))


def _score_connections(counts: Dict[str, int]) -> float:
    score = 0.0
    for tile_type, count in counts.items():
        if not count:
            continue
        if is_honor_tile(tile_type):
            if count >= 2:
                score += 8.0
            continue
        suit = get_tile_suit(tile_type)
        rank = get_tile_rank(tile_type)
        if rank is None:
            continue
        left_one = counts.get("{}{}".format(suit, rank - 1), 0)
        right_one = counts.get("{}{}".format(suit, rank + 1), 0)
        left_two = counts.get("{}{}".format(suit, rank - 2), 0)
        right_two = counts.get("{}{}".format(suit, rank + 2), 0)
        score += min(count, 2) * 2.0
        score += (left_one + right_one) * 4.0
        score += (left_two + right_two) * 2.0
        if 3 <= rank <= 7 and left_one > 0 and right_one > 0:
            score += 6.0
    return score


def evaluate_hand_progress(
    hand_tile_ids: Sequence[str], locked_melds: int = 0, cache: Optional[Dict[object, object]] = None
) -> Dict[str, object]:
    """Return the Web-style structure/shanten summary for a concealed hand."""

    vector = _count_vector(hand_tile_ids)
    cache_key = (int(locked_melds), vector)
    if cache is not None and cache_key in cache:
        return cache[cache_key]
    counts = {tile_type: vector[index] for index, tile_type in enumerate(TILE_TYPES) if vector[index]}
    structure = _search_best_structure(vector, False, int(locked_melds))
    melds = min(4, int(locked_melds) + structure[0])
    useful_taatsu = min(structure[1], max(0, 4 - melds))
    pair = structure[2]
    shanten = max(0, 8 - melds * 2 - useful_taatsu - pair)
    floating = max(0, len(hand_tile_ids or []) - structure[0] * 3 - useful_taatsu * 2 - pair * 2)
    score = (
        melds * 120.0
        + useful_taatsu * 34.0
        + pair * 20.0
        - shanten * 180.0
        - floating * 7.0
        - structure[3] * 4.0
        + _score_connections(counts)
    )
    result = {
        "shanten": shanten,
        "melds": melds,
        "taatsu": useful_taatsu,
        "pair": pair,
        "floating": floating,
        "isolated": structure[3],
        "score": score,
    }
    if cache is not None:
        cache[cache_key] = result
    return result


def score_discard_tile(tile_id: str, counts: Dict[str, int]) -> float:
    """Return the Web simple-discard bias (higher means safer to discard)."""

    tile_type = get_tile_type(tile_id)
    duplicates = counts.get(tile_type, 0)
    if is_honor_tile(tile_type):
        score = 12.0
        if duplicates >= 2:
            score -= 8.0
        if duplicates >= 3:
            score -= 2.0
        return score

    suit = get_tile_suit(tile_type)
    rank = get_tile_rank(tile_type)
    if rank is None:
        return 12.0
    left_one = counts.get("{}{}".format(suit, rank - 1), 0)
    right_one = counts.get("{}{}".format(suit, rank + 1), 0)
    left_two = counts.get("{}{}".format(suit, rank - 2), 0)
    right_two = counts.get("{}{}".format(suit, rank + 2), 0)
    score = 0.0
    if duplicates == 1:
        score += 4.0
    elif duplicates == 2:
        score -= 4.0
    elif duplicates >= 3:
        score -= 7.0
    if rank in (1, 9):
        score += 4.0
    elif rank in (2, 8):
        score += 2.0
    score -= (left_one + right_one) * 3.0
    score -= (left_two + right_two) * 1.0
    if not any((left_one, right_one, left_two, right_two)):
        score += 3.0
    if 3 <= rank <= 7 and left_one > 0 and right_one > 0:
        score -= 2.0
    return score


def _choose_easy_discard(state: Dict[str, object], seat: int, hand: Sequence[str]) -> Optional[str]:
    """Choose with the original low-cost RetroPie/Web simple heuristic."""

    counts = count_tile_types(hand or [])
    last_draw = (state.get("last_draw") or {}).get("tile_id")
    best_tile = hand[-1] if hand else None
    best_value = float("inf")
    for tile_id in hand or []:
        tile_type = get_tile_type(tile_id)
        count = counts.get(tile_type, 0)
        value = 0.0
        if count == 1:
            value += 3.0 if is_suit_tile(tile_type) else 5.0
        elif count == 2:
            value += 1.0
        elif count >= 3:
            value -= 5.0
        if is_suit_tile(tile_type):
            rank = get_tile_rank(tile_type)
            suit = get_tile_suit(tile_type)
            if rank is not None:
                if counts.get("{}{}".format(suit, rank - 1), 0):
                    value -= 1.2
                if counts.get("{}{}".format(suit, rank + 1), 0):
                    value -= 1.2
                if rank in (1, 9):
                    value += 0.6
        if tile_id == last_draw:
            value += 0.15
        if value < best_value:
            best_tile, best_value = tile_id, value
    return best_tile


def _remove_one(tile_ids: Sequence[str], tile_id: str) -> List[str]:
    remaining = list(tile_ids or [])
    try:
        remaining.remove(tile_id)
    except ValueError:
        pass
    return remaining


def _candidate_tile_ids(tile_ids: Sequence[str]) -> List[str]:
    seen = set()
    result = []
    for tile_id in tile_ids or []:
        tile_type = get_tile_type(tile_id)
        if tile_type in seen:
            continue
        seen.add(tile_type)
        result.append(tile_id)
    return result


def _visible_counts(
    state: Dict[str, object],
    seat: int,
    hand_tile_ids: Sequence[str],
    extra_visible_types: Sequence[str],
    cache: Dict[str, object],
) -> Dict[str, int]:
    players = state.get("players") or []
    round_number = state.get("round_number", 0)
    discard_id = state.get("next_discard_id", 0)
    cache_key = (
        int(seat),
        int(round_number or 0),
        int(discard_id or 0),
        _count_vector(hand_tile_ids),
        tuple(sorted(get_tile_type(value) for value in extra_visible_types or [])),
    )
    visible_cache = cache.setdefault("visible", {})
    if cache_key in visible_cache:
        return visible_cache[cache_key]

    counts: Dict[str, int] = {}
    for player in players:
        for discard in player.get("discards", []) if isinstance(player, dict) else []:
            tile_id = discard.get("tile_id") if isinstance(discard, dict) else discard
            tile_type = get_tile_type(tile_id)
            if tile_type:
                counts[tile_type] = counts.get(tile_type, 0) + 1
        for meld in player.get("melds", []) if isinstance(player, dict) else []:
            for tile_id in meld.get("tiles", []) if isinstance(meld, dict) else []:
                tile_type = get_tile_type(tile_id)
                if tile_type:
                    counts[tile_type] = counts.get(tile_type, 0) + 1
    for tile_id in hand_tile_ids or []:
        tile_type = get_tile_type(tile_id)
        if tile_type:
            counts[tile_type] = counts.get(tile_type, 0) + 1
    for tile_id in extra_visible_types or []:
        tile_type = get_tile_type(tile_id)
        if tile_type:
            counts[tile_type] = counts.get(tile_type, 0) + 1
    visible_cache[cache_key] = counts
    return counts


def _availability(
    state: Dict[str, object],
    seat: int,
    hand_tile_ids: Sequence[str],
    extra_visible_types: Sequence[str],
    cache: Dict[str, object],
) -> Dict[str, int]:
    visible = _visible_counts(state, seat, hand_tile_ids, extra_visible_types, cache)
    key = (int(seat), tuple(sorted(visible.items())))
    availability_cache = cache.setdefault("availability", {})
    if key not in availability_cache:
        availability_cache[key] = {
            tile_type: max(0, 4 - visible.get(tile_type, 0)) for tile_type in TILE_TYPES
        }
    return availability_cache[key]


def _flexibility(hand_tile_ids: Sequence[str]) -> float:
    counts = count_tile_types(hand_tile_ids or [])
    score = 0.0
    for tile_type, count in counts.items():
        if is_honor_tile(tile_type):
            if count == 1:
                score -= 4.0
            elif count >= 2:
                score += 6.0
            continue
        rank = get_tile_rank(tile_type)
        if rank is None:
            continue
        if 3 <= rank <= 7:
            score += count * 2.0
        elif rank in (1, 9):
            score -= count
    return score


def _value_potential(hand_tile_ids: Sequence[str], locked_melds: int) -> float:
    """Small scoring-aware proxy for incomplete hands.

    The native scorer intentionally only scores completed hands.  This proxy
    gives hard/god a preference for completed honor triplets, pairs, and a
    coherent suit without pretending that an unfinished hand already has tai.
    """

    counts = count_tile_types(hand_tile_ids or [])
    value = 0.0
    suit_counts = {suit: 0 for suit in _SUITS}
    has_honors = False
    for tile_type, count in counts.items():
        if is_honor_tile(tile_type):
            has_honors = True
            if count >= 2:
                value += 7.0
            if count >= 3:
                value += 11.0
        else:
            suit = get_tile_suit(tile_type)
            suit_counts[suit] += count
            rank = get_tile_rank(tile_type)
            if rank in (1, 9) and count >= 2:
                value += 2.0
    largest_suit = max(suit_counts.values()) if suit_counts else 0
    if largest_suit >= 7:
        value += min(16.0, (largest_suit - 6) * 3.0)
        if has_honors:
            value += 2.0
    if locked_melds:
        value += locked_melds * 2.0
    return value


def _future_draw_types(hand_tile_ids: Sequence[str], available: Dict[str, int], limit: int) -> List[str]:
    """Keep the expensive future-draw scan focused on useful tile shapes.

    The Web evaluator can inspect all 34 tile types on a desktop.  On the Pi
    we rank the same types with a cheap local connection score and inspect
    only the most promising ones.  This preserves isolated-tile safety and
    every tile already represented in the hand while bounding CPU work.
    """

    if not limit or limit >= len(TILE_TYPES):
        return [tile_type for tile_type in TILE_TYPES if available.get(tile_type, 0) > 0]
    counts = count_tile_types(hand_tile_ids or [])
    ranked = []
    for tile_type in TILE_TYPES:
        available_count = available.get(tile_type, 0)
        if available_count <= 0:
            continue
        count = counts.get(tile_type, 0)
        if is_honor_tile(tile_type):
            priority = count * 7.0
        else:
            suit = get_tile_suit(tile_type)
            rank = get_tile_rank(tile_type) or 5
            priority = count * 5.0
            for distance, weight in ((1, 5.0), (2, 2.0)):
                if rank - distance >= 1:
                    priority += counts.get("{}{}".format(suit, rank - distance), 0) * weight
                if rank + distance <= 9:
                    priority += counts.get("{}{}".format(suit, rank + distance), 0) * weight
            if rank in (1, 9):
                priority -= 1.0
        priority += available_count * 0.2
        ranked.append((priority, available_count, _TILE_INDEX.get(tile_type, len(TILE_TYPES)), tile_type))
    ranked.sort(key=lambda item: (-item[0], -item[1], item[2]))
    return [item[3] for item in ranked[: max(1, int(limit))]]


def evaluate_advanced_hand(
    state: Dict[str, object],
    seat: int,
    hand_tile_ids: Sequence[str],
    locked_melds: int,
    extra_visible_types: Sequence[str],
    profile: Dict[str, object],
    cache: Dict[str, object],
    deadline: Optional[float] = None,
) -> Dict[str, object]:
    """Evaluate shape, future draws, flexibility, and incomplete-hand value."""

    count_key = _count_vector(hand_tile_ids)
    extra_key = tuple(sorted(get_tile_type(value) for value in extra_visible_types or []))
    cache_key = (int(seat), int(locked_melds), count_key, extra_key, profile.get("id"))
    advanced_cache = cache.setdefault("advanced", {})
    if cache_key in advanced_cache:
        return advanced_cache[cache_key]

    progress_cache = cache.setdefault("progress", {})
    base = evaluate_hand_progress(hand_tile_ids, locked_melds, progress_cache)
    available = _availability(state, seat, hand_tile_ids, extra_visible_types, cache)
    total_available = sum(available.values())
    weighted_improvement = 0.0
    effective_tile_count = 0
    improvement_type_count = 0
    best_draw_type = None
    best_improvement = -float("inf")

    timed_out = False
    if total_available:
        draw_types = _future_draw_types(
            hand_tile_ids,
            available,
            int(profile.get("future_draw_limit") or len(TILE_TYPES)),
        )
        for tile_type in draw_types:
            if deadline is not None and time.perf_counter() >= deadline:
                timed_out = True
                break
            available_count = available[tile_type]
            if available_count <= 0:
                continue
            future = evaluate_hand_progress(list(hand_tile_ids) + [tile_type], locked_melds, progress_cache)
            improvement = (
                (base["shanten"] - future["shanten"]) * 240.0
                + (future["score"] - base["score"])
            )
            weighted_improvement += improvement * available_count
            if improvement > 0:
                effective_tile_count += available_count
                improvement_type_count += 1
            if improvement > best_improvement:
                best_improvement = improvement
                best_draw_type = tile_type
    else:
        best_improvement = -24.0

    expected_improvement = weighted_improvement / total_available if total_available else -24.0
    shape_score = (
        base["melds"] * 120.0
        + base["taatsu"] * 40.0
        + base["pair"] * 20.0
        - base["shanten"] * 220.0
        - base["floating"] * 10.0
        - base["isolated"] * 12.0
    )
    availability_score = (
        expected_improvement * 1.35
        + effective_tile_count * 10.0
        + improvement_type_count * 5.0
        + (min(best_improvement, 220.0) * 0.25 if best_improvement > 0 else 0.0)
        - base["shanten"] * 6.0
    )
    flexibility_score = _flexibility(hand_tile_ids)
    value_score = _value_potential(hand_tile_ids, locked_melds)
    total_score = shape_score + availability_score + flexibility_score + value_score * float(profile.get("value_weight", 0.0))
    result = dict(base)
    result.update(
        {
            "expectedImprovement": expected_improvement,
            "effectiveTileCount": effective_tile_count,
            "improvementTypeCount": improvement_type_count,
            "bestDrawType": best_draw_type,
            "bestImprovement": best_improvement,
            "shapeScore": shape_score,
            "availabilityScore": availability_score,
            "flexibilityScore": flexibility_score,
            "valueScore": value_score,
            "totalScore": total_score,
            "analysisTimedOut": timed_out,
        }
    )
    if not timed_out:
        advanced_cache[cache_key] = result
    return result


def _opponent_profiles(state: Dict[str, object], seat: int) -> List[Dict[str, object]]:
    players = state.get("players") or []
    scores = state.get("scores") if isinstance(state.get("scores"), list) else []
    my_score = float(scores[seat]) if 0 <= int(seat) < len(scores) else 0.0
    profiles = []
    for other_seat, player in enumerate(players):
        if other_seat == seat or not isinstance(player, dict):
            continue
        melds = player.get("melds", []) or []
        open_melds = [meld for meld in melds if not meld.get("concealed")]
        discards = player.get("discards", []) or []
        score = float(scores[other_seat]) if other_seat < len(scores) else 0.0
        threat_weight = 1.0 + len(open_melds) * 0.24 + min(0.18, len(discards) * 0.015)
        threat_weight += min(0.28, max(0.0, score - my_score) / 260.0)
        suit_pressure = {"m": 0.0, "p": 0.0, "s": 0.0, "z": 0.0}
        discard_types = set()
        suit_discard_counts = {"m": 0, "p": 0, "s": 0, "z": 0}
        open_meld_ranks = {"m": [], "p": [], "s": [], "z": []}
        for discard in discards:
            tile_id = discard.get("tile_id") if isinstance(discard, dict) else discard
            tile_type = get_tile_type(tile_id)
            discard_types.add(tile_type)
            suit = get_tile_suit(tile_type)
            suit_pressure[suit] -= 0.4
            suit_discard_counts[suit] += 1
        for meld in open_melds:
            for tile_id in meld.get("tiles", []) if isinstance(meld, dict) else []:
                tile_type = get_tile_type(tile_id)
                suit = get_tile_suit(tile_type)
                suit_pressure[suit] += 1.0
            meld_type = get_tile_type(meld.get("tile_type") or (meld.get("tiles") or [""])[0])
            suit = get_tile_suit(meld_type)
            rank = get_tile_rank(meld_type)
            open_meld_ranks[suit].append(rank or 0)
        profiles.append(
            {
                "seat": other_seat,
                "score": score,
                "openMelds": len(open_melds),
                "discardCount": len(discards),
                "discardTypes": discard_types,
                "suitPressure": suit_pressure,
                "suitDiscardCounts": suit_discard_counts,
                "openMeldRanks": open_meld_ranks,
                "threatWeight": threat_weight,
            }
        )
    profiles.sort(key=lambda item: item["threatWeight"], reverse=True)
    return profiles


def derive_battle_profile(state: Dict[str, object], seat: int, base_progress: Dict[str, object]) -> Dict[str, object]:
    opponents = _opponent_profiles(state, seat)
    total_open = sum(item["openMelds"] for item in opponents)
    max_open = max([item["openMelds"] for item in opponents] or [0])
    max_discards = max([item["discardCount"] for item in opponents] or [0])
    attack_weight = 1.0
    defense_weight = 0.9
    if base_progress["shanten"] <= 1:
        attack_weight += 0.45
        defense_weight -= 0.15
    elif base_progress["shanten"] >= 4:
        attack_weight -= 0.12
        defense_weight += 0.2
    if total_open:
        defense_weight += 0.12 + total_open * 0.08 + max_open * 0.06
    if max_discards >= 8:
        defense_weight += 0.08

    scores = state.get("scores") if isinstance(state.get("scores"), list) else []
    if scores and 0 <= int(seat) < len(scores):
        my_score = float(scores[seat])
        highest_opponent = max([float(scores[index]) for index in range(len(scores)) if index != seat] or [my_score])
        gap = my_score - highest_opponent
        if gap <= -160:
            attack_weight += 0.2
            defense_weight -= 0.08
        elif gap <= -80:
            attack_weight += 0.12
            defense_weight -= 0.04
        elif gap >= 160:
            attack_weight -= 0.08
            defense_weight += 0.18
        elif gap >= 80:
            attack_weight -= 0.04
            defense_weight += 0.1

    suit_pressure = {"m": 0.0, "p": 0.0, "s": 0.0, "z": 0.0}
    weight_total = 0.0
    for opponent in opponents:
        weight = opponent["threatWeight"]
        weight_total += weight
        for suit in suit_pressure:
            suit_pressure[suit] += opponent["suitPressure"][suit] * weight
    if weight_total:
        for suit in suit_pressure:
            suit_pressure[suit] /= weight_total
    return {
        "attackWeight": attack_weight,
        "defenseWeight": defense_weight,
        "suitPressure": suit_pressure,
        "opponents": opponents,
        "riskSignature": "|".join(
            "{}:{:.2f}:{}:{}".format(
                item["seat"], item["threatWeight"], item["openMelds"], item["discardCount"]
            )
            for item in opponents
        ),
    }


def evaluate_discard_risk(
    state: Dict[str, object],
    seat: int,
    tile_id: str,
    battle_profile: Dict[str, object],
    cache: Dict[str, object],
) -> float:
    tile_type = get_tile_type(tile_id)
    key = (int(seat), tile_type, battle_profile.get("riskSignature", ""))
    risk_cache = cache.setdefault("risk", {})
    if key in risk_cache:
        return risk_cache[key]
    visible = _visible_counts(state, seat, [], [], cache)
    visible_count = visible.get(tile_type, 0)
    risks = []
    for opponent in battle_profile.get("opponents", []):
        if tile_type in opponent["discardTypes"]:
            risks.append(0.0)
            continue
        if is_honor_tile(tile_type):
            risk = 24.0 - visible_count * 5.0
            if opponent["suitPressure"]["z"] > 0 or battle_profile["suitPressure"]["z"] > 0:
                risk += 4.0
        else:
            suit = get_tile_suit(tile_type)
            rank = get_tile_rank(tile_type) or 5
            risk = 18.0 if 3 <= rank <= 7 else 15.0
            risk += opponent["suitPressure"][suit] * 4.0
            risk += battle_profile["suitPressure"][suit] * 2.0
            risk += 5.0 if visible_count <= 1 else (-4.0 if visible_count >= 3 else 0.0)
            if opponent["suitDiscardCounts"][suit] <= 1:
                risk += 4.0
            for meld_rank in opponent["openMeldRanks"][suit]:
                if meld_rank and abs(meld_rank - rank) <= 2:
                    risk += 6.0
        risk += (opponent["threatWeight"] - 1.0) * 8.0
        risks.append(max(0.0, risk))
    if not risks:
        result = 0.0
    else:
        ordered = sorted(risks, reverse=True)
        result = ordered[0] + sum(value * 0.2 for value in ordered[1:])
    risk_cache[key] = result
    return result


def _profile_discard_candidates(
    state: Dict[str, object],
    seat: int,
    hand_tile_ids: Sequence[str],
    difficulty: str,
    deadline: Optional[float] = None,
) -> Tuple[List[Dict[str, object]], Dict[str, object], Dict[str, object], Dict[str, object]]:
    profile = get_difficulty_profile(difficulty)
    cache = create_analysis_cache()
    counts = count_tile_types(hand_tile_ids or [])
    locked_melds = len((state.get("players") or [])[seat].get("melds", []) or [])
    if profile["advanced"]:
        baseline = evaluate_advanced_hand(
            state, seat, hand_tile_ids, locked_melds, [], profile, cache, deadline=deadline
        )
        battle = derive_battle_profile(state, seat, baseline)
    else:
        baseline = evaluate_hand_progress(hand_tile_ids, locked_melds, cache["progress"])
        battle = {"attackWeight": 1.0, "defenseWeight": 0.9, "opponents": [], "suitPressure": {}}

    candidate_tile_ids = _candidate_tile_ids(hand_tile_ids)
    quick_candidates = []
    if profile["advanced"]:
        # Screen every physical tile type with the inexpensive normal
        # structure evaluator, then spend advanced CPU only on the best few.
        for tile_id in candidate_tile_ids:
            tile_type = get_tile_type(tile_id)
            remaining = _remove_one(hand_tile_ids, tile_id)
            quick_progress = evaluate_hand_progress(remaining, locked_melds, cache["progress"])
            quick_total = quick_progress["score"] + score_discard_tile(tile_id, counts) * 2.0
            quick_candidates.append(
                {
                    "tileId": tile_id,
                    "tileType": tile_type,
                    "remaining": remaining,
                    "quickProgress": quick_progress,
                    "quickTotal": quick_total,
                }
            )
        quick_candidates.sort(
            key=lambda item: (
                item["quickProgress"]["shanten"],
                -item["quickTotal"],
                _TILE_INDEX.get(item["tileType"], len(TILE_TYPES)),
            )
        )
        candidate_limit = int(profile.get("candidate_limit") or len(quick_candidates))
        candidate_tile_ids = [item["tileId"] for item in quick_candidates[:candidate_limit]]

    candidates = []
    for tile_id in candidate_tile_ids:
        if deadline is not None and time.perf_counter() >= deadline:
            break
        tile_type = get_tile_type(tile_id)
        remaining = _remove_one(hand_tile_ids, tile_id)
        if profile["advanced"]:
            progress = evaluate_advanced_hand(
                state, seat, remaining, locked_melds, [tile_type], profile, cache, deadline=deadline
            )
            risk = evaluate_discard_risk(state, seat, tile_id, battle, cache)
            total = (
                progress["totalScore"] * float(profile["attack_factor"])
                + score_discard_tile(tile_id, counts) * 2.0
                - risk * float(battle["defenseWeight"]) * float(profile["risk_multiplier"])
            )
        else:
            progress = evaluate_hand_progress(remaining, locked_melds, cache["progress"])
            risk = 0.0
            total = progress["score"] + score_discard_tile(tile_id, counts) * 2.0
        candidates.append(
            {
                "tileId": tile_id,
                "tileType": tile_type,
                "remaining": remaining,
                "progress": progress,
                "risk": risk,
                "totalScore": total,
            }
        )
    if not candidates and quick_candidates:
        # The deadline is a safety net, not a reason to skip a legal turn.
        # Use the best normal-screened candidate when the Pi is busy.
        fallback = quick_candidates[0]
        candidates.append(
            {
                "tileId": fallback["tileId"],
                "tileType": fallback["tileType"],
                "remaining": fallback["remaining"],
                "progress": fallback["quickProgress"],
                "risk": 0.0,
                "totalScore": fallback["quickTotal"],
            }
        )
    candidates.sort(
        key=lambda item: (
            item["progress"]["shanten"],
            -item["totalScore"],
            _TILE_INDEX.get(item["tileType"], len(TILE_TYPES)),
        )
    )
    return candidates, baseline, battle, cache


def _lookahead_value(
    state: Dict[str, object],
    seat: int,
    candidate: Dict[str, object],
    baseline: Dict[str, object],
    profile: Dict[str, object],
    cache: Dict[str, object],
    deadline: float,
) -> float:
    """One future draw and one follow-up discard, bounded by ``deadline``."""

    if baseline["shanten"] > 3:
        return 0.0
    remaining = candidate["remaining"]
    available = _availability(state, seat, remaining, [candidate["tileType"]], cache)
    progress_cache = cache["progress"]
    draw_candidates = []
    for tile_type in TILE_TYPES:
        if time.perf_counter() >= deadline:
            return 0.0
        available_count = available[tile_type]
        if available_count <= 0:
            continue
        draw_progress = evaluate_hand_progress(remaining + [tile_type], len((state.get("players") or [])[seat].get("melds", []) or []), progress_cache)
        quick_gain = (
            (baseline["shanten"] - draw_progress["shanten"]) * 220.0
            + draw_progress["score"] - baseline.get("score", 0.0)
        )
        draw_candidates.append((quick_gain + available_count * 4.0, tile_type, available_count))
    draw_candidates.sort(reverse=True)
    draw_candidates = draw_candidates[:5]
    if not draw_candidates:
        return 0.0

    locked_melds = len((state.get("players") or [])[seat].get("melds", []) or [])
    weighted = 0.0
    total_weight = 0
    draw_limit = int(profile.get("lookahead_draw_limit") or 2)
    for _, tile_type, available_count in draw_candidates[:draw_limit]:
        if time.perf_counter() >= deadline:
            break
        drawn_hand = remaining + [tile_type]
        follow_candidates = _candidate_tile_ids(drawn_hand)
        follow_scores = []
        for follow_tile_id in follow_candidates[:5]:
            if time.perf_counter() >= deadline:
                break
            follow_remaining = _remove_one(drawn_hand, follow_tile_id)
            follow_progress = evaluate_advanced_hand(
                state,
                seat,
                follow_remaining,
                locked_melds,
                [candidate["tileType"], get_tile_type(follow_tile_id)],
                profile,
                cache,
                deadline=deadline,
            )
            follow_total = follow_progress["totalScore"] + score_discard_tile(
                follow_tile_id, count_tile_types(drawn_hand)
            ) * 2.0
            follow_scores.append(follow_total)
        if not follow_scores:
            continue
        immediate = evaluate_advanced_hand(
            state, seat, drawn_hand, locked_melds, [candidate["tileType"]], profile, cache, deadline=deadline
        )
        immediate_gain = (
            (baseline["shanten"] - immediate["shanten"]) * 180.0
            + immediate["totalScore"] - baseline.get("totalScore", baseline.get("score", 0.0))
        )
        weighted += (immediate_gain * 0.55 + max(follow_scores) - baseline.get("totalScore", baseline.get("score", 0.0))) * available_count
        total_weight += available_count
    return max(0.0, weighted / total_weight) if total_weight else 0.0


def choose_ai_discard(state: Dict[str, object], seat: int = 1) -> Optional[str]:
    """Choose a discard using the effective easy/normal/hard/god profile."""

    players = state.get("players") or []
    try:
        seat_index = int(seat)
    except (TypeError, ValueError):
        return None
    if not 0 <= seat_index < len(players):
        return None
    hand = list(players[seat_index].get("hand", []) or [])
    if not hand:
        return None
    difficulty = get_ai_difficulty(state, seat_index)
    if difficulty == "easy":
        return _choose_easy_discard(state, seat_index, hand)
    profile = get_difficulty_profile(difficulty)
    deadline = None
    if profile["time_budget_ms"]:
        deadline = time.perf_counter() + float(profile["time_budget_ms"]) / 1000.0
    candidates, baseline, battle, cache = _profile_discard_candidates(
        state, seat_index, hand, difficulty, deadline if profile["advanced"] else None
    )
    if not candidates:
        # A busy Pi can still always make a legal discard by using the first
        # physical tile; this branch is only a defensive guard.
        return hand[0]
    if difficulty != "god":
        return candidates[0]["tileId"]

    best = candidates[0]
    candidate_limit = int(profile.get("lookahead_candidate_limit") or 3)
    for candidate in candidates[:candidate_limit]:
        if deadline is not None and time.perf_counter() >= deadline:
            break
        lookahead = _lookahead_value(state, seat_index, candidate, baseline, profile, cache, deadline)
        candidate["lookahead"] = lookahead
        candidate["godScore"] = candidate["totalScore"] + lookahead * float(profile["lookahead_weight"])
        if (
            candidate["progress"]["shanten"] < best["progress"]["shanten"]
            or (
                candidate["progress"]["shanten"] == best["progress"]["shanten"]
                and candidate.get("godScore", candidate["totalScore"]) > best.get("godScore", best["totalScore"])
            )
        ):
            best = candidate
    return best["tileId"]


def _claim_remaining_hand(
    hand: Sequence[str], claim: Dict[str, object], meld_type: str
) -> Tuple[List[str], List[str], Optional[Dict[str, object]]]:
    tile_type = get_tile_type(claim.get("tile_id"))
    if meld_type == "pung":
        used = [tile_id for tile_id in hand if get_tile_type(tile_id) == tile_type][:2]
        return _remove_many(hand, used), used, None
    if meld_type == "kong":
        used = [tile_id for tile_id in hand if get_tile_type(tile_id) == tile_type][:3]
        return _remove_many(hand, used), used, None
    combos = claim.get("chow_combos") or []
    best = None
    for combo in combos:
        needed = list(combo.get("needed_types", []))
        used = _tiles_for_needed_types(hand, needed)
        if len(used) != len(needed):
            continue
        candidate = (_remove_many(hand, used), used, combo)
        if best is None:
            best = candidate
    return best if best is not None else (list(hand), [], None)


def _remove_many(tile_ids: Sequence[str], remove_ids: Sequence[str]) -> List[str]:
    remaining = list(tile_ids or [])
    for tile_id in remove_ids or []:
        try:
            remaining.remove(tile_id)
        except ValueError:
            pass
    return remaining


def _tiles_for_needed_types(hand: Sequence[str], needed_types: Sequence[str]) -> List[str]:
    remaining = list(hand or [])
    used = []
    for needed_type in needed_types or []:
        match = next((tile_id for tile_id in remaining if get_tile_type(tile_id) == needed_type), None)
        if match is None:
            return []
        used.append(match)
        remaining.remove(match)
    return used


def _easy_should_take_set(tile_type: str, hand: Sequence[str], is_kong: bool = False) -> bool:
    """Mirror the Web easy profile's eager set/kong rule."""

    if is_honor_tile(tile_type):
        return True
    if not is_suit_tile(tile_type):
        return False
    rank = get_tile_rank(tile_type)
    suit = get_tile_suit(tile_type)
    if rank is None:
        return False
    counts = count_tile_types(hand or [])
    isolated = (
        counts.get("{}{}".format(suit, rank - 1), 0) == 0
        and counts.get("{}{}".format(suit, rank + 1), 0) == 0
    )
    if is_kong:
        return isolated or rank in (1, 9)
    return True


def _choose_easy_claim(
    hand: Sequence[str], claim: Dict[str, object], meld_type: str
) -> Optional[Dict[str, object]]:
    """Use the Web easy profile's eager open-claim decisions."""

    tile_type = get_tile_type(claim.get("tile_id"))
    if meld_type in ("pung", "kong"):
        if not _easy_should_take_set(tile_type, hand, is_kong=meld_type == "kong"):
            return None
        _, used_ids, _ = _claim_remaining_hand(hand, claim, meld_type)
        if not used_ids:
            return None
        return dict(claim)

    if meld_type != "chow":
        return None
    counts = count_tile_types(hand or [])
    for combo in claim.get("chow_combos") or []:
        needed = list(combo.get("needed_types", []))
        if len(needed) != 2 or not all(counts.get(needed_type, 0) == 1 for needed_type in needed):
            continue
        selected = dict(claim)
        selected["selected_combo"] = combo
        return selected
    return None


def choose_ai_claim(
    state: Dict[str, object], seat: int, claim: Dict[str, object], meld_type: str
) -> Optional[Dict[str, object]]:
    """Return a selected claim for an AI, or ``None`` to pass."""

    if meld_type == "win":
        return claim
    players = state.get("players") or []
    if not 0 <= int(seat) < len(players):
        return None
    player = players[int(seat)]
    hand = list(player.get("hand", []) or [])
    locked_melds = len(player.get("melds", []) or [])
    difficulty = get_ai_difficulty(state, int(seat))
    if difficulty == "easy":
        return _choose_easy_claim(hand, claim, meld_type)
    profile = get_difficulty_profile(difficulty)
    cache = create_analysis_cache()
    deadline = None
    if profile["time_budget_ms"]:
        deadline = time.perf_counter() + float(profile["time_budget_ms"]) / 1000.0
    if profile["advanced"]:
        baseline = evaluate_advanced_hand(
            state, int(seat), hand, locked_melds, [], profile, cache, deadline=deadline
        )
        battle = derive_battle_profile(state, int(seat), baseline)
    else:
        baseline = evaluate_hand_progress(hand, locked_melds, cache["progress"])
        battle = {"attackWeight": 1.0, "defenseWeight": 0.9, "opponents": []}

    remaining, used_ids, combo = _claim_remaining_hand(hand, claim, meld_type)
    if not used_ids and meld_type != "chow":
        return None
    if meld_type == "chow" and combo is None:
        return None
    extra = list(used_ids) + [get_tile_type(claim.get("tile_id"))]
    if profile["advanced"]:
        progress = evaluate_advanced_hand(
            state,
            int(seat),
            remaining,
            locked_melds + 1,
            extra,
            profile,
            cache,
            deadline=deadline,
        )
        action_bonus = 28.0 if meld_type == "kong" else (20.0 if is_honor_tile(get_tile_type(claim.get("tile_id"))) else (12.0 if meld_type == "pung" else 10.0))
        value = (
            (progress["totalScore"] - baseline["totalScore"]) * float(profile["attack_factor"])
            + action_bonus
            - float(profile["exposure_penalty"]) * float(battle["defenseWeight"]) * float(profile["risk_multiplier"])
        )
        should_take = (
            progress["shanten"] < baseline["shanten"]
            or progress["effectiveTileCount"] >= baseline.get("effectiveTileCount", 0) + 3
            or value >= float(profile["action_threshold"]) + float(battle["defenseWeight"]) * 2.0
        )
    else:
        progress = evaluate_hand_progress(remaining, locked_melds + 1, cache["progress"])
        value = (
            (baseline["shanten"] - progress["shanten"]) * 220.0
            + progress["score"] - baseline["score"]
            + (28.0 if meld_type == "kong" else (20.0 if meld_type == "pung" else 10.0))
        )
        should_take = progress["shanten"] < baseline["shanten"] or (
            progress["shanten"] == baseline["shanten"] and value >= 12.0
        )
    if not should_take:
        return None
    selected = dict(claim)
    if combo is not None:
        selected["selected_combo"] = combo
    return selected


def choose_ai_concealed_kong(state: Dict[str, object], seat: int) -> Optional[str]:
    """Choose a concealed kong only when the profile sees useful value."""

    players = state.get("players") or []
    if not 0 <= int(seat) < len(players):
        return None
    player = players[int(seat)]
    hand = list(player.get("hand", []) or [])
    counts = count_tile_types(hand)
    candidates = [tile_type for tile_type, count in counts.items() if count >= 4]
    if not candidates:
        return None
    difficulty = get_ai_difficulty(state, int(seat))
    if difficulty == "easy":
        for tile_type in sorted(candidates, key=lambda item: _TILE_INDEX.get(item, len(TILE_TYPES))):
            if _easy_should_take_set(tile_type, hand, is_kong=True):
                return tile_type
        return None
    profile = get_difficulty_profile(difficulty)
    locked_melds = len(player.get("melds", []) or [])
    cache = create_analysis_cache()
    deadline = None
    if profile["time_budget_ms"]:
        deadline = time.perf_counter() + float(profile["time_budget_ms"]) / 1000.0
    if profile["advanced"]:
        baseline = evaluate_advanced_hand(
            state, int(seat), hand, locked_melds, [], profile, cache, deadline=deadline
        )
    else:
        baseline = evaluate_hand_progress(hand, locked_melds, cache["progress"])
    for tile_type in sorted(candidates, key=lambda item: _TILE_INDEX.get(item, len(TILE_TYPES))):
        used = [tile_id for tile_id in hand if get_tile_type(tile_id) == tile_type][:4]
        remaining = _remove_many(hand, used)
        if profile["advanced"]:
            progress = evaluate_advanced_hand(
                state,
                int(seat),
                remaining,
                locked_melds + 1,
                used,
                profile,
                cache,
                deadline=deadline,
            )
            should_take = progress["shanten"] < baseline["shanten"] or progress["effectiveTileCount"] >= baseline.get("effectiveTileCount", 0) + 3
        else:
            progress = evaluate_hand_progress(remaining, locked_melds + 1, cache["progress"])
            should_take = progress["shanten"] <= baseline["shanten"]
        if should_take:
            return tile_type
    return None


__all__ = [
    "AI_DIFFICULTIES",
    "DEFAULT_AI_DIFFICULTY",
    "MIXED_AI_DIFFICULTY",
    "FOUR_PLAYER_AI_DIFFICULTIES",
    "DIFFICULTY_PROFILES",
    "normalize_ai_difficulty",
    "get_ai_difficulty",
    "get_difficulty_profile",
    "create_analysis_cache",
    "evaluate_hand_progress",
    "evaluate_advanced_hand",
    "derive_battle_profile",
    "evaluate_discard_risk",
    "choose_ai_discard",
    "choose_ai_claim",
    "choose_ai_concealed_kong",
]

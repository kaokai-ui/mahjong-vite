"""Winning-hand evaluator shared by the headless engine and the Pygame scene."""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Sequence

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


THIRTEEN_ORPHANS = ("m1", "m9", "p1", "p9", "s1", "s9") + HONORS


def evaluate_winning_hand(
    hand_tile_ids: Sequence[str],
    melds: Optional[Sequence[Dict[str, object]]] = None,
    additional_tile_id: Optional[str] = None,
    additional_tile_type: Optional[str] = None,
) -> Dict[str, object]:
    meld_list = list(melds or [])
    concealed_types = [get_tile_type(tile_id) for tile_id in hand_tile_ids]
    if additional_tile_id:
        concealed_types.append(get_tile_type(additional_tile_id))
    if additional_tile_type:
        concealed_types.append(additional_tile_type)
    concealed_types.sort(key=lambda value: (TILE_TYPES.index(value) if value in TILE_TYPES else len(TILE_TYPES), value))

    base_patterns: List[str] = []
    if not meld_list and is_seven_pairs(concealed_types):
        base_patterns.append("七對子")
    if not meld_list and is_thirteen_orphans(concealed_types):
        base_patterns.append("十三么")

    decomposition = find_standard_winning_shape(concealed_types, len(meld_list))
    if decomposition is None and not base_patterns:
        return {"can_win": False, "patterns": [], "decomposition": None}

    patterns = detect_patterns(concealed_types, meld_list, decomposition, base_patterns)
    return {"can_win": True, "patterns": patterns, "decomposition": decomposition}


def is_winning_hand(
    hand_tile_ids: Sequence[str],
    melds: Optional[Sequence[Dict[str, object]]] = None,
    additional_tile_id: Optional[str] = None,
    additional_tile_type: Optional[str] = None,
) -> bool:
    return bool(
        evaluate_winning_hand(
            hand_tile_ids,
            melds,
            additional_tile_id=additional_tile_id,
            additional_tile_type=additional_tile_type,
        )["can_win"]
    )


def is_seven_pairs(tile_types: Sequence[str]) -> bool:
    if len(tile_types) != 14:
        return False
    counts = count_tile_types(tile_types)
    return all(count in (2, 4) for count in counts.values()) and sum(count // 2 for count in counts.values()) == 7


def is_thirteen_orphans(tile_types: Sequence[str]) -> bool:
    if len(tile_types) != 14:
        return False
    counts = count_tile_types(tile_types)
    pair_count = 0
    for required_type in THIRTEEN_ORPHANS:
        count = counts.get(required_type, 0)
        if count == 0:
            return False
        if count >= 2:
            pair_count += 1
    return set(counts).issubset(set(THIRTEEN_ORPHANS)) and pair_count == 1


def find_standard_winning_shape(tile_types: Sequence[str], fixed_meld_count: int) -> Optional[Dict[str, object]]:
    needed_tile_count = 14 - fixed_meld_count * 3
    if len(tile_types) != needed_tile_count:
        return None

    counts = count_tile_types(tile_types)
    candidate_pairs = sorted(
        [tile_type for tile_type, count in counts.items() if count >= 2],
        key=lambda value: (TILE_TYPES.index(value) if value in TILE_TYPES else len(TILE_TYPES), value),
    )
    for pair_type in candidate_pairs:
        counts[pair_type] -= 2
        sets = extract_sets(counts, 4 - fixed_meld_count)
        counts[pair_type] += 2
        if sets is not None:
            return {"pair": pair_type, "sets": sets}
    return None


def extract_sets(counts: Dict[str, int], sets_needed: int) -> Optional[List[Dict[str, object]]]:
    if sets_needed == 0:
        return [] if all(count == 0 for count in counts.values()) else None

    next_types = sorted(
        [tile_type for tile_type, count in counts.items() if count > 0],
        key=lambda value: (TILE_TYPES.index(value) if value in TILE_TYPES else len(TILE_TYPES), value),
    )
    if not next_types:
        return None
    next_type = next_types[0]

    if counts.get(next_type, 0) >= 3:
        counts[next_type] -= 3
        remainder = extract_sets(counts, sets_needed - 1)
        counts[next_type] += 3
        if remainder is not None:
            return [{"kind": "triplet", "tiles": [next_type] * 3, "tile_type": next_type}] + remainder

    if is_suit_tile(next_type):
        suit = get_tile_suit(next_type)
        rank = get_tile_rank(next_type)
        if rank is not None and rank <= 7:
            second = "{}{}".format(suit, rank + 1)
            third = "{}{}".format(suit, rank + 2)
            if counts.get(second, 0) > 0 and counts.get(third, 0) > 0:
                counts[next_type] -= 1
                counts[second] -= 1
                counts[third] -= 1
                remainder = extract_sets(counts, sets_needed - 1)
                counts[next_type] += 1
                counts[second] += 1
                counts[third] += 1
                if remainder is not None:
                    return [
                        {"kind": "chow", "tiles": [next_type, second, third], "tile_type": next_type}
                    ] + remainder
    return None


def detect_patterns(
    concealed_types: Sequence[str],
    melds: Sequence[Dict[str, object]],
    decomposition: Optional[Dict[str, object]],
    base_patterns: Iterable[str],
) -> List[str]:
    patterns = list(dict.fromkeys(base_patterns))
    all_types = list(concealed_types)
    for meld in melds:
        all_types.extend(get_tile_type(tile_id) for tile_id in meld.get("tiles", []))

    if not any(not bool(meld.get("concealed")) for meld in melds):
        patterns.append("門清")

    if decomposition:
        groups = [
            "chow" if meld.get("type") == "chow" else "triplet" for meld in melds
        ] + [
            "chow" if item.get("kind") == "chow" else "triplet"
            for item in decomposition.get("sets", [])
        ]
        if len(groups) == 4 and all(group == "triplet" for group in groups):
            patterns.append("對對胡")

    suit_types = [tile_type for tile_type in all_types if is_suit_tile(tile_type)]
    suits = set(get_tile_suit(tile_type) for tile_type in suit_types)
    has_honors = any(is_honor_tile(tile_type) for tile_type in all_types)
    if len(suits) == 1 and len(suit_types) == len(all_types) and all_types:
        patterns.append("清一色")
    elif len(suits) == 1 and has_honors:
        patterns.append("混一色")
    elif not suits and has_honors:
        patterns.append("字一色")
    return list(dict.fromkeys(patterns))

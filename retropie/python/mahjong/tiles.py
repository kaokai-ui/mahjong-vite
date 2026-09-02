"""Tile definitions and small rule helpers for the RetroPie 2P game.

The Web game uses the same 34-tile full set for its default two-player room:
three numbered suits plus seven honor tiles, four copies each.
"""

from __future__ import annotations

import random
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


SUITS = ("m", "p", "s")
HONORS = ("E", "S", "W", "N", "R", "G", "B")
HONOR_LABELS = {
    "E": "東",
    "S": "南",
    "W": "西",
    "N": "北",
    "R": "中",
    "G": "發",
    "B": "白",
}
SUIT_LABELS = {"m": "萬", "p": "筒", "s": "索"}
NUMBER_LABELS = ("", "一", "二", "三", "四", "五", "六", "七", "八", "九")

TILE_TYPES = tuple(
    ["{}{}".format(suit, rank) for suit in SUITS for rank in range(1, 10)]
    + list(HONORS)
)
TILE_TYPE_ORDER = {tile_type: index for index, tile_type in enumerate(TILE_TYPES)}
DRAGON_TYPES = ("R", "G", "B")
TERMINAL_HONOR_TYPES = tuple(
    ["m1", "m9", "p1", "p9", "s1", "s9"] + list(HONORS)
)


def get_tile_type(tile_id: str) -> str:
    """Return a tile type such as ``m1`` from a physical id such as ``m1-3``."""

    value = str(tile_id or "")
    return value.rsplit("-", 1)[0] if "-" in value else value


def is_suit_tile(tile_type: str) -> bool:
    value = str(tile_type or "")
    return len(value) == 2 and value[0] in SUITS and value[1] in "123456789"


def get_tile_suit(tile_type: str) -> str:
    return tile_type[0] if is_suit_tile(tile_type) else "z"


def get_tile_rank(tile_type: str) -> Optional[int]:
    return int(tile_type[1]) if is_suit_tile(tile_type) else None


def is_honor_tile(tile_type: str) -> bool:
    return not is_suit_tile(tile_type)


def tile_label(tile_id_or_type: str) -> str:
    tile_type = get_tile_type(tile_id_or_type)
    if is_suit_tile(tile_type):
        return "{}{}".format(NUMBER_LABELS[int(tile_type[1])], SUIT_LABELS[tile_type[0]])
    return HONOR_LABELS.get(tile_type, tile_type or "未知牌")


def tile_type_sort_key(tile_type: str) -> Tuple[int, str]:
    return TILE_TYPE_ORDER.get(get_tile_type(tile_type), len(TILE_TYPES)), str(tile_type)


def sort_tile_ids(tile_ids: Iterable[str]) -> List[str]:
    return sorted(list(tile_ids), key=tile_type_sort_key)


def build_deck(rng: random.Random) -> List[str]:
    deck = ["{}-{}".format(tile_type, copy_index) for tile_type in TILE_TYPES for copy_index in range(1, 5)]
    rng.shuffle(deck)
    return deck


def count_tile_types(tile_ids: Iterable[str]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for tile_id in tile_ids:
        tile_type = get_tile_type(tile_id)
        counts[tile_type] = counts.get(tile_type, 0) + 1
    return counts


def tiles_by_type(tile_ids: Sequence[str], tile_type: str, count: Optional[int] = None) -> List[str]:
    matches = [tile_id for tile_id in tile_ids if get_tile_type(tile_id) == tile_type]
    return matches if count is None else matches[:count]


def get_chow_combos(hand_tile_ids: Sequence[str], discard_tile_id: str) -> List[Dict[str, object]]:
    discard_type = get_tile_type(discard_tile_id)
    if not is_suit_tile(discard_type):
        return []

    suit = get_tile_suit(discard_type)
    rank = get_tile_rank(discard_type)
    counts = count_tile_types(hand_tile_ids)
    combos: List[Dict[str, object]] = []
    for start in (rank - 2, rank - 1, rank):
        if start < 1 or start + 2 > 9:
            continue
        sequence = ["{}{}".format(suit, value) for value in range(start, start + 3)]
        needed_types = [value for value in sequence if value != discard_type]
        if all(counts.get(value, 0) >= 1 for value in needed_types):
            combos.append(
                {
                    "sequence": sequence,
                    "needed_types": needed_types,
                    "key": "|".join(needed_types),
                    "label": " ".join(tile_label(value) for value in sequence),
                }
            )

    unique: List[Dict[str, object]] = []
    seen = set()
    for combo in combos:
        key = combo["key"]
        if key not in seen:
            seen.add(key)
            unique.append(combo)
    return unique


def can_claim_pung(hand_tile_ids: Sequence[str], discard_tile_id: str) -> bool:
    return count_tile_types(hand_tile_ids).get(get_tile_type(discard_tile_id), 0) >= 2


def can_claim_kong(hand_tile_ids: Sequence[str], discard_tile_id: str) -> bool:
    return count_tile_types(hand_tile_ids).get(get_tile_type(discard_tile_id), 0) >= 3


def get_concealed_kong_types(hand_tile_ids: Sequence[str]) -> List[str]:
    return sorted(
        [tile_type for tile_type, count in count_tile_types(hand_tile_ids).items() if count >= 4],
        key=tile_type_sort_key,
    )


def hand_without_tile(hand_tile_ids: Sequence[str], tile_id: Optional[str]) -> List[str]:
    """Remove one exact physical tile id without changing the input sequence."""

    if not tile_id:
        return list(hand_tile_ids)
    result = list(hand_tile_ids)
    try:
        result.remove(tile_id)
    except ValueError:
        pass
    return result

"""Small, deterministic tai scorer for the native 2P scene."""

from __future__ import annotations

from typing import Dict, List, Optional, Sequence

from .evaluator import evaluate_winning_hand, is_seven_pairs, is_thirteen_orphans
from .tiles import DRAGON_TYPES, get_tile_rank, get_tile_suit, get_tile_type, is_honor_tile, is_suit_tile


SCORE_CAP = 640
BASE_SCORE_UNIT = 20


def score_from_tai(total_tai: int) -> int:
    normalized = max(0, int(total_tai))
    if normalized <= 0:
        return 0
    return min(SCORE_CAP, BASE_SCORE_UNIT * (2 ** max(0, normalized - 1)))


def evaluate_score(
    hand_tile_ids: Sequence[str],
    melds: Optional[Sequence[Dict[str, object]]] = None,
    win_kind: str = "discardWin",
    winning_tile_id: Optional[str] = None,
    additional_tile_id: Optional[str] = None,
    additional_tile_type: Optional[str] = None,
    last_draw_source: str = "",
) -> Dict[str, object]:
    meld_list = list(melds or [])
    evaluation = evaluate_winning_hand(
        hand_tile_ids,
        meld_list,
        additional_tile_id=additional_tile_id,
        additional_tile_type=additional_tile_type,
    )
    if not evaluation["can_win"]:
        return {
            "can_score": False,
            "evaluation": evaluation,
            "patterns": evaluation["patterns"],
            "breakdown": [],
            "total_tai": 0,
            "total_score": 0,
        }

    all_types = [get_tile_type(tile_id) for tile_id in hand_tile_ids]
    if additional_tile_id:
        all_types.append(get_tile_type(additional_tile_id))
    elif additional_tile_type:
        all_types.append(additional_tile_type)
    for meld in meld_list:
        all_types.extend(get_tile_type(tile_id) for tile_id in meld.get("tiles", []))

    breakdown: List[Dict[str, object]] = []

    def add(key: str, label: str, tai: int) -> None:
        breakdown.append({"key": key, "label": label, "tai": tai})

    add("baseWin", "基本胡", 1)
    if win_kind == "selfDraw":
        add("selfDraw", "自摸", 1)
    if not any(not bool(meld.get("concealed")) for meld in meld_list):
        add("concealed", "門清", 1)
    if all(is_suit_tile(tile_type) and get_tile_rank(tile_type) not in (1, 9) for tile_type in all_types):
        add("allSimples", "斷么九", 1)

    group_triplets = set()
    group_kinds = []
    for meld in meld_list:
        if meld.get("type") == "chow":
            group_kinds.append("chow")
        else:
            group_kinds.append("triplet")
            group_triplets.add(meld.get("tile_type") or get_tile_type(meld.get("tiles", [""])[0]))
    decomposition = evaluation.get("decomposition") or {}
    for item in decomposition.get("sets", []):
        if item.get("kind") == "chow":
            group_kinds.append("chow")
        else:
            group_kinds.append("triplet")
            group_triplets.add(item.get("tile_type") or item.get("tiles", [""])[0])

    for dragon_type, label in (("R", "紅中刻"), ("G", "發財刻"), ("B", "白板刻")):
        if dragon_type in group_triplets:
            add("dragon-{}".format(dragon_type), label, 1)
    if len(group_kinds) == 4 and all(kind == "triplet" for kind in group_kinds):
        add("allPungs", "對對胡", 2)
    if not meld_list and is_seven_pairs(all_types):
        add("sevenPairs", "七對子", 2)
    if any(is_suit_tile(tile_type) for tile_type in all_types):
        suits = set(get_tile_suit(tile_type) for tile_type in all_types if is_suit_tile(tile_type))
        has_honors = any(is_honor_tile(tile_type) for tile_type in all_types)
        if len(suits) == 1 and has_honors:
            add("halfFlush", "混一色", 3)
        elif len(suits) == 1 and not has_honors:
            add("fullFlush", "清一色", 5)
    if all(is_honor_tile(tile_type) for tile_type in all_types):
        add("allHonors", "字一色", 8)
    if not meld_list and is_thirteen_orphans(all_types):
        add("thirteenOrphans", "十三么", 8)
    if win_kind == "selfDraw" and last_draw_source == "supplement":
        add("kongDraw", "槓上開花", 1)
    if win_kind == "robKong":
        add("robKong", "搶槓胡", 1)

    total_tai = sum(int(item["tai"]) for item in breakdown)
    return {
        "can_score": True,
        "evaluation": evaluation,
        "patterns": evaluation["patterns"],
        "breakdown": breakdown,
        "total_tai": total_tai,
        "total_score": score_from_tai(total_tai),
        "winning_tile_id": winning_tile_id or "",
    }


def build_score_delta(
    winner_seat: int,
    loser_seat: Optional[int],
    total_score: int,
    player_count: int = 2,
    self_draw: bool = False,
) -> List[int]:
    """Build a zero-sum score change for a 2P or 4P round.

    A discard win charges only the discarder.  A self-draw charges every
    opponent, which keeps the four-seat result meaningful while preserving the
    original two-player ``[+score, -score]`` behavior.
    """

    count = max(2, int(player_count))
    score = max(0, int(total_score))
    delta = [0 for _ in range(count)]
    if not 0 <= int(winner_seat) < count or not score:
        return delta
    if self_draw:
        for seat in range(count):
            if seat == winner_seat:
                continue
            delta[seat] -= score
            delta[winner_seat] += score
        return delta
    if loser_seat is None or not 0 <= int(loser_seat) < count or winner_seat == loser_seat:
        return delta
    delta[winner_seat] += score
    delta[loser_seat] -= score
    return delta

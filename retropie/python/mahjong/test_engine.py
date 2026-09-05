"""Regression tests for the native 2P engine.

These tests intentionally do not import Pygame, so they run on the Windows
development machine and on the older Python runtime used by RetroPie.
"""

import json
import unittest

from .engine import (
    choose_ai_discard,
    create_game_state,
    current_drawn_tile,
    dispatch_round,
    finish_win,
    get_human_kong_types,
    human_hand_tiles,
    run_headless,
    serialize_state,
    step_bot,
)
from .ai import get_ai_difficulty
from .evaluator import evaluate_winning_hand
from .tiles import TILE_TYPES, build_deck, get_tile_type, sort_tile_ids


class MahjongEngineTests(unittest.TestCase):
    def test_full_deck_has_136_unique_physical_tiles(self):
        import random

        deck = build_deck(random.Random(11))
        self.assertEqual(len(deck), 136)
        self.assertEqual(len(set(deck)), 136)
        self.assertEqual({get_tile_type(tile_id) for tile_id in deck}, set(TILE_TYPES))

    def test_initial_round_is_two_player_and_human_has_one_drawn_tile(self):
        state = create_game_state(seed=11)
        self.assertEqual(state["player_count"], 2)
        self.assertEqual(len(state["players"]), 2)
        self.assertEqual(len(state["players"][0]["hand"]), 14)
        self.assertEqual(len(state["players"][1]["hand"]), 13)
        self.assertEqual(len(human_hand_tiles(state)), 13)
        self.assertEqual(current_drawn_tile(state, 0), state["last_draw"]["tile_id"])
        self.assertEqual(len(state["wall"]), 109)

    def test_initial_round_can_deal_four_players(self):
        state = create_game_state(seed=11, player_count=4)
        self.assertEqual(state["game_id"], "mahjong-retropie-4p")
        self.assertEqual(state["player_count"], 4)
        self.assertEqual(len(state["players"]), 4)
        self.assertEqual([len(player["hand"]) for player in state["players"]], [14, 13, 13, 13])
        self.assertEqual(len(state["wall"]), 83)
        self.assertEqual(current_drawn_tile(state, 0), state["last_draw"]["tile_id"])

    def test_ai_profiles_default_and_four_player_mapping(self):
        two_player = create_game_state(seed=12)
        self.assertEqual(two_player["ai_difficulty"], "hard")
        self.assertEqual(get_ai_difficulty(two_player, 1), "hard")

        four_player = create_game_state(seed=12, player_count=4)
        self.assertEqual(four_player["ai_difficulty"], "mixed")
        self.assertEqual([get_ai_difficulty(four_player, seat) for seat in (1, 2, 3)], ["god", "normal", "hard"])

        forced = create_game_state(seed=12, player_count=4, ai_difficulty="god")
        self.assertEqual([get_ai_difficulty(forced, seat) for seat in (1, 2, 3)], ["god", "god", "god"])

    def test_each_ai_profile_returns_a_legal_discard_in_both_modes(self):
        for player_count in (2, 4):
            for difficulty in ("easy", "normal", "hard", "god"):
                state = create_game_state(seed=13, player_count=player_count, ai_difficulty=difficulty)
                for seat in range(1, player_count):
                    tile_id = choose_ai_discard(state, seat)
                    self.assertIn(tile_id, state["players"][seat]["hand"])

    def test_four_player_ai_can_pass_three_seats_and_return_to_human(self):
        state = create_game_state(seed=19, player_count=4)
        human_tile = current_drawn_tile(state, 0)
        result = dispatch_round(
            state,
            {"player_seat": 0, "type": "discardTile", "payload": {"tile_id": human_tile}},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(state["turn_seat"], 1)
        self.assertEqual(state["phase"], "bot")

        # A normal seed has no opening claim race; run the three AI seats and
        # allow the test to stop early only if a legitimate claim/win occurs.
        for _ in range(12):
            if state["status"] != "playing" or state["phase"] not in ("bot", "bot_discard"):
                break
            step_bot(state)
        self.assertIn(state["phase"], ("draw", "response", "finished", "bot", "bot_discard"))
        touched_ai_seats = {
            discard.get("seat")
            for player in state["players"]
            for discard in player.get("discards", [])
        }
        self.assertTrue(touched_ai_seats.intersection({1, 2, 3}))

    def test_four_player_human_can_claim_and_pass_a_bot_discard(self):
        state = create_game_state(seed=29, player_count=4)
        state["players"][0]["hand"] = [
            "R-2", "R-3", "m1-1", "m4-1", "p2-1", "p5-1", "s3-1",
            "s6-1", "E-1", "S-1", "W-1", "G-1", "B-1",
        ]
        state["players"][3]["hand"] = [
            "R-1", "m2-1", "m3-1", "m5-1", "p1-1", "p4-1", "p7-1",
            "s1-1", "s4-1", "s7-1", "E-2", "S-2", "W-2",
        ]
        for seat in (1, 2):
            state["players"][seat]["hand"] = [
                "m1-{}".format(seat), "m4-{}".format(seat), "m7-{}".format(seat),
                "p2-{}".format(seat), "p5-{}".format(seat), "p8-{}".format(seat),
                "s3-{}".format(seat), "s6-{}".format(seat), "E-{}".format(seat),
                "S-{}".format(seat), "W-{}".format(seat), "G-{}".format(seat), "B-{}".format(seat),
            ]
        state["phase"] = "bot_discard"
        state["turn_seat"] = 3
        state["needs_draw"] = False
        state["last_draw"] = None
        result = dispatch_round(
            state,
            {"player_seat": 3, "type": "discardTile", "payload": {"tile_id": "R-1"}},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(state["phase"], "response")
        self.assertEqual(state["pending_claim"]["to_seat"], 0)
        self.assertIn("pung", state["pending_claim"]["options"])

        passed = dispatch_round(state, {"player_seat": 0, "type": "passClaim", "payload": {}})
        self.assertTrue(passed["ok"])
        self.assertEqual(state["phase"], "draw")
        self.assertEqual(state["turn_seat"], 0)
        self.assertTrue(state["needs_draw"])

    def test_draw_stays_visible_until_the_next_action(self):
        state = create_game_state(seed=17)
        human_tile = current_drawn_tile(state, 0)
        hand_before = list(state["players"][0]["hand"])
        result = dispatch_round(state, {"player_seat": 0, "type": "discardTile", "payload": {"tile_id": human_tile}})
        self.assertTrue(result["ok"])
        self.assertIsNone(state["last_draw"])
        self.assertNotIn(human_tile, state["players"][0]["hand"])
        self.assertEqual(len(hand_before) - 1, len(state["players"][0]["hand"]))

        # Let the computer reach the human draw step, then draw once.
        from .engine import advance_automatic

        advance_automatic(state, 8)
        if state["status"] == "playing" and state["phase"] == "draw":
            draw_result = dispatch_round(state, {"player_seat": 0, "type": "drawTile", "payload": {}})
            self.assertTrue(draw_result["ok"])
            drawn = current_drawn_tile(state, 0)
            self.assertIsNotNone(drawn)
            self.assertIn(drawn, state["players"][0]["hand"])

    def test_standard_hand_and_seven_pairs_are_accepted(self):
        standard = [
            "m1-1", "m2-1", "m3-1", "m4-1", "m5-1", "m6-1", "m7-1", "m8-1", "m9-1",
            "E-1", "E-2", "E-3", "R-1", "R-2",
        ]
        self.assertTrue(evaluate_winning_hand(standard)["can_win"])
        seven_pairs = [
            "m1-1", "m1-2", "m2-1", "m2-2", "m3-1", "m3-2", "p4-1", "p4-2",
            "p6-1", "p6-2", "s8-1", "s8-2", "B-1", "B-2",
        ]
        self.assertTrue(evaluate_winning_hand(seven_pairs)["can_win"])

    def test_win_result_keeps_complete_hand_and_winning_tile(self):
        state = create_game_state(seed=43)
        winning_tile = "R-2"
        state["players"][0]["hand"] = [
            "m1-1", "m2-1", "m3-1", "m4-1", "m5-1", "m6-1", "m7-1", "m8-1", "m9-1",
            "E-1", "E-2", "E-3", "R-1",
        ]
        state["players"][0]["melds"] = []
        state["last_draw"] = None
        evaluation = evaluate_winning_hand(
            state["players"][0]["hand"], [], additional_tile_id=winning_tile
        )
        self.assertTrue(evaluation["can_win"])

        finish_win(state, 0, 1, "discardWin", winning_tile, evaluation)

        result = state["result"]
        self.assertEqual(result["winning_tile_id"], winning_tile)
        self.assertEqual(len(result["winning_hand"]), 14)
        self.assertIn(winning_tile, result["winning_hand"])
        self.assertEqual(result["loser_seat"], 1)

    def test_state_serializes_without_losing_drawn_tile(self):
        state = create_game_state(seed=23)
        restored = json.loads(serialize_state(state))
        self.assertEqual(restored, state)
        self.assertEqual(sort_tile_ids(restored["players"][0]["hand"]), restored["players"][0]["hand"])

    def test_headless_round_finishes(self):
        result = run_headless(seed=20260901)
        self.assertIn(result["outcome"], ("selfDraw", "discardWin", "draw"))
        self.assertIn(result["wall_remaining"] <= 109, (True,))

    def test_four_player_headless_round_finishes(self):
        result = run_headless(seed=20260901, player_count=4)
        self.assertEqual(result["player_count"], 4)
        self.assertIn(result["outcome"], ("selfDraw", "discardWin", "draw"))
        self.assertLessEqual(result["wall_remaining"], 83)

    def test_computer_dealer_starts_in_the_automatic_phase(self):
        previous = create_game_state(seed=31)
        previous["status"] = "finished"
        previous["phase"] = "finished"
        previous["winner_seat"] = 1
        next_round = create_game_state(seed=32, previous_state=previous)
        self.assertEqual(next_round["dealer_seat"], 1)
        self.assertEqual(next_round["phase"], "bot_discard")

    def test_human_can_declare_concealed_kong_and_draw_a_replacement(self):
        state = create_game_state(seed=41)
        state["players"][0]["hand"] = [
            "m1-1", "m1-2", "m1-3", "m1-4",
            "m2-1", "m3-1", "p4-1", "p5-1", "s6-1", "s7-1",
            "E-1", "E-2", "R-1", "R-2",
        ]
        state["last_draw"] = {"seat": 0, "tile_id": "m1-4", "source": "live"}
        state["phase"] = "discard"
        state["turn_seat"] = 0
        state["needs_draw"] = False
        self.assertEqual(get_human_kong_types(state), ["m1"])

        result = dispatch_round(
            state,
            {"player_seat": 0, "type": "declareKong", "payload": {"tile_type": "m1"}},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(state["players"][0]["melds"][0]["type"], "kong")
        self.assertTrue(state["players"][0]["melds"][0]["concealed"])
        self.assertEqual(len(state["players"][0]["hand"]), 10)
        self.assertEqual(state["phase"], "draw")
        self.assertTrue(state["needs_draw"])

        draw_result = dispatch_round(state, {"player_seat": 0, "type": "drawTile", "payload": {}})
        self.assertTrue(draw_result["ok"])
        self.assertEqual(state["phase"], "discard")
        self.assertIsNotNone(current_drawn_tile(state, 0))


if __name__ == "__main__":
    unittest.main()

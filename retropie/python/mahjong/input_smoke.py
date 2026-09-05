"""Keyboard mapping smoke checks that do not require Pygame."""

from __future__ import annotations

import os

from .app import (
    CHOW_KEYS,
    DEFAULT_MENU_MODE,
    DEFAULT_RENDER_MODE,
    DIFFICULTY_SELECT_KEYS,
    DIFFICULTY_VALUES,
    DISCARD_LAYOUTS,
    DISCARD_MAX_VISIBLE,
    DRAW_KEYS,
    EXIT_KEYS,
    FONT_FALLBACK_ASSET_PATH,
    FOUR_PLAYER_AVATARS,
    FONT_ASSET_PATH,
    HAND_KEY_NAMES,
    HU_KEYS,
    KONG_KEYS,
    MODE_SELECT_KEYS,
    PASS_KEYS,
    PUNG_KEYS,
    RENDER_MODES,
    AVATAR_ASSET_VERSION,
    VOICE_FILES,
    MahjongPygame,
    discard_row_width,
    result_hand_tiles,
    result_pattern_text,
    result_source_text,
)
from .engine import create_game_state, current_drawn_tile


class _FakeTime:
    @staticmethod
    def get_ticks():
        return 1000


class _FakePygame:
    K_LSHIFT = 1
    K_z = 2
    K_n = 3
    K_LCTRL = 4
    K_LALT = 5
    K_SPACE = 6
    K_BACKSPACE = 7
    K_ESCAPE = 8
    K_F7 = 9
    K_RCTRL = 10
    K_a = 11
    K_b = 12
    K_c = 13
    K_d = 14
    K_e = 15
    K_f = 16
    K_g = 17
    time = _FakeTime()


class _FakeEvent:
    def __init__(self, key):
        self.key = key


class _FakeSound:
    def __init__(self, trace=None):
        self.trace = trace if trace is not None else []

    def event(self, kind):
        self.trace.append(("sound", kind))


def run() -> None:
    assert MODE_SELECT_KEYS == ("K_a", "K_b")
    assert DIFFICULTY_SELECT_KEYS == ("K_c", "K_d", "K_e", "K_f", "K_g")
    assert DIFFICULTY_VALUES == ("easy", "normal", "hard", "god", "mixed")
    assert HU_KEYS == ("K_z",)
    assert DRAW_KEYS == ("K_n",)
    assert PUNG_KEYS == ("K_LALT",)
    assert CHOW_KEYS == ("K_SPACE",)
    assert PASS_KEYS == ("K_BACKSPACE",)
    assert "K_RCTRL" in EXIT_KEYS
    assert KONG_KEYS == ("K_LCTRL",)
    assert RENDER_MODES == ("low-power", "smoothscale", "native-1080p")
    assert DEFAULT_RENDER_MODE == "native-1080p"
    assert DEFAULT_MENU_MODE == 1
    assert DISCARD_MAX_VISIBLE == 20
    for layout in (DISCARD_LAYOUTS[2], DISCARD_LAYOUTS[4]):
        panel = layout["panel"]
        panel_right = panel[0] + panel[2]
        available_width = panel_right - layout["x"]
        row_width_19 = discard_row_width(19, layout["tile_w"], layout["tile_gap"])
        row_width_20 = discard_row_width(20, layout["tile_w"], layout["tile_gap"])
        row_width_21 = discard_row_width(21, layout["tile_w"], layout["tile_gap"])
        assert row_width_19 <= available_width
        assert row_width_20 <= available_width
        assert row_width_21 > available_width
    assert AVATAR_ASSET_VERSION == "v2"
    assert FOUR_PLAYER_AVATARS == {
        1: "opponent-jade",
        2: "opponent",
        3: "opponent-scarlet",
    }
    assert os.path.basename(FONT_ASSET_PATH) == "NotoSansCJKtc-Regular.otf"
    assert os.path.isfile(FONT_ASSET_PATH)
    assert os.path.basename(FONT_FALLBACK_ASSET_PATH) == "NotoSansCJKtc-Medium.otf"
    assert os.path.isfile(FONT_FALLBACK_ASSET_PATH)
    assert VOICE_FILES == {
        "chi": "chi.wav",
        "zimo": "zimo.wav",
        "gang": "gang.wav",
        "hu": "hu.wav",
        "pung": "pung.wav",
    }
    assert result_pattern_text({"patterns": ["門清", "對對胡"]}) == "門清、對對胡"
    assert result_pattern_text({"patterns": [], "breakdown": [{"key": "baseWin"}]}) == "基本胡"
    assert result_pattern_text({"patterns": []}) == "標準胡牌"
    result_players = [{"name": "你"}, {"name": "電腦"}]
    assert result_source_text({"players": result_players}, {"win_kind": "discardWin", "loser_seat": 1}) == "放炮：電腦"
    assert result_source_text({"players": result_players}, {"win_kind": "selfDraw", "loser_seat": None}) == ""
    result_state = {
        "players": [
            {
                "hand": ["m2-1", "m1-1"],
                "melds": [{"tiles": ["E-1", "E-2", "E-3"]}],
            }
        ]
    }
    result_tiles = result_hand_tiles(
        result_state,
        {"winner_seat": 0, "winning_tile_id": "m3-1"},
    )
    assert len(result_tiles) == 6
    assert set(result_tiles) == {"m1-1", "m2-1", "m3-1", "E-1", "E-2", "E-3"}
    assert result_hand_tiles(
        result_state,
        {"winner_seat": 0, "winning_hand": ["m3-1", "m1-1", "m2-1", "E-1", "E-2", "E-3"]},
    ) == result_tiles
    assert HAND_KEY_NAMES == tuple("K_{}".format(letter.lower()) for letter in "ABCDEFGHIJKLM")
    # The white hand labels stop at M; N is reserved for the red 摸牌 control.
    assert HAND_KEY_NAMES[-1] == "K_m"
    assert "K_n" not in HAND_KEY_NAMES

    # Exercise the real scene key router without importing or initializing
    # Pygame.  This catches the user-critical menu behavior and the second
    # 摸牌 key that discards the exposed drawn tile.
    app = object.__new__(MahjongPygame)
    app.pygame = _FakePygame
    app.sound = _FakeSound()
    app.screen_name = "menu"
    app.selected_mode = DEFAULT_MENU_MODE
    app.ai_difficulty = "hard"
    app.selected_difficulty = "mixed"
    app.mode_notice = ""
    app.state = None
    app.save_path = None
    started = []
    app.start_round = lambda: started.append((app.selected_mode, app.selected_difficulty))
    app.key(_FakeEvent(_FakePygame.K_a))
    assert app.selected_mode == 0
    assert app.selected_difficulty == "hard"
    app.key(_FakeEvent(_FakePygame.K_g))
    assert app.selected_difficulty == "hard"
    assert app.mode_notice
    app.key(_FakeEvent(_FakePygame.K_e))
    assert app.selected_difficulty == "hard"
    assert app.mode_notice == ""
    app.key(_FakeEvent(_FakePygame.K_f))
    assert app.selected_difficulty == "god"
    app.key(_FakeEvent(_FakePygame.K_b))
    assert app.selected_mode == 1
    assert app.selected_difficulty == "mixed"
    app.key(_FakeEvent(_FakePygame.K_LSHIFT))
    assert app.selected_mode == 1
    app.key(_FakeEvent(_FakePygame.K_n))
    assert started == [(1, "mixed")]

    app.screen_name = "game"
    app.state = create_game_state(seed=7)
    initial_drawn = app.state["last_draw"]["tile_id"]
    app.state["players"][0]["hand"].remove(initial_drawn)
    app.state["phase"] = "draw"
    app.state["turn_seat"] = 0
    app.state["needs_draw"] = True
    app.state["last_draw"] = None
    app.key(_FakeEvent(_FakePygame.K_n))
    drawn = current_drawn_tile(app.state, 0)
    assert drawn is not None
    app.key(_FakeEvent(_FakePygame.K_n))
    assert current_drawn_tile(app.state, 0) is None
    assert drawn not in app.state["players"][0]["hand"]

    # The green 槓 key is Left Ctrl.  It must route to kong handling rather
    # than the red 摸牌 action when no kong is available.
    kong_calls = []
    app.state = {"status": "playing", "phase": "discard", "turn_seat": 0}
    app.declare_kong = lambda: kong_calls.append(True) or True
    app.human_primary = lambda: kong_calls.append("draw")
    app.key(_FakeEvent(_FakePygame.K_LCTRL))
    assert kong_calls == [True]

    # Response actions play the voice before the command is dispatched, so
    # the physical key gives immediate feedback even when the state changes.
    trace = []
    app.sound = _FakeSound(trace)
    app.state = {
        "phase": "response",
        "pending_claim": {"to_seat": 0, "options": ["win", "pung"], "chow_combos": []},
    }
    app.dispatch = lambda command_type, payload=None: trace.append(("dispatch", command_type))
    app.handle_response_key(_FakePygame.K_z)
    assert trace == [("sound", "hu"), ("dispatch", "claimWin")]
    trace[:] = []
    app.handle_response_key(_FakePygame.K_LALT)
    assert trace == [("sound", "pung"), ("dispatch", "claimPung")]

    # The physical Mahjong keyboard's 得分 key is Right Ctrl and must leave
    # the native scene so EmulationStation can take over again.
    assert app.key(_FakeEvent(_FakePygame.K_RCTRL)) is False
    assert app.closed is True


if __name__ == "__main__":
    run()
    print("mahjong retropie input smoke: ok")

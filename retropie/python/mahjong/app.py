"""Pygame scene for the physical Mahjong keyboard.

There are intentionally no mouse, touch, or gamepad handlers in this module.
The only gameplay inputs are the keys physically present on the Mahjong
keyboard.  The physical 得分 key is the normal RetroPie exit action; Escape
and F7 remain desktop/diagnostic fallbacks.
"""

from __future__ import annotations

import argparse
import math
import os
import struct
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .engine import (
    DEFAULT_SEED,
    create_game_state,
    current_drawn_tile,
    dispatch_round,
    get_human_claim_choices,
    get_human_kong_types,
    human_hand_tiles,
    step_bot,
)
from .evaluator import evaluate_winning_hand
from .persistence import default_save_path, load_state, save_state
from .tiles import get_tile_type, tile_label


LOGICAL_SIZE = (1280, 720)
NATIVE_1080P_SIZE = (1920, 1080)
RENDER_MODES = ("low-power", "smoothscale", "native-1080p")
DEFAULT_RENDER_MODE = "native-1080p"
DEFAULT_MENU_MODE = 1
AI_DELAY_MS = 420
DISCARD_MAX_VISIBLE = 20
# The central board keeps a dedicated label column.  These fixed native-grid
# layouts leave enough width for exactly twenty recent discards in one row in
# both 2P and 4P while continuing to use the high-resolution v2 tile assets.
DISCARD_LAYOUTS = {
    2: {
        "panel": (265, 150, 750, 214),
        "x": 314,
        "tile_w": 33,
        "tile_h": 44,
        "tile_gap": 2,
        "label_offset": 42,
    },
    4: {
        "panel": (248, 130, 784, 252),
        "x": 326,
        "tile_w": 34,
        "tile_h": 43,
        "tile_gap": 1,
        "label_offset": 48,
    },
}
TILE_ASSET_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "assets", "mahjong_tiles_v2"))
LEGACY_TILE_ASSET_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "assets", "mahjong_tiles"))
AVATAR_ASSET_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "assets", "avatars"))
AVATAR_ASSET_VERSION = "v2"
FOUR_PLAYER_AVATARS = {
    1: "opponent-jade",
    2: "opponent",
    3: "opponent-scarlet",
}
VOICE_ASSET_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "assets", "voices"))
FONT_ASSET_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "assets", "fonts"))
FONT_ASSET_PATH = os.path.join(FONT_ASSET_DIR, "NotoSansCJKtc-Regular.otf")
FONT_FALLBACK_ASSET_PATH = os.path.join(FONT_ASSET_DIR, "NotoSansCJKtc-Medium.otf")
VOICE_FILES = {
    "chi": "chi.wav",
    "zimo": "zimo.wav",
    "gang": "gang.wav",
    "hu": "hu.wav",
    "pung": "pung.wav",
}
DRAW_KEYS = ("K_n",)
HU_KEYS = ("K_z",)
MODE_KEYS = HU_KEYS
PUNG_KEYS = ("K_LALT",)
CHOW_KEYS = ("K_SPACE",)
KONG_KEYS = ("K_LCTRL",)
PASS_KEYS = ("K_BACKSPACE",)
EXIT_KEYS = ("K_RCTRL", "K_ESCAPE", "K_F7")
HAND_KEY_NAMES = tuple("K_{}".format(letter.lower()) for letter in "ABCDEFGHIJKLM")

COLORS = {
    "ink": (7, 13, 17),
    "table": (17, 89, 68),
    "table_dark": (10, 54, 45),
    "table_edge": (222, 174, 71),
    "gold": (255, 222, 118),
    "cream": (255, 250, 232),
    "tile_shadow": (183, 169, 143),
    "cyan": (111, 229, 218),
    "muted": (173, 201, 194),
    "panel": (9, 39, 48),
    "panel_alt": (19, 63, 65),
    "red": (213, 75, 72),
    "wan": (40, 91, 196),
    "tong": (191, 57, 66),
    "suo": (35, 142, 92),
    "honor": (117, 70, 161),
}


def discard_row_width(count: int, tile_w: int, tile_gap: int) -> int:
    """Return the logical width needed by a single discard row."""

    count = max(0, int(count))
    return count * int(tile_w) + max(0, count - 1) * int(tile_gap)


def _is_cjk(character: str) -> bool:
    code = ord(character)
    return (0x2E80 <= code <= 0x9FFF) or (0xF900 <= code <= 0xFAFF) or (0xFF00 <= code <= 0xFFEF)


def _font_path(pygame, names: Sequence[str]) -> Optional[str]:
    for name in names:
        if os.path.isfile(name):
            return name
        try:
            path = pygame.font.match_font(name)
        except (AttributeError, pygame.error):
            path = None
        if path:
            return path
    return None


def _font_pair(pygame, size: int):
    cjk_candidates = (
        FONT_ASSET_PATH,
        FONT_FALLBACK_ASSET_PATH,
        "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "Droid Sans Fallback",
        "Noto Sans CJK TC",
        "Noto Sans CJK",
        "Microsoft JhengHei",
        "PingFang TC",
    )
    latin_candidates = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "DejaVu Sans",
        "Arial",
    )
    cjk_path = _font_path(pygame, cjk_candidates)
    latin_path = _font_path(pygame, latin_candidates)
    try:
        cjk = pygame.font.Font(cjk_path, size) if cjk_path else pygame.font.SysFont("DejaVu Sans", size)
    except (IOError, OSError, pygame.error):
        cjk = pygame.font.SysFont("DejaVu Sans", size)
    try:
        latin = pygame.font.Font(latin_path, size) if latin_path else pygame.font.SysFont("DejaVu Sans", size)
    except (IOError, OSError, pygame.error):
        latin = cjk
    return cjk, latin


def _render_mixed(pygame, value: object, fonts, color: Tuple[int, int, int]):
    cjk_font, latin_font = fonts
    runs = []
    current: List[str] = []
    current_font = None
    for character in str(value):
        selected = cjk_font if _is_cjk(character) else latin_font
        if current and selected is not current_font:
            runs.append((current_font, "".join(current)))
            current = []
        current_font = selected
        current.append(character)
    if current:
        runs.append((current_font, "".join(current)))

    surfaces = []
    for font, text in runs or [(latin_font, "")]:
        try:
            surfaces.append(font.render(text, True, color))
        except pygame.error:
            surfaces.append(latin_font.render("?", True, color))
    width = max(1, sum(surface.get_width() for surface in surfaces))
    height = max(1, max((surface.get_height() for surface in surfaces), default=latin_font.get_height()))
    output = pygame.Surface((width, height), pygame.SRCALPHA)
    x = 0
    for surface in surfaces:
        output.blit(surface, (x, height - surface.get_height()))
        x += surface.get_width()
    return output


class SoundBus:
    def __init__(self, pygame, enabled: bool = True):
        self.pygame = pygame
        self.enabled = enabled
        self.channel = None
        self.voice_cache = {}
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.init(frequency=22050, size=-16, channels=1, buffer=512)
            self.channel = pygame.mixer.Channel(0)
        except (AttributeError, pygame.error):
            self.channel = None

    def tone(self, frequency: int, duration_ms: int = 80) -> None:
        if not self.enabled or self.channel is None:
            return
        sample_rate = 22050
        sample_count = max(1, int(sample_rate * duration_ms / 1000))
        pcm = bytearray()
        for index in range(sample_count):
            progress = index / float(sample_count)
            envelope = min(1.0, progress * 18.0) * min(1.0, (1.0 - progress) * 12.0)
            sample = int(7000 * envelope * math.sin(2.0 * math.pi * frequency * index / sample_rate))
            pcm.extend(struct.pack("<h", sample))
        try:
            self.channel.play(self.pygame.mixer.Sound(buffer=bytes(pcm)))
        except (TypeError, ValueError, self.pygame.error):
            pass

    def voice(self, kind: str) -> bool:
        """Play a pre-rendered Mandarin action clip immediately if available."""

        if not self.enabled or self.channel is None:
            return False
        filename = VOICE_FILES.get(kind)
        if not filename:
            return False
        if kind not in self.voice_cache:
            path = os.path.join(VOICE_ASSET_DIR, filename)
            error_type = getattr(self.pygame, "error", Exception)
            try:
                self.voice_cache[kind] = self.pygame.mixer.Sound(path)
            except (AttributeError, IOError, OSError, error_type):
                self.voice_cache[kind] = None
        sound = self.voice_cache.get(kind)
        if sound is None:
            return False
        try:
            self.channel.play(sound)
            return True
        except (AttributeError, TypeError, ValueError, self.pygame.error):
            return False

    def event(self, kind: str) -> None:
        if kind in VOICE_FILES and self.voice(kind):
            return
        frequencies = {
            "deal": 300,
            "draw": 430,
            "discard": 520,
            "chi": 520,
            "pung": 590,
            "chow": 640,
            "zimo": 880,
            "gang": 680,
            "hu": 880,
            "pass": 220,
            "select": 700,
        }
        self.tone(frequencies.get(kind, 360), 150 if kind in ("deal", "hu") else 80)

    def close(self) -> None:
        if self.channel:
            self.channel.stop()
        try:
            self.pygame.mixer.quit()
        except (AttributeError, self.pygame.error):
            pass


class MahjongPygame:
    """The keyboard-only native 2P/4P scene."""

    def __init__(
        self,
        pygame,
        seed: Optional[int] = None,
        save_path=None,
        fullscreen: bool = False,
        low_power: bool = False,
        fps: int = 30,
        input_profile: str = "mahjong",
        render_mode: Optional[str] = None,
    ):
        self.pygame = pygame
        self.seed = seed
        self.fullscreen = fullscreen
        self.render_mode = render_mode or ("low-power" if low_power else DEFAULT_RENDER_MODE)
        if self.render_mode not in RENDER_MODES:
            raise ValueError("unknown render mode: {}".format(self.render_mode))
        self.low_power = self.render_mode == "low-power"
        self.ui_scale = 1.5 if self.render_mode == "native-1080p" else 1.0
        self.logical_size = NATIVE_1080P_SIZE if self.render_mode == "native-1080p" else LOGICAL_SIZE
        self.fps = max(1, fps)
        self.input_profile = input_profile
        flags = pygame.FULLSCREEN if fullscreen else pygame.RESIZABLE
        if os.environ.get("SDL_VIDEODRIVER") == "dummy":
            flags = 0
        self.screen = pygame.display.set_mode((0, 0) if fullscreen else self.logical_size, flags)
        pygame.display.set_caption("麻將 RetroPie · 單人 2P")
        self.canvas = pygame.Surface(self.logical_size)
        self.clock = pygame.time.Clock()
        self.title_font = _font_pair(pygame, self.ui_size(48))
        self.heading_font = _font_pair(pygame, self.ui_size(28))
        # Keep all text rendered directly at the native canvas size with the
        # selected font's actual weight; do not add Pygame synthetic bold.
        self.body_font = _font_pair(pygame, self.ui_size(22))
        self.small_font = _font_pair(pygame, self.ui_size(18))
        self.tile_font = _font_pair(pygame, self.ui_size(27))
        self.tile_small_font = _font_pair(pygame, self.ui_size(15))
        self.save_path = save_path
        self.sound = SoundBus(pygame)
        self.screen_name = "menu"
        self.selected_mode = DEFAULT_MENU_MODE
        self.mode_notice = ""
        self.state = None
        self.next_bot_at = 0
        self.tile_cache = {}
        self.avatar_cache = {}
        self.tile_asset_dir = TILE_ASSET_DIR if os.path.isdir(TILE_ASSET_DIR) else LEGACY_TILE_ASSET_DIR
        self.legacy_tile_asset_dir = LEGACY_TILE_ASSET_DIR
        self.closed = False

        # A save is opt-in.  RetroPie should always boot to the mode-selection
        # home screen rather than unexpectedly reopening a stale table.
        if self.save_path and os.path.isfile(self.save_path):
            restored = load_state(self.save_path)
            if restored and restored.get("status") == "playing":
                self.state = restored
                self.screen_name = "game"
                self.selected_mode = 1 if restored.get("player_count") == 4 else 0
                pygame.display.set_caption(
                    "麻將 RetroPie · 單人 {}P".format(restored.get("player_count", 2))
                )

    def ui_size(self, value: float) -> int:
        return max(1, int(round(float(value) * self.ui_scale)))

    def ui_point(self, point: Sequence[float]) -> Tuple[int, int]:
        return tuple(self.ui_size(value) for value in point)

    def ui_rect(self, rect) -> object:
        x, y, width, height = rect
        return self.pygame.Rect(
            self.ui_size(x),
            self.ui_size(y),
            self.ui_size(width),
            self.ui_size(height),
        )

    def image_scaler(self):
        if self.render_mode == "low-power":
            return self.pygame.transform.scale
        return getattr(self.pygame.transform, "smoothscale", self.pygame.transform.scale)

    def is_key(self, key: int, *names: str) -> bool:
        return any(key == getattr(self.pygame, name, None) for name in names)

    def key_name(self, key: int) -> Optional[str]:
        for name in EXIT_KEYS + MODE_KEYS + DRAW_KEYS + PUNG_KEYS + CHOW_KEYS + KONG_KEYS + PASS_KEYS + HAND_KEY_NAMES:
            if self.is_key(key, name):
                return name
        return None

    def key(self, event) -> bool:
        """Handle only KEYDOWN events; return False to leave EmulationStation."""

        key = event.key
        if self.is_key(key, *EXIT_KEYS):
            self.closed = True
            return False

        if self.screen_name == "menu":
            if self.is_key(key, *MODE_KEYS):
                self.selected_mode = (self.selected_mode + 1) % 2
                self.mode_notice = ""
                self.sound.event("select")
            elif self.is_key(key, *DRAW_KEYS):
                self.confirm_mode()
            return True

        if not self.state:
            self.screen_name = "menu"
            return True

        if self.state.get("status") == "finished":
            if self.is_key(key, *DRAW_KEYS):
                self.start_round()
            return True

        if self.state.get("phase") == "response":
            self.handle_response_key(key)
            return True

        if self.state.get("turn_seat") != 0:
            return True

        if self.is_key(key, *HU_KEYS):
            self.declare_self_draw()
            return True
        if self.is_key(key, *KONG_KEYS) and self.declare_kong():
            return True

        # The white hand labels stop at M.  N is the red 摸牌 HID code, so it
        # runs the draw / discard-drawn-tile action.  Left Ctrl belongs to the
        # physical green 槓 key and must not fall through to 摸牌.
        if self.is_key(key, *DRAW_KEYS):
            self.human_primary()
            return True

        for index, name in enumerate(HAND_KEY_NAMES):
            if self.is_key(key, name):
                self.discard_index(index)
                return True
        return True

    def confirm_mode(self) -> None:
        self.start_round()

    def start_round(self) -> None:
        previous = self.state if self.state and self.state.get("status") == "finished" else None
        next_seed = self.seed
        if previous and next_seed is not None:
            next_seed += int(previous.get("round_number", 0))
        player_count = 4 if self.selected_mode == 1 else 2
        if previous:
            player_count = int(previous.get("player_count", player_count))
            self.selected_mode = 1 if player_count == 4 else 0
        self.state = create_game_state(seed=next_seed, previous_state=previous, player_count=player_count)
        self.screen_name = "game"
        self.mode_notice = ""
        self.pygame.display.set_caption("麻將 RetroPie · 單人 {}P".format(player_count))
        self.next_bot_at = self.pygame.time.get_ticks() + AI_DELAY_MS
        self.sound.event("deal")
        self.save_if_enabled()

    def dispatch(self, command_type: str, payload: Optional[Dict[str, object]] = None):
        if not self.state:
            return None
        result = dispatch_round(
            self.state,
            {"player_seat": 0, "type": command_type, "payload": payload or {}},
        )
        if result.get("ok"):
            self.sound_for_command(command_type)
            self.save_if_enabled()
        return result

    def sound_for_command(self, command_type: str) -> None:
        mapping = {
            "drawTile": "draw",
            "discardTile": "discard",
            "passClaim": "pass",
        }
        kind = mapping.get(command_type)
        if kind:
            self.sound.event(kind)

    def human_primary(self) -> None:
        if not self.state or self.state.get("phase") not in ("draw", "discard"):
            return
        if self.state.get("phase") == "draw":
            self.dispatch("drawTile")
            return
        drawn_tile = current_drawn_tile(self.state, 0)
        if drawn_tile:
            result = self.dispatch("discardTile", {"tile_id": drawn_tile})
            if result and result.get("ok"):
                self.queue_bot()
        else:
            self.state["message"] = "請按手牌上方的 A–M 出牌。"

    def discard_index(self, index: int) -> None:
        if not self.state or self.state.get("phase") != "discard" or self.state.get("turn_seat") != 0:
            return
        hand = human_hand_tiles(self.state)
        if not 0 <= index < len(hand):
            return
        result = self.dispatch("discardTile", {"tile_id": hand[index]})
        if result and result.get("ok"):
            self.queue_bot()

    def declare_self_draw(self) -> None:
        if self.state and self.state.get("phase") == "discard" and self.state.get("turn_seat") == 0:
            player = self.state["players"][0]
            evaluation = evaluate_winning_hand(player.get("hand", []), player.get("melds", []))
            if evaluation.get("can_win"):
                self.sound.event("zimo")
        result = self.dispatch("declareSelfDraw")
        if result and not result.get("ok"):
            self.state["message"] = result.get("message", "目前不能胡牌。")

    def declare_kong(self) -> bool:
        if not self.state:
            return False
        available_types = get_human_kong_types(self.state)
        if not available_types:
            return False
        self.sound.event("gang")
        result = self.dispatch("declareKong", {"tile_type": available_types[0]})
        if result and not result.get("ok"):
            self.state["message"] = result.get("message", "目前不能槓牌。")
            return False
        return bool(result and result.get("ok"))

    def handle_response_key(self, key: int) -> None:
        choices = get_human_claim_choices(self.state)
        choice_types = {choice.get("type") for choice in choices}
        if self.is_key(key, *HU_KEYS) and "claimWin" in choice_types:
            self.sound.event("hu")
            self.dispatch("claimWin")
            return
        if self.is_key(key, *KONG_KEYS) and "claimKong" in choice_types:
            self.sound.event("gang")
            self.dispatch("claimKong")
            return
        if self.is_key(key, *PUNG_KEYS) and "claimPung" in choice_types:
            self.sound.event("pung")
            self.dispatch("claimPung")
            return
        if self.is_key(key, *CHOW_KEYS) and "claimChow" in choice_types:
            choice = next(choice for choice in choices if choice.get("type") == "claimChow")
            combo = choice.get("combo") or {}
            self.sound.event("chi")
            self.dispatch("claimChow", {"needed_types": combo.get("needed_types", [])})
            return
        if self.is_key(key, *PASS_KEYS):
            self.dispatch("passClaim")

    def queue_bot(self) -> None:
        self.next_bot_at = self.pygame.time.get_ticks() + AI_DELAY_MS

    def tick_state(self) -> None:
        if not self.state or self.state.get("status") != "playing":
            return
        if self.state.get("phase") not in ("bot", "bot_discard"):
            return
        now = self.pygame.time.get_ticks()
        if now < self.next_bot_at:
            return
        before_phase = self.state.get("phase")
        outcome = step_bot(self.state)
        if outcome in ("bot-drew", "bot-discarded"):
            self.sound.event("draw" if before_phase == "bot" else "discard")
        if self.state.get("status") == "playing" and self.state.get("phase") in ("bot", "bot_discard"):
            self.next_bot_at = now + AI_DELAY_MS
        self.save_if_enabled()

    def save_if_enabled(self) -> None:
        if self.save_path and self.state:
            save_state(self.state, self.save_path)

    def text(self, value: object, fonts, color, center=None, top_left=None):
        image = _render_mixed(self.pygame, value, fonts, color)
        if center is not None:
            scaled_center = self.ui_point(center)
            point = (
                int(scaled_center[0] - image.get_width() / 2),
                int(scaled_center[1] - image.get_height() / 2),
            )
        else:
            point = self.ui_point(top_left or (0, 0))
        self.canvas.blit(image, point)
        return image.get_rect(topleft=point)

    def panel(self, rect, fill=COLORS["panel"], border=COLORS["cyan"], radius=12, width=2):
        self._panel_pixels(self.ui_rect(rect), fill, border, radius, width)

    def _panel_pixels(self, rect, fill, border, radius=12, width=2):
        scaled_radius = self.ui_size(radius)
        scaled_width = self.ui_size(width) if width else 0
        try:
            self.pygame.draw.rect(self.canvas, fill, rect, border_radius=scaled_radius)
            if scaled_width:
                self.pygame.draw.rect(self.canvas, border, rect, scaled_width, border_radius=scaled_radius)
        except TypeError:
            self.pygame.draw.rect(self.canvas, fill, rect)
            if scaled_width:
                self.pygame.draw.rect(self.canvas, border, rect, scaled_width)

    def tile_asset(self, asset_key: str, size: Tuple[int, int]):
        """Load a raster tile asset, with a per-size cache and text fallback."""

        width = max(1, int(size[0]))
        height = max(1, int(size[1]))
        cache_key = (asset_key, width, height)
        if cache_key in self.tile_cache:
            return self.tile_cache[cache_key]
        filename = "tile-back.png" if asset_key == "back" else "tile-{}.png".format(asset_key)
        path = os.path.join(self.tile_asset_dir, filename)
        if not os.path.isfile(path):
            path = os.path.join(self.legacy_tile_asset_dir, filename)
        error_type = getattr(self.pygame, "error", Exception)
        try:
            image = self.pygame.image.load(path)
            if hasattr(image, "convert_alpha"):
                image = image.convert_alpha()
            image = self.image_scaler()(image, (width, height))
        except (AttributeError, IOError, OSError, error_type):
            image = None
        self.tile_cache[cache_key] = image
        return image

    def avatar_asset(self, asset_key: str, size: Tuple[int, int]):
        """Load a transparent Q-version portrait and fit it inside a slot."""

        width = max(1, int(size[0]))
        height = max(1, int(size[1]))
        cache_key = (asset_key, width, height)
        if cache_key in self.avatar_cache:
            return self.avatar_cache[cache_key]
        preferred_path = os.path.join(
            AVATAR_ASSET_DIR,
            "{}-{}.png".format(asset_key, AVATAR_ASSET_VERSION),
        )
        legacy_path = os.path.join(AVATAR_ASSET_DIR, "{}-v1.png".format(asset_key))
        path = preferred_path if os.path.isfile(preferred_path) else legacy_path
        error_type = getattr(self.pygame, "error", Exception)
        try:
            image = self.pygame.image.load(path)
            if hasattr(image, "convert_alpha"):
                image = image.convert_alpha()
            source_width, source_height = image.get_size()
            ratio = min(width / float(max(1, source_width)), height / float(max(1, source_height)))
            target_size = (
                max(1, int(source_width * ratio)),
                max(1, int(source_height * ratio)),
            )
            image = self.image_scaler()(image, target_size)
        except (AttributeError, IOError, OSError, error_type):
            image = None
        self.avatar_cache[cache_key] = image
        return image

    def draw_avatar(self, asset_key: str, rect) -> None:
        rect = self.ui_rect(rect)
        image = self.avatar_asset(asset_key, rect.size)
        if image is None:
            return
        image_rect = image.get_rect(center=rect.center)
        self.canvas.blit(image, image_rect.topleft)

    def draw_tile(self, tile_id: str, rect, hidden: bool = False, highlighted: bool = False, small: bool = False):
        rect = self.ui_rect(rect)
        if hidden:
            image = self.tile_asset("back", rect.size)
            if image is not None:
                self.canvas.blit(image, rect.topleft)
            else:
                self.panel(rect, COLORS["table_dark"], COLORS["cyan"], 6, 2)
                self.pygame.draw.line(self.canvas, COLORS["gold"], rect.topleft, rect.bottomright, 2)
                self.pygame.draw.line(self.canvas, COLORS["gold"], (rect.right, rect.top), (rect.left, rect.bottom), 2)
            return
        tile_type = get_tile_type(tile_id)
        image = self.tile_asset(tile_type, rect.size)
        if image is not None:
            self.canvas.blit(image, rect.topleft)
            if highlighted:
                self.pygame.draw.rect(self.canvas, COLORS["gold"], rect, self.ui_size(3))
            return
        self._panel_pixels(rect.move(self.ui_size(2), self.ui_size(3)), COLORS["tile_shadow"], COLORS["tile_shadow"], 5, 0)
        self._panel_pixels(rect, COLORS["cream"], COLORS["gold"] if highlighted else (158, 153, 142), 5, 3 if highlighted else 1)
        group = tile_type[:1]
        color = COLORS.get({"m": "wan", "p": "tong", "s": "suo"}.get(group, "honor"), COLORS["honor"])
        self.text(tile_label(tile_id), self.tile_small_font if small else self.tile_font, color, center=rect.center)

    def draw_melds(
        self,
        melds: Sequence[Dict[str, object]],
        y: int,
        tile_w: int,
        tile_h: int,
    ) -> None:
        groups = []
        for meld in melds or []:
            if not isinstance(meld, dict):
                continue
            tiles = [tile_id for tile_id in (meld.get("tiles") or []) if isinstance(tile_id, str)]
            if tiles:
                groups.append(tiles)
        if not groups:
            return

        tile_gap = 3
        meld_gap = 10
        group_widths = [len(group) * tile_w + max(0, len(group) - 1) * tile_gap for group in groups]
        total_width = sum(group_widths) + max(0, len(groups) - 1) * meld_gap
        start_x = max(70, int((LOGICAL_SIZE[0] - total_width) / 2))

        x = start_x
        for group_index, group in enumerate(groups):
            for tile_id in group:
                self.draw_tile(tile_id, (x, y, tile_w, tile_h), small=True)
                x += tile_w + tile_gap
            x -= tile_gap
            if group_index < len(groups) - 1:
                x += meld_gap

    def draw_menu(self) -> None:
        self.canvas.fill(COLORS["ink"])
        menu_rect = self.ui_rect((24, 24, 1232, 672))
        self.pygame.draw.rect(self.canvas, COLORS["table"], menu_rect)
        self.pygame.draw.rect(self.canvas, COLORS["table_edge"], menu_rect, self.ui_size(3))
        self.text("麻將 RetroPie", self.title_font, COLORS["gold"], center=(640, 120))
        self.text("單人模式", self.heading_font, COLORS["cyan"], center=(640, 170))
        labels = [
            ("單人 2P", "兩人局 · 你對電腦", True),
            ("單人 4P", "四人局 · 你對三位電腦", True),
        ]
        for index, (title, subtitle, available) in enumerate(labels):
            x = 190 + index * 470
            rect = self.pygame.Rect(x, 250, 430, 190)
            selected = index == self.selected_mode
            fill = COLORS["panel_alt"] if selected else COLORS["panel"]
            border = COLORS["gold"] if selected else COLORS["muted"]
            self.panel(rect, fill, border, 16, 4 if selected else 2)
            self.text(title, self.heading_font, COLORS["gold"] if selected else COLORS["cream"], center=(rect.centerx, 305))
            self.text(subtitle, self.body_font, COLORS["cyan"] if available else COLORS["muted"], center=(rect.centerx, 350))
            self.text("目前可玩" if available else "尚未開放", self.small_font, COLORS["cream"] if available else COLORS["muted"], center=(rect.centerx, 392))
        if self.mode_notice:
            self.text(self.mode_notice, self.body_font, COLORS["red"], center=(640, 500))
        self.text("胡：選擇模式　摸牌：確認　得分：離開", self.body_font, COLORS["cream"], center=(640, 605))
        self.text("只使用麻將鍵盤", self.small_font, COLORS["cream"], center=(640, 650))

    def draw_table(self) -> None:
        state = self.state
        if int(state.get("player_count", 2)) == 4:
            self.draw_four_player_table()
            return
        self.canvas.fill(COLORS["ink"])
        self.panel((24, 18, 1232, 684), COLORS["table"], COLORS["table_edge"], 24, 3)

        # Opponent area: no global topbar, just the two table seats.
        opponent = state["players"][1]
        self.text("電腦", self.heading_font, COLORS["gold"], top_left=(64, 42))
        self.text("手牌 {} 張".format(len(opponent.get("hand", []))), self.small_font, COLORS["cream"], top_left=(65, 78))
        hidden_count = min(13, max(0, len(opponent.get("hand", []))))
        tile_w, tile_h, tile_gap = 49, 58, 4
        start_x = int((LOGICAL_SIZE[0] - (hidden_count * tile_w + max(0, hidden_count - 1) * tile_gap)) / 2)
        for index in range(hidden_count):
            self.draw_tile("", (start_x + index * (tile_w + tile_gap), 42, tile_w, tile_h), hidden=True, small=True)
        # Seat the opponent portrait at the top-right, directly opposite the
        # player's portrait in the lower-right seat area.
        self.draw_avatar("opponent", (1040, 26, 200, 118))
        self.draw_melds(opponent.get("melds", []), 102, 32, 42)

        # Twenty recent discards fit in one row; the compact target is still
        # drawn directly on the native canvas from the high-resolution v2 PNG.
        discard_layout = DISCARD_LAYOUTS[2]
        self.panel(discard_layout["panel"], COLORS["table_dark"], COLORS["cyan"], 15, 2)
        self.text("牌山 {} 張".format(len(state.get("wall", []))), self.small_font, COLORS["gold"], center=(640, 175))
        self.draw_discard_row(
            state["players"][1].get("discards", []),
            discard_layout["x"],
            198,
            "電腦",
            max_visible=DISCARD_MAX_VISIBLE,
            tile_w=discard_layout["tile_w"],
            tile_h=discard_layout["tile_h"],
            tile_gap=discard_layout["tile_gap"],
            label_offset=discard_layout["label_offset"],
        )
        self.draw_discard_row(
            state["players"][0].get("discards", []),
            discard_layout["x"],
            276,
            "你",
            max_visible=DISCARD_MAX_VISIBLE,
            tile_w=discard_layout["tile_w"],
            tile_h=discard_layout["tile_h"],
            tile_gap=discard_layout["tile_gap"],
            label_offset=discard_layout["label_offset"],
        )
        # The player portrait uses the open right-hand space immediately
        # above the human hand panel, opposite the computer portrait.
        self.draw_avatar("player", (1040, 252, 200, 116))

        # Human hand.  A–M labels are above the hand, while the drawn tile is
        # in its own highlighted slot and never consumes a letter position.
        self.panel((48, 374, 1184, 210), COLORS["panel"], COLORS["cyan"], 14, 2)
        self.text("你的手牌", self.body_font, COLORS["gold"], top_left=(70, 382))
        self.draw_melds(state["players"][0].get("melds", []), 398, 32, 42)
        hand = human_hand_tiles(state)
        drawn_tile = current_drawn_tile(state, 0)
        tile_w, tile_h, tile_gap = 72, 96, 4
        drawn_width = tile_w + 34 if drawn_tile else 0
        total_width = len(hand) * tile_w + max(0, len(hand) - 1) * tile_gap + drawn_width
        start_x = max(66, int((LOGICAL_SIZE[0] - total_width) / 2))
        for index, tile_id in enumerate(hand):
            x = start_x + index * (tile_w + tile_gap)
            self.text(chr(ord("A") + index), self.heading_font, COLORS["gold"], center=(x + tile_w / 2, 452))
            self.draw_tile(tile_id, (x, 468, tile_w, tile_h))
        if drawn_tile:
            drawn_x = start_x + len(hand) * (tile_w + tile_gap) + 28
            self.text("摸進", self.small_font, COLORS["gold"], center=(drawn_x + tile_w / 2, 452))
            self.draw_tile(drawn_tile, (drawn_x, 468, tile_w, tile_h), highlighted=True)

        self.draw_status(state)
        self.draw_footer()
        if state.get("status") == "finished":
            self.draw_result_overlay(state)

    def draw_four_player_table(self) -> None:
        """Draw the four-seat table using the same native 1080p coordinate grid."""

        state = self.state
        players = state.get("players") or []
        if len(players) < 4:
            return
        self.canvas.fill(COLORS["ink"])
        self.panel((24, 18, 1232, 684), COLORS["table"], COLORS["table_edge"], 24, 3)

        # Seat order is clockwise from the player: 下家 (right), 對家 (top),
        # 上家 (left).  All three AI hands remain hidden but their counts,
        # portraits and exposed melds are visible.
        self.draw_four_top_seat(players[2])
        self.draw_four_side_seat(players[3], 42, 136, 190, 246)
        self.draw_four_side_seat(players[1], 1048, 136, 190, 246)

        discard_layout = DISCARD_LAYOUTS[4]
        self.panel(discard_layout["panel"], COLORS["table_dark"], COLORS["cyan"], 15, 2)
        self.text("牌山 {} 張".format(len(state.get("wall", []))), self.small_font, COLORS["gold"], center=(640, 148))
        discard_rows = (
            (2, "對家", 166),
            (3, "上家", 214),
            (1, "下家", 262),
            (0, "你", 310),
        )
        for seat, label, y in discard_rows:
            self.draw_discard_row(
                players[seat].get("discards", []),
                discard_layout["x"],
                y,
                label,
                max_visible=DISCARD_MAX_VISIBLE,
                tile_w=discard_layout["tile_w"],
                tile_h=discard_layout["tile_h"],
                tile_gap=discard_layout["tile_gap"],
                label_offset=discard_layout["label_offset"],
            )

        # The human hand keeps the large v2 face tiles and A-M key labels.
        # The portrait sits in the otherwise unused right side of this panel.
        self.panel((48, 397, 1184, 189), COLORS["panel"], COLORS["cyan"], 14, 2)
        self.text("你的手牌", self.body_font, COLORS["gold"], top_left=(70, 405))
        self.draw_compact_melds(players[0].get("melds", []), 270, 427, 700)
        self.draw_avatar("player", (1070, 402, 145, 82))
        hand = human_hand_tiles(state)
        drawn_tile = current_drawn_tile(state, 0)
        tile_w, tile_h, tile_gap = 60, 78, 2
        drawn_width = tile_w + 26 if drawn_tile else 0
        total_width = len(hand) * tile_w + max(0, len(hand) - 1) * tile_gap + drawn_width
        start_x = max(70, int((LOGICAL_SIZE[0] - total_width) / 2))
        for index, tile_id in enumerate(hand):
            x = start_x + index * (tile_w + tile_gap)
            self.text(chr(ord("A") + index), self.heading_font, COLORS["gold"], center=(x + tile_w / 2, 474))
            self.draw_tile(tile_id, (x, 488, tile_w, tile_h))
        if drawn_tile:
            drawn_x = start_x + len(hand) * (tile_w + tile_gap) + 22
            self.text("摸進", self.small_font, COLORS["gold"], center=(drawn_x + tile_w / 2, 474))
            self.draw_tile(drawn_tile, (drawn_x, 488, tile_w, tile_h), highlighted=True)

        self.draw_status(state)
        self.draw_footer()
        if state.get("status") == "finished":
            self.draw_result_overlay(state)

    def draw_four_top_seat(self, player: Dict[str, object]) -> None:
        border = COLORS["gold"] if self.state.get("turn_seat") == player.get("seat") else COLORS["cyan"]
        self.panel((42, 26, 1196, 100), COLORS["panel_alt"], border, 12, 2)
        self.text(player.get("name", "對家"), self.heading_font, COLORS["gold"], top_left=(58, 36))
        self.text("手牌 {} 張".format(len(player.get("hand", []))), self.small_font, COLORS["cream"], top_left=(59, 70))
        hidden_count = min(13, max(0, len(player.get("hand", []))))
        tile_w, tile_h, tile_gap = 34, 44, 3
        total_width = hidden_count * tile_w + max(0, hidden_count - 1) * tile_gap
        start_x = int((LOGICAL_SIZE[0] - total_width) / 2)
        for index in range(hidden_count):
            self.draw_tile("", (start_x + index * (tile_w + tile_gap), 35, tile_w, tile_h), hidden=True, small=True)
        self.draw_compact_melds(player.get("melds", []), 405, 88, 620)
        self.draw_avatar(FOUR_PLAYER_AVATARS.get(player.get("seat"), "opponent"), (1080, 30, 145, 86))

    def draw_four_side_seat(
        self, player: Dict[str, object], x: int, y: int, width: int, height: int
    ) -> None:
        border = COLORS["gold"] if self.state.get("turn_seat") == player.get("seat") else COLORS["cyan"]
        self.panel((x, y, width, height), COLORS["panel_alt"], border, 12, 2)
        self.text(player.get("name", "電腦"), self.small_font, COLORS["gold"], top_left=(x + 8, y + 8))
        self.text("手牌 {} 張".format(len(player.get("hand", []))), self.small_font, COLORS["cream"], top_left=(x + 8, y + 35))
        self.draw_avatar(FOUR_PLAYER_AVATARS.get(player.get("seat"), "opponent"), (x + 94, y + 4, 86, 62))
        hidden_count = min(13, max(0, len(player.get("hand", []))))
        tile_w, tile_h, tile_gap = 23, 31, 2
        for index in range(hidden_count):
            row, column = divmod(index, 7)
            self.draw_tile(
                "",
                (x + 7 + column * (tile_w + tile_gap), y + 76 + row * (tile_h + 3), tile_w, tile_h),
                hidden=True,
                small=True,
            )
        self.draw_compact_melds(player.get("melds", []), x + 7, y + 155, width - 14, 17, 24)

    def draw_compact_melds(
        self,
        melds: Sequence[Dict[str, object]],
        x: int,
        y: int,
        width: int,
        tile_w: int = 20,
        tile_h: int = 28,
    ) -> None:
        groups = []
        for meld in melds or []:
            if not isinstance(meld, dict):
                continue
            tiles = [tile_id for tile_id in (meld.get("tiles") or []) if isinstance(tile_id, str)]
            if tiles:
                groups.append(tiles)
        if not groups:
            return

        cursor_x = x
        cursor_y = y
        row_right = x + max(80, width)
        for group in groups:
            group_width = len(group) * tile_w + max(0, len(group) - 1) * 2
            if cursor_x + group_width > row_right:
                cursor_x = x
                cursor_y += tile_h + 6
            for tile_id in group:
                self.draw_tile(tile_id, (cursor_x, cursor_y, tile_w, tile_h), small=True)
                cursor_x += tile_w + 2
            cursor_x += 5

    def draw_discard_row(
        self,
        discards: Sequence[Dict[str, object]],
        x: int,
        y: int,
        label: str,
        max_visible: int = DISCARD_MAX_VISIBLE,
        tile_w: int = 50,
        tile_h: int = 67,
        tile_gap: int = 4,
        label_offset: int = 58,
    ) -> None:
        # The default 50×67 logical tile is used by 2P.  4P passes a compact
        # size so four seat rows fit in the central discard arena while still
        # using the high-resolution v2 raster asset.
        self.text(label, self.small_font, COLORS["cream"], top_left=(x - label_offset, y + 12))
        visible = list(discards)[-max(1, max_visible):]
        for index, discard in enumerate(visible):
            self.draw_tile(
                discard.get("tile_id", ""),
                (x + index * (tile_w + tile_gap), y, tile_w, tile_h),
                highlighted=not discard.get("claimed", False),
            )

    def draw_status(self, state: Dict[str, object]) -> None:
        phase = state.get("phase")
        win_action = ""
        if phase == "draw":
            message = state.get("message", "輪到你摸牌：按紅色「摸牌」鍵。")
        elif phase == "discard":
            if current_drawn_tile(state, 0):
                player = state["players"][0]
                evaluation = evaluate_winning_hand(player.get("hand", []), player.get("melds", []))
                if evaluation.get("can_win"):
                    message = "可自摸！按「胡」；或按 A–M 出牌／再次按「摸牌」丟出摸進牌。"
                    win_action = "self_draw"
                else:
                    message = "摸進牌會停留在右側；按 A–M 出牌，或再次按「摸牌」丟出摸進牌。"
            else:
                player = state["players"][0]
                evaluation = evaluate_winning_hand(player.get("hand", []), player.get("melds", []))
                if evaluation.get("can_win"):
                    message = "可胡牌！按「胡」完成胡牌。"
                    win_action = "win"
                else:
                    message = "請按手牌上方的 A–M 出牌。"
        elif phase == "response":
            choices = get_human_claim_choices(state)
            if any(choice.get("type") == "claimWin" for choice in choices):
                message = "可胡牌！按「胡」；也可按「槓」「碰」「吃」或「小」過牌。"
                win_action = "win"
            else:
                message = state.get("message", "請選擇胡、碰、吃或過牌。")
        elif phase == "bot" or phase == "bot_discard":
            message = state.get("message", "電腦思考中。")
        else:
            message = state.get("message", "")
        self.panel(
            (72, 596, 1136, 42),
            COLORS["panel_alt"],
            COLORS["red"] if win_action else COLORS["gold"],
            8,
            3 if win_action else 1,
        )
        self.text(message, self.small_font, COLORS["gold"] if win_action else COLORS["cream"], center=(640, 617))

    def draw_footer(self) -> None:
        self.text(
            "胡（胡牌／自摸）　得分：離開遊戲",
            self.small_font,
            COLORS["cream"],
            center=(640, 680),
        )

    def draw_result_overlay(self, state: Dict[str, object]) -> None:
        shade = self.pygame.Surface(self.logical_size, self.pygame.SRCALPHA)
        shade.fill((2, 8, 10, 175))
        self.canvas.blit(shade, (0, 0))
        self.panel((270, 140, 740, 420), COLORS["panel"], COLORS["gold"], 18, 3)
        result = state.get("result") or {}
        if result.get("win_kind") == "draw":
            title = "流局"
        elif result.get("win_kind") == "selfDraw":
            title = "{} · 自摸".format(state["players"][result.get("winner_seat", 0)]["name"])
        else:
            title = "{} · 胡牌".format(state["players"][result.get("winner_seat", 0)]["name"])
        self.text(title, self.title_font, COLORS["gold"], center=(640, 220))
        patterns = "、".join(result.get("patterns") or []) or "沒有額外台型"
        self.text(patterns, self.body_font, COLORS["cyan"], center=(640, 292))
        if result.get("win_kind") == "draw":
            score_text = "本局沒有分數變化"
        else:
            score_text = "{} 台　{} 點".format(result.get("total_tai", 0), result.get("round_score", 0))
        self.text(score_text, self.heading_font, COLORS["cream"], center=(640, 356))
        score_delta = result.get("score_delta") or []
        if len(state.get("players", [])) == 4 and len(score_delta) == 4:
            score_line = "　".join(
                "{} {:+}".format(player.get("name", ""), int(score_delta[index]))
                for index, player in enumerate(state["players"])
            )
            self.text(score_line, self.small_font, COLORS["cyan"], center=(640, 412))
        self.text("摸牌：再開一局　得分：離開", self.body_font, COLORS["gold"], center=(640, 466))

    def draw(self) -> None:
        if self.screen_name == "menu":
            self.draw_menu()
        elif self.state:
            self.draw_table()

    def run(self, max_frames: int = 0) -> None:
        running = True
        frames = 0
        while running:
            for event in self.pygame.event.get():
                if event.type == self.pygame.QUIT:
                    running = False
                elif event.type == self.pygame.KEYDOWN:
                    running = self.key(event)
            self.tick_state()
            self.draw()
            width, height = self.screen.get_size()
            if self.render_mode == "native-1080p" and (width, height) == self.logical_size:
                target_size = self.logical_size
                scaled = self.canvas
            else:
                scale = min(width / float(self.logical_size[0]), height / float(self.logical_size[1]))
                target_size = (
                    max(1, int(self.logical_size[0] * scale)),
                    max(1, int(self.logical_size[1] * scale)),
                )
                scaled = self.image_scaler()(self.canvas, target_size)
            self.screen.fill(COLORS["ink"])
            self.screen.blit(scaled, ((width - target_size[0]) // 2, (height - target_size[1]) // 2))
            self.pygame.display.flip()
            self.clock.tick(self.fps)
            frames += 1
            if max_frames and frames >= max_frames:
                running = False
        self.save_if_enabled()
        self.sound.close()
        self.pygame.quit()


def main(argv=None):
    parser = argparse.ArgumentParser(description="麻將 Web solo 2P/4P 的 RetroPie Pygame 版")
    parser.add_argument("--headless", action="store_true", help="run a deterministic engine smoke round")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--player-count", type=int, choices=(2, 4), default=2, help="headless QA player count")
    parser.add_argument("--save", type=str, default=None, help="optional path for an atomic session save")
    parser.add_argument("--smoke-frames", type=int, default=0)
    parser.add_argument("--fullscreen", action="store_true")
    parser.add_argument("--windowed", dest="fullscreen", action="store_false")
    parser.add_argument("--low-power", action="store_true", help="use the Pygame 1.9.4-friendly scaler")
    parser.add_argument(
        "--render-mode",
        choices=RENDER_MODES,
        default=None,
        help="render experiment: low-power, smoothscale, or native-1080p",
    )
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--input-profile", choices=("mahjong",), default="mahjong")
    parser.set_defaults(fullscreen=False)
    args = parser.parse_args(argv)
    if args.headless:
        from .engine import run_headless

        print(run_headless(args.seed, player_count=args.player_count))
        return
    try:
        import pygame
    except ImportError as error:
        raise SystemExit("Pygame is optional for the engine. Install the RetroPie Pygame runtime to launch the table.") from error
    pygame.mixer.pre_init(22050, -16, 1, 512)
    pygame.init()
    save_path = args.save if args.save else None
    app = MahjongPygame(
        pygame,
        seed=args.seed,
        save_path=save_path,
        fullscreen=args.fullscreen,
        low_power=args.low_power,
        fps=args.fps,
        input_profile=args.input_profile,
        render_mode=args.render_mode,
    )
    app.run(args.smoke_frames)


if __name__ == "__main__":
    main()

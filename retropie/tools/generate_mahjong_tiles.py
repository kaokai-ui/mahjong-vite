"""Generate the raster Mahjong tile library used by the RetroPie scene.

The browser version can render the original SVG tile art, but the Pi image
uses legacy Pygame/SDL and must load ordinary PNG files.  This tool keeps the
asset source deterministic: the 34 standard tile faces are drawn from the
same proportions, colours, and symbol layout as ``src/tile-art.js``.  The
ImageGen atlas is kept beside these files as a visual style reference, not as
the source of gameplay symbols, because generated text and glyphs are not
reliable enough for a tile face.

Run from the repository root with the bundled development Python runtime:

    python retropie/tools/generate_mahjong_tiles.py
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from PIL import Image, ImageDraw, ImageFont


BASE_TILE_SIZE = (160, 220)
SUPERSAMPLE = 3
TILE_SCALE = 1
TILE_SIZE = BASE_TILE_SIZE
SCALE = SUPERSAMPLE
SUITS = ("m", "p", "s")
HONORS = ("E", "S", "W", "N", "R", "G", "B")
TILE_TYPES = tuple(
    ["{}{}".format(suit, rank) for suit in SUITS for rank in range(1, 10)] + list(HONORS)
)
NUMBER_LABELS = ("", "一", "二", "三", "四", "五", "六", "七", "八", "九")
HONOR_LABELS = {
    "E": "東",
    "S": "南",
    "W": "西",
    "N": "北",
    "R": "中",
    "G": "發",
}

COLORS = {
    "blue": (75, 99, 162, 255),
    "blue_dark": (51, 73, 125, 255),
    "green": (47, 140, 97, 255),
    "green_dark": (29, 103, 71, 255),
    "red": (198, 80, 88, 255),
    "red_dark": (149, 56, 62, 255),
    "gold": (216, 180, 90, 255),
    "frame": (216, 208, 196, 255),
    "face": (255, 253, 250, 255),
    "face_inner": (255, 255, 255, 245),
    "shadow": (231, 223, 209, 220),
    "shadow_dark": (158, 147, 125, 150),
}

FONT_CANDIDATES = (
    r"C:\Windows\Fonts\msjhbd.ttc",
    r"C:\Windows\Fonts\msjh.ttc",
    r"C:\Windows\Fonts\mingliu.ttc",
    r"C:\Windows\Fonts\NotoSansCJKtc-Regular.otf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
)


def _configure_output_scale(output_scale: int) -> None:
    """Configure a versioned output size while keeping the same tile geometry."""

    if output_scale < 1 or output_scale > 8:
        raise ValueError("output scale must be between 1 and 8")
    global TILE_SCALE, TILE_SIZE, SCALE
    TILE_SCALE = output_scale
    TILE_SIZE = (
        BASE_TILE_SIZE[0] * output_scale,
        BASE_TILE_SIZE[1] * output_scale,
    )
    # Render at 3x the requested output size, then downsample once.  This
    # keeps the v1 output identical while making v2 suitable for native 1080p.
    SCALE = SUPERSAMPLE * output_scale


def _scaled_box(box: Sequence[float]) -> Tuple[int, int, int, int]:
    return tuple(int(round(value * SCALE)) for value in box)  # type: ignore[return-value]


def _scaled_point(point: Sequence[float]) -> Tuple[int, int]:
    return int(round(point[0] * SCALE)), int(round(point[1] * SCALE))


def _font_path() -> Optional[str]:
    configured = os.environ.get("MAHJONG_TILE_FONT")
    candidates = ((configured,) if configured else ()) + FONT_CANDIDATES
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    return None


class TileRenderer:
    def __init__(self) -> None:
        self.font_file = _font_path()
        if not self.font_file:
            raise RuntimeError(
                "找不到可繪製中文牌面的字型；請設定 MAHJONG_TILE_FONT 或安裝 Microsoft JhengHei/Noto Sans CJK。"
            )
        self.fonts: Dict[Tuple[int, bool], ImageFont.FreeTypeFont] = {}
        self.resampling = getattr(Image, "Resampling", Image).LANCZOS
        self.rotation_resampling = getattr(Image, "Resampling", Image).BICUBIC

    def font(self, size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
        key = (size, bold)
        if key not in self.fonts:
            self.fonts[key] = ImageFont.truetype(self.font_file, size * SCALE, index=0)
        return self.fonts[key]

    def new_tile(self) -> Tuple[Image.Image, ImageDraw.ImageDraw]:
        image = Image.new(
            "RGBA",
            (BASE_TILE_SIZE[0] * SCALE, BASE_TILE_SIZE[1] * SCALE),
            (0, 0, 0, 0),
        )
        draw = ImageDraw.Draw(image, "RGBA")
        draw.rounded_rectangle(
            _scaled_box((12, 16, 148, 208)),
            radius=18 * SCALE,
            fill=COLORS["shadow"],
        )
        draw.rounded_rectangle(
            _scaled_box((6, 6, 154, 206)),
            radius=18 * SCALE,
            fill=COLORS["face"],
            outline=COLORS["frame"],
            width=max(1, int(2.5 * SCALE)),
        )
        draw.rounded_rectangle(
            _scaled_box((11, 11, 149, 201)),
            radius=15 * SCALE,
            fill=COLORS["face_inner"],
        )
        return image, draw

    def finish(self, image: Image.Image) -> Image.Image:
        return image.resize(TILE_SIZE, self.resampling)

    def centered_text(
        self,
        draw: ImageDraw.ImageDraw,
        text: str,
        point: Tuple[float, float],
        size: int,
        color: Tuple[int, int, int, int],
        bold: bool = True,
    ) -> None:
        xy = _scaled_point(point)
        font = self.font(size, bold)
        draw.text(
            (xy[0] + 2 * SCALE, xy[1] + 3 * SCALE),
            text,
            font=font,
            fill=(51, 45, 38, 80),
            anchor="mm",
        )
        draw.text(xy, text, font=font, fill=color, anchor="mm")

    def pip(
        self,
        draw: ImageDraw.ImageDraw,
        point: Tuple[float, float],
        color_name: str,
        scale: float = 1.0,
    ) -> None:
        x, y = point
        radius = 14.0 * scale
        dark = COLORS["{}_dark".format(color_name)]
        color = COLORS[color_name]
        draw.ellipse(_scaled_box((x - radius + 2, y - radius + 3, x + radius + 2, y + radius + 3)), fill=(51, 45, 38, 65))
        draw.ellipse(_scaled_box((x - radius, y - radius, x + radius, y + radius)), fill=dark)
        draw.ellipse(
            _scaled_box((x - radius + 3, y - radius + 3, x + radius - 3, y + radius - 3)),
            fill=COLORS["face"],
            outline=color,
            width=max(1, 2 * SCALE),
        )
        inner = radius - 7
        draw.ellipse(_scaled_box((x - inner, y - inner, x + inner, y + inner)), fill=color)
        draw.ellipse(
            _scaled_box((x - inner + 3, y - inner + 3, x + inner - 3, y + inner - 3)),
            fill=COLORS["face"],
        )

    def pin_one(self, draw: ImageDraw.ImageDraw) -> None:
        center = (80, 108)
        x, y = center
        draw.ellipse(_scaled_box((x - 40, y - 40, x + 40, y + 40)), outline=COLORS["green"], width=6 * SCALE)
        draw.ellipse(_scaled_box((x - 31, y - 31, x + 31, y + 31)), outline=COLORS["gold"], width=5 * SCALE)
        draw.ellipse(
            _scaled_box((x - 23, y - 23, x + 23, y + 23)),
            fill=COLORS["face"],
            outline=COLORS["green"],
            width=max(1, int(2.6 * SCALE)),
        )
        for index in range(8):
            import math

            angle = math.pi / 4.0 * index
            px = x + math.cos(angle) * 20
            py = y + math.sin(angle) * 20
            color = COLORS["red"] if index % 2 == 0 else COLORS["green"]
            draw.ellipse(_scaled_box((px - 6.5, py - 6.5, px + 6.5, py + 6.5)), outline=color, width=int(3.2 * SCALE))
        draw.ellipse(_scaled_box((x - 13.5, y - 13.5, x + 13.5, y + 13.5)), outline=COLORS["red"], width=int(4.2 * SCALE))
        draw.ellipse(_scaled_box((x - 5.2, y - 5.2, x + 5.2, y + 5.2)), fill=COLORS["red"])

    def draw_bamboo_mark(
        self,
        image: Image.Image,
        point: Tuple[float, float],
        color_name: str,
        length: float = 44,
        width: float = 7.2,
        rotate: float = 0,
        scale: float = 1.0,
    ) -> None:
        local_w = int(56 * SCALE)
        local_h = int((length + 20) * SCALE)
        local = Image.new("RGBA", (local_w, local_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(local, "RGBA")
        cx = local_w // 2
        half = length * SCALE / 2.0
        body_w = max(2, int(width * SCALE * scale))
        left = int(cx - body_w / 2)
        right = int(cx + body_w / 2)
        top = int(local_h / 2 - half)
        bottom = int(local_h / 2 + half)
        dark = COLORS["{}_dark".format(color_name)]
        color = COLORS[color_name]
        draw.rounded_rectangle((left - SCALE, top, right + SCALE, bottom), radius=body_w, fill=dark)
        draw.rounded_rectangle((left, top, right, bottom), radius=max(1, body_w // 2), fill=color)
        for node_y in (top + int((bottom - top) * 0.30), top + int((bottom - top) * 0.70)):
            draw.line((left - SCALE, node_y, right + SCALE, node_y), fill=COLORS["face"], width=max(1, SCALE))
        if rotate:
            local = local.rotate(rotate, resample=self.rotation_resampling, expand=True)
        px = int(point[0] * SCALE - local.width / 2)
        py = int(point[1] * SCALE - local.height / 2)
        image.alpha_composite(local, (px, py))

    def bamboo_bird(self, draw: ImageDraw.ImageDraw) -> None:
        green = COLORS["green"]
        dark = COLORS["green_dark"]
        points = [_scaled_point(point) for point in ((56, 138), (62, 118), (78, 91), (100, 72), (116, 76), (112, 98), (92, 120), (75, 129))]
        draw.line(points, fill=green, width=6 * SCALE, joint="curve")
        draw.line(
            [_scaled_point(point) for point in ((72, 120), (88, 111), (101, 118))],
            fill=dark,
            width=3 * SCALE,
            joint="curve",
        )
        draw.polygon(
            [_scaled_point(point) for point in ((72, 120), (94, 116), (86, 103))],
            fill=(75, 99, 162, 200),
        )
        draw.ellipse(_scaled_box((91, 76, 100, 85)), fill=COLORS["red"])
        draw.polygon([_scaled_point(point) for point in ((99, 78), (117, 83), (100, 88))], fill=COLORS["gold"])
        draw.line(
            [_scaled_point(point) for point in ((64, 136), (52, 157), (70, 145), (58, 164))],
            fill=green,
            width=int(4.2 * SCALE),
        )

    def face(self, tile_type: str) -> Image.Image:
        image, draw = self.new_tile()
        if len(tile_type) == 2 and tile_type[0] == "m":
            rank = int(tile_type[1])
            self.centered_text(draw, NUMBER_LABELS[rank], (80, 70), 84, COLORS["blue"])
            self.centered_text(draw, "萬", (80, 152), 68, COLORS["red"])
        elif len(tile_type) == 2 and tile_type[0] == "p":
            self.pin_face(draw, int(tile_type[1]))
        elif len(tile_type) == 2 and tile_type[0] == "s":
            self.bamboo_face(image, draw, int(tile_type[1]))
        elif tile_type == "B":
            self.white_dragon(draw)
        else:
            color_name = "red" if tile_type == "R" else "green" if tile_type == "G" else "blue"
            self.centered_text(draw, HONOR_LABELS.get(tile_type, tile_type), (80, 118), 124 if tile_type in ("R", "G") else 116, COLORS[color_name])
        return self.finish(image)

    def pin_face(self, draw: ImageDraw.ImageDraw, rank: int) -> None:
        patterns = {
            2: [((80, 72), "blue", 1.0), ((80, 148), "green", 1.0)],
            3: [((58, 70), "blue", 1.0), ((80, 110), "red", 1.0), ((102, 150), "green", 1.0)],
            4: [((56, 72), "blue", 1.0), ((104, 72), "green", 1.0), ((56, 148), "green", 1.0), ((104, 148), "blue", 1.0)],
            5: [((56, 72), "blue", 1.0), ((104, 72), "green", 1.0), ((80, 110), "red", 1.0), ((56, 148), "green", 1.0), ((104, 148), "blue", 1.0)],
            6: [((62, 56), "blue", 1.0), ((98, 56), "green", 1.0), ((62, 122), "red", 1.0), ((98, 122), "red", 1.0), ((62, 160), "red", 1.0), ((98, 160), "red", 1.0)],
            7: [((50, 44), "green", 0.94), ((80, 62), "green", 0.94), ((110, 80), "green", 0.94), ((62, 122), "red", 1.0), ((98, 122), "red", 1.0), ((62, 156), "red", 1.0), ((98, 156), "red", 1.0)],
            8: [((60, 52), "blue", 0.94), ((100, 52), "blue", 0.94), ((60, 88), "blue", 0.94), ((100, 88), "blue", 0.94), ((60, 124), "blue", 0.94), ((100, 124), "blue", 0.94), ((60, 160), "blue", 0.94), ((100, 160), "blue", 0.94)],
            9: [((44, 50), "blue", 0.82), ((80, 50), "blue", 0.82), ((116, 50), "blue", 0.82), ((44, 106), "red", 0.82), ((80, 106), "red", 0.82), ((116, 106), "red", 0.82), ((44, 162), "green", 0.82), ((80, 162), "green", 0.82), ((116, 162), "green", 0.82)],
        }
        if rank == 1:
            self.pin_one(draw)
            return
        for point, color_name, scale in patterns[rank]:
            self.pip(draw, point, color_name, scale)

    def bamboo_face(self, image: Image.Image, draw: ImageDraw.ImageDraw, rank: int) -> None:
        patterns = {
            2: [((80, 68), "green", 44, 7.2, 0, 1.0), ((80, 148), "green", 44, 7.2, 0, 1.0)],
            3: [((80, 60), "green", 44, 7.2, 0, 1.0), ((62, 146), "green", 44, 7.2, 0, 1.0), ((98, 146), "green", 44, 7.2, 0, 1.0)],
            4: [((60, 66), "green", 44, 7.2, 0, 1.0), ((100, 66), "green", 44, 7.2, 0, 1.0), ((60, 148), "green", 44, 7.2, 0, 1.0), ((100, 148), "green", 44, 7.2, 0, 1.0)],
            5: [((60, 64), "green", 44, 7.2, 0, 1.0), ((100, 64), "green", 44, 7.2, 0, 1.0), ((80, 106), "red", 44, 7.2, 0, 1.0), ((60, 148), "green", 44, 7.2, 0, 1.0), ((100, 148), "green", 44, 7.2, 0, 1.0)],
            6: [((52, 64), "green", 44, 7.2, 0, 1.0), ((80, 64), "green", 44, 7.2, 0, 1.0), ((108, 64), "green", 44, 7.2, 0, 1.0), ((52, 148), "green", 44, 7.2, 0, 1.0), ((80, 148), "green", 44, 7.2, 0, 1.0), ((108, 148), "green", 44, 7.2, 0, 1.0)],
            7: [((80, 44), "red", 40, 7.2, 0, 1.0), ((58, 98), "green", 40, 7.2, 0, 1.0), ((58, 156), "green", 40, 7.2, 0, 1.0), ((80, 98), "blue", 40, 7.2, 0, 1.0), ((80, 156), "green", 40, 7.2, 0, 1.0), ((102, 98), "green", 40, 7.2, 0, 1.0), ((102, 156), "green", 40, 7.2, 0, 1.0)],
            8: [((52, 72), "green", 44, 7.2, 0, 1.0), ((72, 70), "green", 42, 7.2, 30, 1.0), ((88, 70), "green", 42, 7.2, -30, 1.0), ((108, 72), "green", 44, 7.2, 0, 1.0), ((52, 144), "green", 44, 7.2, 0, 1.0), ((72, 146), "green", 42, 7.2, -30, 1.0), ((88, 146), "green", 42, 7.2, 30, 1.0), ((108, 144), "green", 44, 7.2, 0, 1.0)],
            9: [((50, 56), "blue", 44, 7.2, 0, 0.84), ((50, 108), "blue", 44, 7.2, 0, 0.84), ((50, 160), "blue", 44, 7.2, 0, 0.84), ((80, 56), "red", 44, 7.2, 0, 0.84), ((80, 108), "red", 44, 7.2, 0, 0.84), ((80, 160), "red", 44, 7.2, 0, 0.84), ((110, 56), "green", 44, 7.2, 0, 0.84), ((110, 108), "green", 44, 7.2, 0, 0.84), ((110, 160), "green", 44, 7.2, 0, 0.84)],
        }
        if rank == 1:
            self.bamboo_bird(draw)
            return
        for point, color_name, length, width, rotate, scale in patterns[rank]:
            self.draw_bamboo_mark(image, point, color_name, length, width, rotate, scale)

    def white_dragon(self, draw: ImageDraw.ImageDraw) -> None:
        blue = COLORS["blue"]
        draw.rounded_rectangle(_scaled_box((42, 46, 118, 166)), radius=10 * SCALE, outline=blue, width=int(5.6 * SCALE))
        draw.rounded_rectangle(_scaled_box((54, 58, 106, 154)), radius=6 * SCALE, outline=blue, width=int(3.2 * SCALE))
        for points in (
            ((46, 52), (64, 52), (46, 76)),
            ((114, 52), (96, 52), (114, 76)),
            ((46, 160), (64, 160), (46, 136)),
            ((114, 160), (96, 160), (114, 136)),
        ):
            draw.line([_scaled_point(point) for point in points], fill=blue, width=int(3.2 * SCALE), joint="curve")

    def back(self) -> Image.Image:
        image, draw = self.new_tile()
        green = COLORS["green_dark"]
        draw.rounded_rectangle(_scaled_box((30, 34, 130, 178)), radius=12 * SCALE, outline=green, width=int(5 * SCALE))
        draw.rounded_rectangle(_scaled_box((42, 46, 118, 166)), radius=8 * SCALE, outline=COLORS["green"], width=int(3 * SCALE))
        for x in range(48, 119, 12):
            draw.line([_scaled_point((x, 52)), _scaled_point((x + 26, 78)), _scaled_point((x, 104)), _scaled_point((x + 26, 130)), _scaled_point((x, 156))], fill=green, width=2 * SCALE)
            draw.line([_scaled_point((x + 26, 52)), _scaled_point((x, 78)), _scaled_point((x + 26, 104)), _scaled_point((x, 130)), _scaled_point((x + 26, 156))], fill=green, width=2 * SCALE)
        return self.finish(image)


def _write_png(image: Image.Image, path: Path) -> None:
    image.save(str(path), "PNG", optimize=True)


def _write_atlas(renderer: TileRenderer, output: Path) -> None:
    margin = 8 * TILE_SCALE
    gap = 8 * TILE_SCALE
    columns = 5
    rows = (len(TILE_TYPES) + columns - 1) // columns
    width = margin * 2 + columns * TILE_SIZE[0] + (columns - 1) * gap
    height = margin * 2 + rows * TILE_SIZE[1] + (rows - 1) * gap
    atlas = Image.new("RGBA", (width, height), (246, 242, 232, 255))
    for index, tile_type in enumerate(TILE_TYPES):
        tile = renderer.face(tile_type)
        x = margin + (index % columns) * (TILE_SIZE[0] + gap)
        y = margin + (index // columns) * (TILE_SIZE[1] + gap)
        atlas.alpha_composite(tile, (x, y))
    _write_png(atlas, output / "atlas-34.png")


def generate(output: Path, output_scale: int = 1, asset_version: Optional[str] = None) -> Dict[str, object]:
    _configure_output_scale(output_scale)
    output.mkdir(parents=True, exist_ok=True)
    renderer = TileRenderer()
    files = {}
    for tile_type in TILE_TYPES:
        filename = "tile-{}.png".format(tile_type)
        _write_png(renderer.face(tile_type), output / filename)
        files[tile_type] = filename
    _write_png(renderer.back(), output / "tile-back.png")
    _write_atlas(renderer, output)
    manifest = {
        "asset_version": asset_version or "v{}".format(output_scale),
        "format": "PNG RGBA",
        "tile_size": list(TILE_SIZE),
        "base_tile_size": list(BASE_TILE_SIZE),
        "render_scale": output_scale,
        "supersample": SUPERSAMPLE,
        "copies_per_type": 4,
        "tile_types": list(TILE_TYPES),
        "faces": files,
        "back": "tile-back.png",
        "atlas": "atlas-34.png",
        "style_reference": "reference/mahjong-tile-style-reference-v1.png",
        "source": "src/tile-art.js proportions and colours; deterministic raster generator",
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    default_output = Path(__file__).resolve().parents[1] / "assets" / "mahjong_tiles"
    parser = argparse.ArgumentParser(description="Generate reusable PNG Mahjong tile assets.")
    parser.add_argument("--output", type=Path, default=default_output)
    parser.add_argument(
        "--scale",
        type=int,
        default=1,
        help="output scale relative to the reusable 160x220 base tile (use 4 for v2)",
    )
    parser.add_argument("--asset-version", default=None)
    args = parser.parse_args()
    manifest = generate(args.output, output_scale=args.scale, asset_version=args.asset_version)
    print("generated {} faces + back + atlas in {}".format(len(manifest["tile_types"]), args.output))


if __name__ == "__main__":
    main()

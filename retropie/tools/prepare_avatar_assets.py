"""Prepare reusable, tightly cropped avatar PNGs for the RetroPie scene.

The v1 portraits are the original high-resolution ImageGen exports.  This
tool preserves those files and creates v2 copies with transparent margins
trimmed, so Pygame can use a larger visible portrait inside the same blank
table area without inventing new pixels.
"""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path
from typing import Dict, Tuple

from PIL import Image


AVATAR_KEYS = ("player", "opponent", "opponent-scarlet", "opponent-jade")


def _is_checkerboard_pixel(pixel: Tuple[int, int, int]) -> bool:
    """Recognize the neutral light pixels used by ImageGen's baked preview grid."""

    return max(pixel) - min(pixel) <= 8 and min(pixel) >= 225


def remove_checkerboard(image: Image.Image) -> Image.Image:
    """Make an RGB checkerboard preview transparent without touching the subject."""

    if "A" in image.getbands():
        return image.convert("RGBA")

    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    visited = bytearray(width * height)
    queue = deque()

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if visited[index] or not _is_checkerboard_pixel(pixels[x, y]):
            return
        visited[index] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    alpha = Image.new("L", rgb.size, 255)
    alpha_pixels = alpha.load()
    for index, is_background in enumerate(visited):
        if is_background:
            alpha_pixels[index % width, index // width] = 0
    rgb.putalpha(alpha)
    return rgb


def prepare_avatar(source: Path, target: Path, padding: int = 12) -> Dict[str, object]:
    image = remove_checkerboard(Image.open(str(source)))
    alpha_bbox = image.getchannel("A").getbbox()
    if alpha_bbox is None:
        raise ValueError("avatar has no visible pixels: {}".format(source))
    left, top, right, bottom = alpha_bbox
    crop_box = (
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    )
    cropped = image.crop(crop_box)
    target.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(str(target), "PNG", optimize=True)
    return {
        "source": source.name,
        "source_size": list(image.size),
        "alpha_bbox": list(alpha_bbox),
        "crop_box": list(crop_box),
        "size": list(cropped.size),
        "padding": padding,
    }


def prepare(
    input_dir: Path,
    output_dir: Path,
    padding: int = 12,
    clean_rgb_sources: bool = False,
) -> Dict[str, object]:
    if clean_rgb_sources:
        for key in AVATAR_KEYS:
            source = input_dir / "{}-v1.png".format(key)
            image = Image.open(str(source))
            if "A" not in image.getbands():
                remove_checkerboard(image).save(str(source), "PNG", optimize=True)
    assets = {}
    for key in AVATAR_KEYS:
        source = input_dir / "{}-v1.png".format(key)
        target = output_dir / "{}-v2.png".format(key)
        assets[key] = prepare_avatar(source, target, padding=padding)
    manifest = {
        "asset_version": "v2",
        "format": "PNG RGBA",
        "source": "v1 ImageGen exports, alpha-bounds crop only; no resampling",
        "avatars": assets,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    default_dir = Path(__file__).resolve().parents[1] / "assets" / "avatars"
    parser = argparse.ArgumentParser(description="Create tightly cropped reusable avatar PNGs.")
    parser.add_argument("--input-dir", type=Path, default=default_dir)
    parser.add_argument("--output-dir", type=Path, default=default_dir)
    parser.add_argument("--padding", type=int, default=12)
    parser.add_argument(
        "--clean-rgb-sources",
        action="store_true",
        help="Convert RGB ImageGen checkerboard previews to transparent RGBA before cropping.",
    )
    args = parser.parse_args()
    manifest = prepare(
        args.input_dir,
        args.output_dir,
        padding=max(0, args.padding),
        clean_rgb_sources=args.clean_rgb_sources,
    )
    for key, info in manifest["avatars"].items():
        print("{}: {} -> {}".format(key, info["source_size"], info["size"]))


if __name__ == "__main__":
    main()

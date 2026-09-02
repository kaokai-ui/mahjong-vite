"""Verify the reusable high-resolution Mahjong and avatar asset libraries."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict

from PIL import Image


def _read_json(path: Path) -> Dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def verify(root: Path) -> None:
    tiles_dir = root / "mahjong_tiles_v2"
    manifest = _read_json(tiles_dir / "manifest.json")
    assert manifest.get("asset_version") == "v2"
    assert manifest.get("tile_size") == [640, 880]
    tile_types = manifest.get("tile_types") or []
    assert len(tile_types) == 34
    for tile_type in tile_types:
        filename = (manifest.get("faces") or {}).get(tile_type)
        assert filename
        with Image.open(str(tiles_dir / filename)) as image:
            assert image.size == (640, 880), (tile_type, image.size)
            assert image.mode == "RGBA", (tile_type, image.mode)
    with Image.open(str(tiles_dir / manifest["back"])) as image:
        assert image.size == (640, 880)

    avatars_dir = root / "avatars"
    avatar_manifest = _read_json(avatars_dir / "manifest.json")
    assert avatar_manifest.get("asset_version") == "v2"
    for key in ("player", "opponent"):
        path = avatars_dir / "{}-v2.png".format(key)
        with Image.open(str(path)) as image:
            assert image.mode == "RGBA", (key, image.mode)
            assert image.width >= 1000 and image.height >= 1000, (key, image.size)
    print("mahjong high-resolution assets: ok")


def main() -> None:
    default_root = Path(__file__).resolve().parents[1] / "assets"
    parser = argparse.ArgumentParser(description="Verify Mahjong RetroPie raster assets.")
    parser.add_argument("--root", type=Path, default=default_root)
    args = parser.parse_args()
    verify(args.root)


if __name__ == "__main__":
    main()

# RetroPie Mahjong tile assets

This folder is the reusable raster tile library for the native Mahjong game.
The RetroPie image uses legacy Pygame/SDL, so the game loads the PNG files in
this folder and does not depend on browser SVG support or a CJK font on the
Pi.

This is the preserved v1 library at 160×220 pixels per tile.  The current
native-1080p scene prefers the versioned `../mahjong_tiles_v2/` library at
640×880 pixels per tile and falls back to this folder if a v2 file is missing.

- `tile-m1.png` through `tile-m9.png`: 萬子 1–9
- `tile-p1.png` through `tile-p9.png`: 筒子 1–9
- `tile-s1.png` through `tile-s9.png`: 索子 1–9
- `tile-E.png`, `tile-S.png`, `tile-W.png`, `tile-N.png`, `tile-R.png`, `tile-G.png`, `tile-B.png`: 東南西北中發白
- `tile-back.png`: hidden-tile back
- `atlas-34.png`: all 34 unique faces in one atlas
- `manifest.json`: machine-readable mapping; each face represents four physical copies in the deck
- `reference/mahjong-tile-style-reference-v1.png`: ImageGen style reference based on the original game's ivory tile treatment

Regenerate the deterministic faces from the repository root with:

```text
python retropie/tools/generate_mahjong_tiles.py
```

The ImageGen reference is intentionally not used as the source of symbols.
Generated text can be distorted, while the gameplay PNGs must always show the
correct tile.  The deterministic generator follows `src/tile-art.js` colours,
proportions, suit layouts, and the custom white-dragon frame.

Generate v2 without overwriting this preserved v1 folder:

```text
python retropie/tools/generate_mahjong_tiles.py --output retropie/assets/mahjong_tiles_v2 --scale 4 --asset-version v2
```

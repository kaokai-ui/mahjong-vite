# RetroPie Mahjong tile assets v2

This folder contains the current high-resolution raster library used by the
native-1080p Pygame scene.  Each tile face is 640×880 pixels, generated from
the same deterministic geometry as the preserved v1 library.  The renderer
draws at 3× supersampling and downsamples once to the v2 output size, so the
game can resize the assets cleanly for the player hand, hidden opponent hand,
melds, and discard rows.

The folder is complete and reusable: it contains 34 unique faces, the hidden
tile back, `atlas-34.png`, `manifest.json`, and the style reference.  Four
physical copies of each face are represented by the manifest rather than by
duplicating the PNG files.

Regenerate it from the repository root with:

```text
python retropie/tools/generate_mahjong_tiles.py --output retropie/assets/mahjong_tiles_v2 --scale 4 --asset-version v2
```

The v1 library in `../mahjong_tiles/` is intentionally retained as a fallback.

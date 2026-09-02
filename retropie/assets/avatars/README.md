# RetroPie Mahjong avatars

These transparent Q-version portraits are reusable Pygame raster assets:

- `player-v1.png`: human player portrait, drawn in the blank space above the hand panel
- `opponent-v1.png`: computer opponent portrait, drawn below the computer's concealed tiles
- `player-v2.png`: v1 portrait with transparent alpha margins trimmed
- `opponent-v2.png`: v1 portrait with transparent alpha margins trimmed
- `opponent-scarlet-v1.png` / `opponent-scarlet-v2.png`: new coral-haired AI portrait
- `opponent-jade-v1.png` / `opponent-jade-v2.png`: new mint-haired AI portrait
- `manifest.json`: source bounds and crop metadata for the v2 files

Both images were generated with the built-in ImageGen tool as separate assets,
then copied into this project so the Pi does not need network access or SVG
support.  The scene fits each PNG into its slot while preserving its
transparent background.

The scene uses the v2 files and gives each seat a display slot. In 4P mode the
top opponent keeps `opponent-v2.png`; the left and right AI seats use the
scarlet and jade portraits so all three opponents are visually distinct. v2 is
not an AI upscale: it preserves the original high-resolution pixels and only
removes transparent outer margins.  The v1 exports remain available for
rollback or reuse by another game.

Regenerate the v2 copies from the repository root with:

```text
python retropie/tools/prepare_avatar_assets.py
```

若來源是 ImageGen 產生的 RGB 棋盤格預覽，先加上 `--clean-rgb-sources`；工具會
以邊界 flood fill 移除棋盤格並輸出真正的 RGBA PNG：

```text
python retropie/tools/prepare_avatar_assets.py --clean-rgb-sources
```

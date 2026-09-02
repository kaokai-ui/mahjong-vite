#!/usr/bin/env bash
set -euo pipefail

GAME_DIR="${MAHJONG_GAME_DIR:-/home/pi/RetroPie/ports/mahjong-vite}"

cd "$GAME_DIR/retropie"

exec python3 -m python.mahjong \
  --fullscreen \
  --render-mode native-1080p \
  --fps 30 \
  --input-profile mahjong \
  "$@"

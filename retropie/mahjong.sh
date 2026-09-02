#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR/retropie"

exec python3 -m python.mahjong \
  --windowed \
  --low-power \
  --fps 30 \
  --input-profile mahjong \
  "$@"

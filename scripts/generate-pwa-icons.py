#!/usr/bin/env python3
"""Forwarding shim.

The real icon generator is now maintained in one place:
    D:\\Game\\Tool\\pwa-icon-gen\\pwa_icon_gen.py

This used to be a full standalone script with the same defaults hardcoded
here (source=mahjongicon.png, output-dir=public/pwa, maskable background
13,48,40 at 80% inset). Verified byte-for-byte-visually identical output
against the canonical script before switching. Any CLI args you pass to
`npm run generate:pwa-icons -- --your --flags` are forwarded as-is (e.g.
--prefix, --source, --output-dir, --optimize-source-in-place); only
--source/--output-dir/--maskable-bg/--maskable-inset get a project default
injected when you don't supply them yourself.

Edit the logic in the canonical copy, not here.
"""
from __future__ import annotations

import runpy
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CANONICAL = PROJECT_ROOT.parent / "Tool" / "pwa-icon-gen" / "pwa_icon_gen.py"

DEFAULT_SOURCE = PROJECT_ROOT / "mahjongicon.png"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "public" / "pwa"
DEFAULT_MASKABLE_BG = "13,48,40,255"
DEFAULT_MASKABLE_INSET = "0.8"

if not CANONICAL.is_file():
    print(f"error: canonical icon generator not found at {CANONICAL}", file=sys.stderr)
    sys.exit(2)


def _has_flag(argv: list[str], flag: str) -> bool:
    return any(arg == flag or arg.startswith(flag + "=") for arg in argv)


passthrough = sys.argv[1:]
injected: list[str] = []
if not _has_flag(passthrough, "--source"):
    injected += ["--source", str(DEFAULT_SOURCE)]
if not _has_flag(passthrough, "--output-dir"):
    injected += ["--output-dir", str(DEFAULT_OUTPUT_DIR)]
if not _has_flag(passthrough, "--maskable-bg"):
    injected += ["--maskable-bg", DEFAULT_MASKABLE_BG]
if not _has_flag(passthrough, "--maskable-inset"):
    injected += ["--maskable-inset", DEFAULT_MASKABLE_INSET]

sys.argv = [str(CANONICAL), *injected, *passthrough]
runpy.run_path(str(CANONICAL), run_name="__main__")

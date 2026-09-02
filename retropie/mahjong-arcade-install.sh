#!/usr/bin/env bash
set -euo pipefail

ARCADE_DIR="${ARCADE_DIR:-/home/pi/RetroPie/roms/arcade}"
GAME_DIR="${MAHJONG_GAME_DIR:-/home/pi/RetroPie/ports/mahjong-vite}"
ARCADE_LAUNCHER="$ARCADE_DIR/mahjong-vite.sh"
# This Pi writes the ROM-folder gamelist when EmulationStation saves its
# in-memory list on exit.  Treat it as canonical and keep the two known
# EmulationStation copies synchronized as well.
ARCADE_GAMELIST="${ARCADE_GAMELIST:-$ARCADE_DIR/gamelist.xml}"
ARCADE_USER_GAMELIST="${ARCADE_USER_GAMELIST:-/home/pi/.emulationstation/gamelists/arcade/gamelist.xml}"
ARCADE_CONFIG_GAMELIST="${ARCADE_CONFIG_GAMELIST:-/opt/retropie/configs/all/emulationstation/gamelists/arcade/gamelist.xml}"

install -d -o pi -g pi -m 0755 "$ARCADE_DIR"
install -o pi -g pi -m 0755 "$GAME_DIR/retropie/mahjong-arcade.sh" "$ARCADE_LAUNCHER"

python3 - "$ARCADE_DIR/video-poker.sh" "$ARCADE_GAMELIST" "$ARCADE_USER_GAMELIST" "$ARCADE_CONFIG_GAMELIST" <<'PY'
import re
from pathlib import Path
import sys

MAHJONG_NAME = "KK麻將(2P/4P)"
MAHJONG_DESC = "Mahjong-vite 2P／4P 原生 Pygame 版本。"
VIDEO_DESC = "Video Poker（皇家賭城）RetroPie 版本。"
GAME_RE = re.compile(r"(?ms)^[ \t]*<game\b[^>]*>.*?^[ \t]*</game>[ \t]*(?:\r?\n|$)")


def tag_value(block, tag):
    match = re.search(r"<{}>\s*(.*?)\s*</{}>".format(tag, tag), block, re.S)
    return match.group(1).strip() if match else ""


def set_tag(block, tag, value):
    pattern = r"(<{}>).*?(</{}>)".format(tag, tag)
    return re.sub(pattern, lambda match: match.group(1) + value + match.group(2), block, count=1, flags=re.S)


def new_entry(path, name, description, genre):
    return (
        "  <game>\n"
        "    <path>{}</path>\n"
        "    <name>{}</name>\n"
        "    <desc>{}</desc>\n"
        "    <genre>{}</genre>\n"
        "  </game>\n"
    ).format(path, name, description, genre)


video_launcher = Path(sys.argv[1])
gamelist_paths = []
for raw_path in sys.argv[2:]:
    path = Path(raw_path)
    if str(path) not in gamelist_paths and path.is_file():
        gamelist_paths.append(str(path))

if not gamelist_paths:
    raise SystemExit("找不到可更新的 Arcade gamelist.xml")

for raw_path in gamelist_paths:
    path = Path(raw_path)
    text = path.read_text(encoding="utf-8")
    if "</gameList>" not in text:
        raise SystemExit("gamelist.xml 缺少 </gameList>: {}".format(path))

    matches = list(GAME_RE.finditer(text))
    mahjong = None
    video_poker = None
    other_blocks = []
    for match in matches:
        block = match.group(0)
        game_path = tag_value(block, "path")
        if game_path.endswith("mahjong-vite.sh"):
            if mahjong is None:
                mahjong = block
            continue
        if game_path.endswith("video-poker.sh"):
            if video_poker is None:
                video_poker = block
            continue
        other_blocks.append(block)

    if mahjong is None:
        mahjong = new_entry("./mahjong-vite.sh", MAHJONG_NAME, MAHJONG_DESC, "Mahjong")
    else:
        mahjong = set_tag(mahjong, "name", MAHJONG_NAME)
        mahjong = set_tag(mahjong, "desc", MAHJONG_DESC)

    if video_poker is None and video_launcher.is_file():
        video_poker = new_entry("./video-poker.sh", "Video Poker（皇家賭城）", VIDEO_DESC, "Card Game")
    elif video_poker is not None:
        video_poker = set_tag(video_poker, "desc", VIDEO_DESC)

    ordered_blocks = [mahjong]
    if video_poker is not None:
        ordered_blocks.append(video_poker)
    ordered_blocks.extend(other_blocks)

    if matches:
        prefix = text[:matches[0].start()]
        suffix = text[matches[-1].end():]
        text = prefix + "".join(ordered_blocks) + suffix
    else:
        text = text.replace("</gameList>", "\n" + "".join(ordered_blocks) + "</gameList>")
    path.write_text(text, encoding="utf-8")
    print("Updated Arcade order: {}".format(path))
PY

chown pi:pi "$ARCADE_LAUNCHER"
echo "Installed KK麻將(2P/4P) launcher: $ARCADE_LAUNCHER"

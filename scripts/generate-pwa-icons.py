from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SOURCE_PATH = ROOT / "mahjongicon.png"
OUTPUT_DIR = ROOT / "public" / "pwa"
BACKGROUND_COLOR = (13, 48, 40)

STANDARD_SIZES = [
    ("icon-192.png", 192),
    ("icon-512.png", 512),
    ("apple-touch-icon-180.png", 180),
    ("apple-touch-icon-167.png", 167),
    ("apple-touch-icon-152.png", 152),
    ("favicon-32.png", 32),
    ("favicon-16.png", 16),
]

MASKABLE_SIZES = [
    ("icon-maskable-192.png", 192),
    ("icon-maskable-512.png", 512),
]


def build_standard_icon(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.Resampling.LANCZOS)


def build_maskable_icon(image: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGB", (size, size), BACKGROUND_COLOR)
    inset_size = max(1, round(size * 0.8))
    inset_image = image.resize((inset_size, inset_size), Image.Resampling.LANCZOS)
    inset_left = (size - inset_size) // 2
    inset_top = (size - inset_size) // 2
    canvas.paste(inset_image, (inset_left, inset_top))
    return canvas


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source_image = Image.open(SOURCE_PATH).convert("RGB")

    for file_name, size in STANDARD_SIZES:
        build_standard_icon(source_image, size).save(OUTPUT_DIR / file_name, format="PNG")

    for file_name, size in MASKABLE_SIZES:
        build_maskable_icon(source_image, size).save(OUTPUT_DIR / file_name, format="PNG")

    print(f"Generated {len(STANDARD_SIZES) + len(MASKABLE_SIZES)} icons into {OUTPUT_DIR}")


if __name__ == "__main__":
    main()

import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE_PATH = ROOT / "mahjongicon.png"
DEFAULT_OUTPUT_DIR = ROOT / "public" / "pwa"
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


def parse_args():
    parser = argparse.ArgumentParser(description="Generate Mahjong PWA icon assets.")
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE_PATH,
        help="Source square PNG path. Relative paths resolve from the repo root.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for generated PNG icons. Relative paths resolve from the repo root.",
    )
    parser.add_argument(
        "--prefix",
        default="",
        help="Optional prefix prepended to every generated file name.",
    )
    parser.add_argument(
        "--optimize-source-in-place",
        action="store_true",
        help="Rewrite the source PNG with PNG optimization before generating icons.",
    )
    parser.add_argument(
        "--source-max-size",
        type=int,
        default=None,
        help="Optional max width/height for the optimized source image.",
    )
    parser.add_argument(
        "--source-quantize-colors",
        type=int,
        default=None,
        help="Optional palette size used when optimizing the source PNG in place.",
    )
    return parser.parse_args()


def resolve_repo_path(path: Path) -> Path:
    return path if path.is_absolute() else ROOT / path


def build_output_name(prefix: str, file_name: str) -> str:
    return f"{prefix}{file_name}" if prefix else file_name


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


def save_png(image: Image.Image, output_path: Path) -> None:
    image.save(output_path, format="PNG", optimize=True, compress_level=9)


def prepare_source_image(source_path: Path, source_max_size: int | None) -> Image.Image:
    source_image = Image.open(source_path).convert("RGB")

    if source_max_size and max(source_image.size) > source_max_size:
        source_image = source_image.resize((source_max_size, source_max_size), Image.Resampling.LANCZOS)

    return source_image


def main():
    args = parse_args()
    source_path = resolve_repo_path(args.source)
    output_dir = resolve_repo_path(args.output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)
    source_image = prepare_source_image(source_path, args.source_max_size)

    if args.optimize_source_in_place:
        optimized_source = source_image
        if args.source_quantize_colors:
            optimized_source = optimized_source.quantize(
                colors=args.source_quantize_colors,
                method=Image.Quantize.MEDIANCUT,
            )
        save_png(optimized_source, source_path)

    for file_name, size in STANDARD_SIZES:
        save_png(
            build_standard_icon(source_image, size),
            output_dir / build_output_name(args.prefix, file_name),
        )

    for file_name, size in MASKABLE_SIZES:
        save_png(
            build_maskable_icon(source_image, size),
            output_dir / build_output_name(args.prefix, file_name),
        )

    print(f"Generated {len(STANDARD_SIZES) + len(MASKABLE_SIZES)} icons into {output_dir}")


if __name__ == "__main__":
    main()

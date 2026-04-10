"""
Generate training data from screen-style chess boards.

Simulates screenshots from chess websites by rendering positions with
different piece sprite themes and board color schemes, then applying
screen-like artifacts (slight blur, brightness variation).

Uses the same output structure as generate_synthetic_data.py so datasets
can be merged.
"""

import argparse
import io
import random
from pathlib import Path

import chess
import chess.svg
import cairosvg
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
from tqdm import tqdm

from generate_synthetic_data import (
    BOARD_THEMES,
    random_position,
    crop_squares,
)

# Additional screen-specific themes
SCREEN_THEMES = BOARD_THEMES + [
    ("#ffce9e", "#d18b47"),  # chess.com classic
    ("#eae9d2", "#4b7399"),  # chess.com ocean
    ("#f0e0c0", "#907050"),  # newspaper style
    ("#d9d9d9", "#6b8e8e"),  # teal
    ("#faf0e0", "#b09070"),  # parchment
]


def apply_screen_artifacts(img: Image.Image) -> Image.Image:
    """Apply realistic screen-capture artifacts to a board image."""
    # Random brightness variation (simulates different screen brightness)
    brightness = random.uniform(0.85, 1.15)
    img = ImageEnhance.Brightness(img).enhance(brightness)

    # Random contrast variation
    contrast = random.uniform(0.9, 1.1)
    img = ImageEnhance.Contrast(img).enhance(contrast)

    # Slight blur (simulates screen capture softness)
    if random.random() < 0.3:
        img = img.filter(ImageFilter.GaussianBlur(radius=random.uniform(0.3, 0.8)))

    # Random slight resize (simulates non-native resolution capture)
    if random.random() < 0.4:
        w, h = img.size
        scale = random.uniform(0.85, 1.15)
        new_size = (int(w * scale), int(h * scale))
        img = img.resize(new_size, Image.LANCZOS).resize((w, h), Image.LANCZOS)

    # Random JPEG compression artifacts
    if random.random() < 0.3:
        buf = io.BytesIO()
        quality = random.randint(60, 90)
        img.save(buf, format="JPEG", quality=quality)
        buf.seek(0)
        img = Image.open(buf).convert("RGB")

    return img


def main():
    parser = argparse.ArgumentParser(description="Generate screen-style chess training data")
    parser.add_argument("--num-boards", type=int, default=500, help="Number of boards to generate")
    parser.add_argument("--output", type=str, default="datasets/screen", help="Output directory")
    parser.add_argument("--board-size", type=int, default=512, help="Board render size in pixels")
    parser.add_argument("--seed", type=int, default=123, help="Random seed")
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    output = Path(args.output)

    # Create directory structure
    occ_dir = output / "occupancy"
    pieces_dir = output / "pieces"

    for label in ["empty", "occupied"]:
        (occ_dir / label).mkdir(parents=True, exist_ok=True)

    for piece_label in ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"]:
        (pieces_dir / piece_label).mkdir(parents=True, exist_ok=True)

    print(f"Generating {args.num_boards} screen-style boards...")
    print(f"Output: {output}")
    print(f"Screen themes: {len(SCREEN_THEMES)}")

    for i in tqdm(range(args.num_boards), desc="Generating"):
        board = random_position()
        theme = SCREEN_THEMES[i % len(SCREEN_THEMES)]

        board_img = render_board(board, theme[0], theme[1], size=args.board_size)
        board_img = apply_screen_artifacts(board_img)

        crop_squares(
            board_img=board_img,
            board=board,
            occupancy_dir=occ_dir,
            pieces_dir=pieces_dir,
            prefix=f"screen_{i:05d}",
        )

    # Print stats
    print("\n--- Dataset Stats ---")
    total_occ = 0
    for label in ["empty", "occupied"]:
        count = len(list((occ_dir / label).glob("*.png")))
        total_occ += count
        print(f"Occupancy/{label}: {count}")

    total_pieces = 0
    for piece_label in sorted(p.name for p in pieces_dir.iterdir() if p.is_dir()):
        count = len(list((pieces_dir / piece_label).glob("*.png")))
        total_pieces += count
        print(f"Pieces/{piece_label}: {count}")

    print(f"\nTotal occupancy samples: {total_occ}")
    print(f"Total piece samples: {total_pieces}")


def render_board(
    board: chess.Board,
    light_color: str,
    dark_color: str,
    size: int = 512,
) -> Image.Image:
    """Render board to PIL Image."""
    svg_str = chess.svg.board(
        board,
        size=size,
        colors={
            "square light": light_color,
            "square dark": dark_color,
            "margin": "#00000000",
        },
        coordinates=False,
    )
    png_bytes = cairosvg.svg2png(bytestring=svg_str.encode(), output_width=size, output_height=size)
    return Image.open(io.BytesIO(png_bytes)).convert("RGB")


if __name__ == "__main__":
    main()

"""
Generate synthetic chess board training data from piece sprite sets.

Renders random chess positions using python-chess SVG rendering with multiple
piece sets, then crops individual squares for occupancy + piece classification.

Output structure:
  datasets/synthetic/
    occupancy/
      empty/    -> square crops labeled empty
      occupied/ -> square crops labeled occupied
    pieces/
      wK/ wQ/ wR/ wB/ wN/ wP/ bK/ bQ/ bR/ bB/ bN/ bP/
"""

import argparse
import io
import os
import random
from pathlib import Path

import chess
import chess.svg
import cairosvg
import numpy as np
from PIL import Image
from tqdm import tqdm


# --- Board themes: (light_square, dark_square) hex colors ---
BOARD_THEMES = [
    ("#f0d9b5", "#b58863"),  # lichess brown
    ("#eeeed2", "#769656"),  # chess.com green
    ("#dee3e6", "#8ca2ad"),  # lichess blue
    ("#f0f0f0", "#c0c0c0"),  # gray
    ("#e8dab2", "#c6a876"),  # warm wood
    ("#fce4c8", "#d4a06a"),  # light wood
    ("#ffffff", "#aaaaaa"),  # high contrast
    ("#e0c8a8", "#a07850"),  # dark wood
]


def random_position(min_pieces: int = 4, max_pieces: int = 32) -> chess.Board:
    """Generate a random legal-looking chess position."""
    board = chess.Board.empty()

    # Always place kings
    white_king_sq = random.randint(0, 63)
    board.set_piece_at(white_king_sq, chess.Piece(chess.KING, chess.WHITE))

    # Place black king at least 2 squares away
    while True:
        black_king_sq = random.randint(0, 63)
        if black_king_sq != white_king_sq:
            rank_diff = abs(chess.square_rank(white_king_sq) - chess.square_rank(black_king_sq))
            file_diff = abs(chess.square_file(white_king_sq) - chess.square_file(black_king_sq))
            if rank_diff > 1 or file_diff > 1:
                break
    board.set_piece_at(black_king_sq, chess.Piece(chess.KING, chess.BLACK))

    num_pieces = random.randint(min_pieces, max_pieces) - 2  # subtract kings
    piece_types = [chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT, chess.PAWN]
    piece_weights = [1, 2, 2, 2, 8]  # pawns are most common

    for _ in range(num_pieces):
        piece_type = random.choices(piece_types, weights=piece_weights, k=1)[0]
        color = random.choice([chess.WHITE, chess.BLACK])

        # Don't place pawns on rank 1 or 8
        available = [sq for sq in range(64) if board.piece_at(sq) is None]
        if piece_type == chess.PAWN:
            available = [sq for sq in available if 1 <= chess.square_rank(sq) <= 6]

        if not available:
            break

        sq = random.choice(available)
        board.set_piece_at(sq, chess.Piece(piece_type, color))

    return board


def render_board_image(
    board: chess.Board,
    light_color: str,
    dark_color: str,
    size: int = 512,
) -> Image.Image:
    """Render a chess board to a PIL Image using SVG."""
    svg_str = chess.svg.board(
        board,
        size=size,
        colors={
            "square light": light_color,
            "square dark": dark_color,
            "margin": "#00000000",  # transparent margin
        },
        coordinates=False,
    )
    png_bytes = cairosvg.svg2png(bytestring=svg_str.encode(), output_width=size, output_height=size)
    return Image.open(io.BytesIO(png_bytes)).convert("RGB")


def crop_squares(
    board_img: Image.Image,
    board: chess.Board,
    occupancy_dir: Path,
    pieces_dir: Path,
    prefix: str,
    piece_crop_height_ratio: float = 2.0,
):
    """Crop individual squares from a rendered board image.

    For occupancy: 100x100 square crops
    For pieces: 100x200 rectangular crops (extending upward)
    """
    w, h = board_img.size
    sq_w = w / 8
    sq_h = h / 8

    for sq in range(64):
        rank = 7 - chess.square_rank(sq)  # SVG renders rank 8 at top
        file = chess.square_file(sq)

        # Square crop (for occupancy)
        left = int(file * sq_w)
        top = int(rank * sq_h)
        right = int((file + 1) * sq_w)
        bottom = int((rank + 1) * sq_h)

        sq_crop = board_img.crop((left, top, right, bottom)).resize((100, 100), Image.LANCZOS)

        piece = board.piece_at(sq)

        # Save occupancy crop
        if piece is None:
            label = "empty"
        else:
            label = "occupied"

        occ_path = occupancy_dir / label / f"{prefix}_sq{sq}.png"
        sq_crop.save(occ_path)

        # Save piece crop (only for occupied squares)
        if piece is not None:
            # Piece crop: extend upward to capture piece height
            piece_top = max(0, int(top - sq_h * (piece_crop_height_ratio - 1)))
            piece_crop = board_img.crop((left, piece_top, right, bottom))
            piece_crop = piece_crop.resize((100, 200), Image.LANCZOS)

            color_char = "w" if piece.color == chess.WHITE else "b"
            type_char = piece.symbol().upper()
            piece_label = f"{color_char}{type_char}"

            piece_path = pieces_dir / piece_label / f"{prefix}_sq{sq}.png"
            piece_crop.save(piece_path)


def main():
    parser = argparse.ArgumentParser(description="Generate synthetic chess training data")
    parser.add_argument("--num-boards", type=int, default=500, help="Number of boards to generate")
    parser.add_argument("--output", type=str, default="datasets/synthetic", help="Output directory")
    parser.add_argument("--board-size", type=int, default=512, help="Board render size in pixels")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
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

    print(f"Generating {args.num_boards} synthetic boards...")
    print(f"Output: {output}")
    print(f"Board themes: {len(BOARD_THEMES)}")

    for i in tqdm(range(args.num_boards), desc="Generating"):
        board = random_position()
        theme = BOARD_THEMES[i % len(BOARD_THEMES)]

        board_img = render_board_image(board, theme[0], theme[1], size=args.board_size)

        crop_squares(
            board_img=board_img,
            board=board,
            occupancy_dir=occ_dir,
            pieces_dir=pieces_dir,
            prefix=f"synth_{i:05d}",
        )

    # Print stats
    print("\n--- Dataset Stats ---")
    for label in ["empty", "occupied"]:
        count = len(list((occ_dir / label).glob("*.png")))
        print(f"Occupancy/{label}: {count}")

    for piece_label in sorted(os.listdir(pieces_dir)):
        count = len(list((pieces_dir / piece_label).glob("*.png")))
        print(f"Pieces/{piece_label}: {count}")


if __name__ == "__main__":
    main()

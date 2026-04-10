import { validateFen as chessJsValidateFen } from 'chess.js';
import type { BoardState, CastlingRights, PieceColor, PieceType } from '../../types/chess';

export interface ValidationError {
  type:
    | 'missing_king'
    | 'extra_king'
    | 'pawns_on_back_rank'
    | 'too_many_pawns'
    | 'too_many_pieces'
    | 'invalid_fen';
  message: string;
  squares?: number[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Find all indices where a specific piece appears on the board.
 */
function findPieces(
  board: BoardState,
  color: PieceColor,
  type: PieceType
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < board.length; i++) {
    const sq = board[i];
    if (sq !== null && sq.color === color && sq.type === type) {
      indices.push(i);
    }
  }
  return indices;
}

/**
 * Count all pieces of a given color on the board.
 */
function countPiecesByColor(
  board: BoardState,
  color: PieceColor
): Map<PieceType, number[]> {
  const map = new Map<PieceType, number[]>();
  for (let i = 0; i < board.length; i++) {
    const sq = board[i];
    if (sq !== null && sq.color === color) {
      const existing = map.get(sq.type) ?? [];
      existing.push(i);
      map.set(sq.type, existing);
    }
  }
  return map;
}

/**
 * Validate that a board position is structurally legal.
 *
 * Checks:
 * - Exactly 1 white king and 1 black king
 * - No pawns on rank 1 or rank 8
 * - Max 8 pawns per side
 * - Max pieces per side accounting for promotions
 * - Total piece count per side <= 16
 */
export function validateBoard(board: BoardState): ValidationResult {
  const errors: ValidationError[] = [];

  // --- King validation ---
  for (const color of ['w', 'b'] as PieceColor[]) {
    const colorName = color === 'w' ? 'White' : 'Black';
    const kings = findPieces(board, color, 'k');

    if (kings.length === 0) {
      errors.push({
        type: 'missing_king',
        message: `${colorName} king is missing`,
      });
    } else if (kings.length > 1) {
      errors.push({
        type: 'extra_king',
        message: `${colorName} has ${kings.length} kings (expected 1)`,
        squares: kings,
      });
    }
  }

  // --- Pawns on back rank ---
  // Rank 8 = indices 0..7 (a8..h8), Rank 1 = indices 56..63 (a1..h1)
  const backRankIndices = [
    ...Array.from({ length: 8 }, (_, i) => i), // rank 8
    ...Array.from({ length: 8 }, (_, i) => 56 + i), // rank 1
  ];

  const pawnsOnBackRank: number[] = [];
  for (const idx of backRankIndices) {
    const sq = board[idx];
    if (sq !== null && sq.type === 'p') {
      pawnsOnBackRank.push(idx);
    }
  }

  if (pawnsOnBackRank.length > 0) {
    errors.push({
      type: 'pawns_on_back_rank',
      message: `Pawns found on back rank (rank 1 or 8)`,
      squares: pawnsOnBackRank,
    });
  }

  // --- Per-side piece counts ---
  for (const color of ['w', 'b'] as PieceColor[]) {
    const colorName = color === 'w' ? 'White' : 'Black';
    const pieces = countPiecesByColor(board, color);

    const pawnIndices = pieces.get('p') ?? [];
    const pawnCount = pawnIndices.length;

    if (pawnCount > 8) {
      errors.push({
        type: 'too_many_pawns',
        message: `${colorName} has ${pawnCount} pawns (max 8)`,
        squares: pawnIndices,
      });
    }

    // Total piece count
    let totalCount = 0;
    const allSquares: number[] = [];
    for (const [, indices] of pieces) {
      totalCount += indices.length;
      allSquares.push(...indices);
    }

    if (totalCount > 16) {
      errors.push({
        type: 'too_many_pieces',
        message: `${colorName} has ${totalCount} pieces (max 16)`,
        squares: allSquares,
      });
    }

    // Check promotions: extra pieces beyond starting counts require fewer pawns
    // Starting non-pawn counts: 1 king, 1 queen, 2 rooks, 2 bishops, 2 knights
    const startingCounts: Record<PieceType, number> = {
      k: 1,
      q: 1,
      r: 2,
      b: 2,
      n: 2,
      p: 8,
    };

    let extraPieces = 0;
    for (const type of ['q', 'r', 'b', 'n'] as PieceType[]) {
      const count = (pieces.get(type) ?? []).length;
      if (count > startingCounts[type]) {
        extraPieces += count - startingCounts[type];
      }
    }

    // If there are extra officers, pawns + extra officers can't exceed 8
    if (pawnCount + extraPieces > 8) {
      const allPiecesSquares: number[] = [];
      for (const [, indices] of pieces) {
        allPiecesSquares.push(...indices);
      }
      errors.push({
        type: 'too_many_pieces',
        message: `${colorName} has too many pieces accounting for promotions (${pawnCount} pawns + ${extraPieces} extra officers > 8)`,
        squares: allPiecesSquares,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a FEN string using chess.js.
 * Wraps any validation errors from chess.js into a ValidationResult.
 */
export function validateFen(fen: string): ValidationResult {
  const result = chessJsValidateFen(fen);

  if (result.ok) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: [
      {
        type: 'invalid_fen',
        message: result.error ?? 'Invalid FEN',
      },
    ],
  };
}

/**
 * Infer castling rights defaults from the board position.
 *
 * Logic:
 * - White: king on e1 (index 60) AND rook on h1 (index 63) => K allowed
 *          king on e1 (index 60) AND rook on a1 (index 56) => Q allowed
 *          king NOT on e1 => disable both White castling
 * - Black: king on e8 (index 4) AND rook on h8 (index 7) => k allowed
 *          king on e8 (index 4) AND rook on a8 (index 0) => q allowed
 *          king NOT on e8 => disable both Black castling
 */
export function inferCastlingDefaults(board: BoardState): CastlingRights {
  const isAt = (index: number, color: PieceColor, type: PieceType): boolean => {
    const sq = board[index];
    return sq !== null && sq.color === color && sq.type === type;
  };

  const whiteKingOnE1 = isAt(60, 'w', 'k');
  const blackKingOnE8 = isAt(4, 'b', 'k');

  return {
    K: whiteKingOnE1 && isAt(63, 'w', 'r'),
    Q: whiteKingOnE1 && isAt(56, 'w', 'r'),
    k: blackKingOnE8 && isAt(7, 'b', 'r'),
    q: blackKingOnE8 && isAt(0, 'b', 'r'),
  };
}

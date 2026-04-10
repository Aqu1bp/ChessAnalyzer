import { Chess, validateFen as chessJsValidateFen } from 'chess.js';
import type { BoardState, CastlingRights, FenMetadata, Piece, PieceColor, PieceType } from '../types/chess';

/**
 * Map chess.js piece characters to our PieceType.
 */
const CHESS_JS_PIECE_MAP: Record<string, PieceType> = {
  k: 'k',
  q: 'q',
  r: 'r',
  b: 'b',
  n: 'n',
  p: 'p',
};

/**
 * Convert a chess.js square name (e.g., 'a8') to our board index.
 * Index 0 = a8, index 7 = h8, index 8 = a7, ..., index 63 = h1.
 */
function squareToIndex(square: string): number {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0); // 0-7
  const rank = parseInt(square[1], 10); // 1-8
  // rank 8 -> row 0, rank 1 -> row 7
  const row = 8 - rank;
  return row * 8 + file;
}

/**
 * Parse a FEN string into board state and metadata.
 *
 * Uses chess.js for validation and parsing.
 *
 * @param fen - A FEN string
 * @returns Parsed board state and metadata, or null if the FEN is invalid
 */
export function parseFen(
  fen: string
): { board: BoardState; metadata: FenMetadata } | null {
  // Validate FEN first
  const validation = chessJsValidateFen(fen);
  if (!validation.ok) {
    return null;
  }

  const chess = new Chess(fen);

  // Build the board state
  const board: BoardState = Array(64).fill(null);
  const chessBoard = chess.board(); // 8x8 array, [0][0] = a8

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = chessBoard[row][col];
      if (sq !== null) {
        const piece: Piece = {
          color: sq.color as PieceColor,
          type: CHESS_JS_PIECE_MAP[sq.type] as PieceType,
        };
        board[row * 8 + col] = piece;
      }
    }
  }

  // Parse FEN parts for metadata
  const parts = fen.split(' ');

  const activeColor = (parts[1] ?? 'w') as PieceColor;

  const castlingStr = parts[2] ?? '-';
  const castling: CastlingRights = {
    K: castlingStr.includes('K'),
    Q: castlingStr.includes('Q'),
    k: castlingStr.includes('k'),
    q: castlingStr.includes('q'),
  };

  const enPassant = parts[3] ?? '-';
  const halfmoveClock = parseInt(parts[4] ?? '0', 10);
  const fullmoveNumber = parseInt(parts[5] ?? '1', 10);

  const metadata: FenMetadata = {
    activeColor,
    castling,
    enPassant,
    halfmoveClock,
    fullmoveNumber,
  };

  return { board, metadata };
}

/**
 * Convert a board index to file (0-7) and rank (1-8).
 */
function indexToFileRank(index: number): { file: number; rank: number } {
  const file = index % 8;
  const row = Math.floor(index / 8);
  const rank = 8 - row;
  return { file, rank };
}

/**
 * Convert file (0-7) and rank (1-8) to algebraic square name.
 */
function fileRankToSquare(file: number, rank: number): string {
  return String.fromCharCode('a'.charCodeAt(0) + file) + rank.toString();
}

/**
 * Determine which squares are geometrically eligible for en passant.
 *
 * For white to move: look for white pawns on rank 5 adjacent to black pawns on rank 5.
 * The en passant target square would be on rank 6 (behind the black pawn).
 *
 * For black to move: look for black pawns on rank 4 adjacent to white pawns on rank 4.
 * The en passant target square would be on rank 3 (behind the white pawn).
 *
 * @param board - The current board state
 * @param activeColor - The side to move
 * @returns Array of en passant target square names (e.g., ['e6', 'c6'])
 */
export function isEnPassantPossible(
  board: BoardState,
  activeColor: PieceColor
): string[] {
  const result: string[] = [];

  if (activeColor === 'w') {
    // White to move: white pawns on rank 5, enemy pawns on rank 5 adjacent
    // Rank 5 = row 3 in our indexing (8 - 5 = 3), indices 24..31
    for (let file = 0; file < 8; file++) {
      const idx = 3 * 8 + file; // rank 5
      const sq = board[idx];
      if (sq !== null && sq.color === 'b' && sq.type === 'p') {
        // Check if there's a white pawn adjacent (left or right) on rank 5
        const leftFile = file - 1;
        const rightFile = file + 1;

        let hasAdjacentWhitePawn = false;
        if (leftFile >= 0) {
          const leftIdx = 3 * 8 + leftFile;
          const leftSq = board[leftIdx];
          if (leftSq !== null && leftSq.color === 'w' && leftSq.type === 'p') {
            hasAdjacentWhitePawn = true;
          }
        }
        if (rightFile <= 7) {
          const rightIdx = 3 * 8 + rightFile;
          const rightSq = board[rightIdx];
          if (rightSq !== null && rightSq.color === 'w' && rightSq.type === 'p') {
            hasAdjacentWhitePawn = true;
          }
        }

        if (hasAdjacentWhitePawn) {
          // En passant target is behind the black pawn (rank 6)
          result.push(fileRankToSquare(file, 6));
        }
      }
    }
  } else {
    // Black to move: black pawns on rank 4, enemy pawns on rank 4 adjacent
    // Rank 4 = row 4 in our indexing (8 - 4 = 4), indices 32..39
    for (let file = 0; file < 8; file++) {
      const idx = 4 * 8 + file; // rank 4
      const sq = board[idx];
      if (sq !== null && sq.color === 'w' && sq.type === 'p') {
        // Check if there's a black pawn adjacent (left or right) on rank 4
        const leftFile = file - 1;
        const rightFile = file + 1;

        let hasAdjacentBlackPawn = false;
        if (leftFile >= 0) {
          const leftIdx = 4 * 8 + leftFile;
          const leftSq = board[leftIdx];
          if (leftSq !== null && leftSq.color === 'b' && leftSq.type === 'p') {
            hasAdjacentBlackPawn = true;
          }
        }
        if (rightFile <= 7) {
          const rightIdx = 4 * 8 + rightFile;
          const rightSq = board[rightIdx];
          if (rightSq !== null && rightSq.color === 'b' && rightSq.type === 'p') {
            hasAdjacentBlackPawn = true;
          }
        }

        if (hasAdjacentBlackPawn) {
          // En passant target is behind the white pawn (rank 3)
          result.push(fileRankToSquare(file, 3));
        }
      }
    }
  }

  return result;
}

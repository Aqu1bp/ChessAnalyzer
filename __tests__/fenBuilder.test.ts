import {
  buildPiecePlacement,
  buildFullFen,
  predictionsToBoard,
} from '../src/services/recognition/fenBuilder';
import type { BoardState, FenMetadata, Piece, SquarePrediction } from '../src/types/chess';

/** Helper to create a Piece */
function p(color: 'w' | 'b', type: 'k' | 'q' | 'r' | 'b' | 'n' | 'p'): Piece {
  return { color, type };
}

/** Build the starting position board state */
function startingBoard(): BoardState {
  // Index 0 = a8, index 63 = h1
  // Rank 8: r n b q k b n r
  // Rank 7: p p p p p p p p
  // Rank 6: (empty)
  // Rank 5: (empty)
  // Rank 4: (empty)
  // Rank 3: (empty)
  // Rank 2: P P P P P P P P
  // Rank 1: R N B Q K B N R
  const board: BoardState = Array(64).fill(null);

  // Rank 8 (indices 0-7)
  board[0] = p('b', 'r');
  board[1] = p('b', 'n');
  board[2] = p('b', 'b');
  board[3] = p('b', 'q');
  board[4] = p('b', 'k');
  board[5] = p('b', 'b');
  board[6] = p('b', 'n');
  board[7] = p('b', 'r');

  // Rank 7 (indices 8-15)
  for (let i = 8; i < 16; i++) {
    board[i] = p('b', 'p');
  }

  // Rank 2 (indices 48-55)
  for (let i = 48; i < 56; i++) {
    board[i] = p('w', 'p');
  }

  // Rank 1 (indices 56-63)
  board[56] = p('w', 'r');
  board[57] = p('w', 'n');
  board[58] = p('w', 'b');
  board[59] = p('w', 'q');
  board[60] = p('w', 'k');
  board[61] = p('w', 'b');
  board[62] = p('w', 'n');
  board[63] = p('w', 'r');

  return board;
}

describe('buildPiecePlacement', () => {
  it('should generate starting position FEN placement', () => {
    const board = startingBoard();
    const result = buildPiecePlacement(board);
    expect(result).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  });

  it('should generate FEN for an empty board', () => {
    const board: BoardState = Array(64).fill(null);
    const result = buildPiecePlacement(board);
    expect(result).toBe('8/8/8/8/8/8/8/8');
  });

  it('should generate FEN for a mid-game position (1. e4)', () => {
    // After 1. e4: pawn moved from e2 (index 52) to e4 (index 36)
    const board = startingBoard();
    board[52] = null; // e2 empty
    board[36] = p('w', 'p'); // e4 has white pawn
    const result = buildPiecePlacement(board);
    expect(result).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
  });

  it('should handle a position with a single piece', () => {
    const board: BoardState = Array(64).fill(null);
    board[60] = p('w', 'k'); // e1
    const result = buildPiecePlacement(board);
    expect(result).toBe('8/8/8/8/8/8/8/4K3');
  });

  it('should handle a position with pieces at edges', () => {
    const board: BoardState = Array(64).fill(null);
    board[0] = p('b', 'r'); // a8
    board[7] = p('b', 'r'); // h8
    board[56] = p('w', 'r'); // a1
    board[63] = p('w', 'r'); // h1
    const result = buildPiecePlacement(board);
    expect(result).toBe('r6r/8/8/8/8/8/8/R6R');
  });
});

describe('buildFullFen', () => {
  it('should build the starting position FEN', () => {
    const board = startingBoard();
    const metadata: FenMetadata = {
      activeColor: 'w',
      castling: { K: true, Q: true, k: true, q: true },
      enPassant: '-',
      halfmoveClock: 0,
      fullmoveNumber: 1,
    };
    const result = buildFullFen(board, metadata);
    expect(result).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    );
  });

  it('should handle position after 1. e4 with en passant', () => {
    const board = startingBoard();
    board[52] = null;
    board[36] = p('w', 'p');
    const metadata: FenMetadata = {
      activeColor: 'b',
      castling: { K: true, Q: true, k: true, q: true },
      enPassant: 'e3',
      halfmoveClock: 0,
      fullmoveNumber: 1,
    };
    const result = buildFullFen(board, metadata);
    expect(result).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
    );
  });

  it('should handle no castling rights', () => {
    const board = startingBoard();
    const metadata: FenMetadata = {
      activeColor: 'w',
      castling: { K: false, Q: false, k: false, q: false },
      enPassant: '-',
      halfmoveClock: 10,
      fullmoveNumber: 25,
    };
    const result = buildFullFen(board, metadata);
    expect(result).toContain(' - - 10 25');
    expect(result).toMatch(/\s-\s-\s10\s25$/);
  });

  it('should handle partial castling rights', () => {
    const board = startingBoard();
    const metadata: FenMetadata = {
      activeColor: 'b',
      castling: { K: true, Q: false, k: false, q: true },
      enPassant: '-',
      halfmoveClock: 3,
      fullmoveNumber: 12,
    };
    const result = buildFullFen(board, metadata);
    expect(result).toContain(' Kq ');
  });
});

describe('predictionsToBoard', () => {
  it('should convert occupied predictions to board state', () => {
    const predictions: SquarePrediction[] = Array(64)
      .fill(null)
      .map(() => ({
        occupied: false,
        occupancyConfidence: 0.99,
        piece: null,
        pieceConfidence: 0,
      }));

    // Place a white king on e1 (index 60)
    predictions[60] = {
      occupied: true,
      occupancyConfidence: 0.95,
      piece: p('w', 'k'),
      pieceConfidence: 0.92,
    };

    const board = predictionsToBoard(predictions);
    expect(board[60]).toEqual(p('w', 'k'));
    expect(board[0]).toBeNull();
    expect(board[63]).toBeNull();
  });

  it('should treat unoccupied predictions as null even if piece is set', () => {
    const predictions: SquarePrediction[] = [
      {
        occupied: false,
        occupancyConfidence: 0.1,
        piece: p('w', 'q'),
        pieceConfidence: 0.5,
      },
      ...Array(63)
        .fill(null)
        .map(() => ({
          occupied: false,
          occupancyConfidence: 0.99,
          piece: null,
          pieceConfidence: 0,
        })),
    ];

    const board = predictionsToBoard(predictions);
    expect(board[0]).toBeNull();
  });
});

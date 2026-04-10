import {
  validateBoard,
  validateFen,
  inferCastlingDefaults,
} from '../src/services/recognition/boardValidator';
import type { BoardState, Piece } from '../src/types/chess';

/** Helper to create a Piece */
function p(color: 'w' | 'b', type: 'k' | 'q' | 'r' | 'b' | 'n' | 'p'): Piece {
  return { color, type };
}

/** Build a minimal valid board (just two kings) */
function minimalBoard(): BoardState {
  const board: BoardState = Array(64).fill(null);
  board[4] = p('b', 'k'); // e8
  board[60] = p('w', 'k'); // e1
  return board;
}

/** Build the starting position board state */
function startingBoard(): BoardState {
  const board: BoardState = Array(64).fill(null);

  board[0] = p('b', 'r');
  board[1] = p('b', 'n');
  board[2] = p('b', 'b');
  board[3] = p('b', 'q');
  board[4] = p('b', 'k');
  board[5] = p('b', 'b');
  board[6] = p('b', 'n');
  board[7] = p('b', 'r');

  for (let i = 8; i < 16; i++) board[i] = p('b', 'p');
  for (let i = 48; i < 56; i++) board[i] = p('w', 'p');

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

describe('validateBoard', () => {
  it('should validate a correct starting position', () => {
    const result = validateBoard(startingBoard());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate a minimal board with just two kings', () => {
    const result = validateBoard(minimalBoard());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect missing white king', () => {
    const board = minimalBoard();
    board[60] = null; // remove white king
    const result = validateBoard(board);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'missing_king')).toBe(true);
    expect(
      result.errors.find((e) => e.type === 'missing_king')?.message
    ).toContain('White');
  });

  it('should detect missing black king', () => {
    const board = minimalBoard();
    board[4] = null; // remove black king
    const result = validateBoard(board);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'missing_king')).toBe(true);
    expect(
      result.errors.find((e) => e.type === 'missing_king')?.message
    ).toContain('Black');
  });

  it('should detect extra kings', () => {
    const board = minimalBoard();
    board[20] = p('w', 'k'); // extra white king on e6
    const result = validateBoard(board);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'extra_king')).toBe(true);
  });

  it('should detect pawns on back rank (rank 1)', () => {
    const board = minimalBoard();
    board[56] = p('w', 'p'); // pawn on a1
    const result = validateBoard(board);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'pawns_on_back_rank')).toBe(
      true
    );
  });

  it('should detect pawns on back rank (rank 8)', () => {
    const board = minimalBoard();
    board[0] = p('b', 'p'); // pawn on a8
    const result = validateBoard(board);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'pawns_on_back_rank')).toBe(
      true
    );
  });

  it('should detect too many pawns', () => {
    const board = minimalBoard();
    // Place 9 white pawns on rank 2 and one on rank 3
    for (let i = 48; i < 56; i++) board[i] = p('w', 'p');
    board[40] = p('w', 'p'); // a3 - 9th pawn
    const result = validateBoard(board);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'too_many_pawns')).toBe(true);
  });

  it('should detect too many pieces per side', () => {
    const board = minimalBoard();
    // Place 16 extra white pieces (17 total including king)
    for (let i = 40; i < 56; i++) board[i] = p('w', 'q');
    const result = validateBoard(board);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'too_many_pieces')).toBe(true);
  });

  it('should detect too many pieces accounting for promotions', () => {
    const board = minimalBoard();
    // 8 pawns + 3 queens (2 extra queens = 2 promotions needed, but 8 pawns + 2 extra = 10 > 8)
    for (let i = 48; i < 56; i++) board[i] = p('w', 'p');
    board[40] = p('w', 'q');
    board[41] = p('w', 'q');
    board[42] = p('w', 'q');
    const result = validateBoard(board);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'too_many_pieces')).toBe(true);
  });
});

describe('validateFen', () => {
  it('should accept a valid FEN', () => {
    const result = validateFen(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject an invalid FEN', () => {
    const result = validateFen('this is not a valid fen');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].type).toBe('invalid_fen');
  });

  it('should reject FEN with missing fields', () => {
    const result = validateFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
    expect(result.valid).toBe(false);
  });
});

describe('inferCastlingDefaults', () => {
  it('should allow all castling for starting position', () => {
    const board = startingBoard();
    const rights = inferCastlingDefaults(board);
    expect(rights).toEqual({ K: true, Q: true, k: true, q: true });
  });

  it('should disable white castling when king is not on e1', () => {
    const board = startingBoard();
    board[60] = null; // remove king from e1
    board[61] = p('w', 'k'); // king on f1
    const rights = inferCastlingDefaults(board);
    expect(rights.K).toBe(false);
    expect(rights.Q).toBe(false);
  });

  it('should disable black castling when king is not on e8', () => {
    const board = startingBoard();
    board[4] = null; // remove king from e8
    board[3] = p('b', 'k'); // king on d8
    const rights = inferCastlingDefaults(board);
    expect(rights.k).toBe(false);
    expect(rights.q).toBe(false);
  });

  it('should disable white kingside when rook is not on h1', () => {
    const board = startingBoard();
    board[63] = null; // remove rook from h1
    const rights = inferCastlingDefaults(board);
    expect(rights.K).toBe(false);
    expect(rights.Q).toBe(true); // a1 rook still there
  });

  it('should disable white queenside when rook is not on a1', () => {
    const board = startingBoard();
    board[56] = null; // remove rook from a1
    const rights = inferCastlingDefaults(board);
    expect(rights.K).toBe(true); // h1 rook still there
    expect(rights.Q).toBe(false);
  });

  it('should disable all castling when kings and rooks are moved', () => {
    const board: BoardState = Array(64).fill(null);
    board[30] = p('w', 'k'); // king somewhere in the middle
    board[34] = p('b', 'k'); // black king somewhere
    const rights = inferCastlingDefaults(board);
    expect(rights).toEqual({ K: false, Q: false, k: false, q: false });
  });
});

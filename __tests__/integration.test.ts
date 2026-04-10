/**
 * Integration tests — end-to-end flow from board state to FEN to analysis readiness.
 * Tests the full pipeline that runs after recognition: board → validate → FEN → engine input.
 */

import { Chess } from 'chess.js';

import { buildPiecePlacement, buildFullFen, predictionsToBoard } from '../src/services/recognition/fenBuilder';
import { validateBoard, inferCastlingDefaults } from '../src/services/recognition/boardValidator';
import { parseUciLine } from '../src/services/engine/uciParser';
import { wdlToWinPercent, cpToWinPercent, formatScore } from '../src/utils/evalUtils';
import { parseFen } from '../src/utils/fen';
import { squareIndexToAlgebraic, algebraicToSquareIndex } from '../src/services/recognition/squareCropper';
import type { BoardState, Piece, PieceColor, PieceType, FenMetadata, SquarePrediction } from '../src/types/chess';

// Helper: create a board from FEN (using chess.js as ground truth)
function boardFromFen(fen: string): BoardState {
  const parsed = parseFen(fen);
  if (!parsed) throw new Error(`Invalid FEN: ${fen}`);
  return parsed.board;
}

describe('End-to-end: Board → FEN → Validation', () => {
  it('starting position round-trips correctly', () => {
    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const board = boardFromFen(startingFen);

    // Build piece placement
    const placement = buildPiecePlacement(board);
    expect(placement).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');

    // Build full FEN with metadata
    const metadata: FenMetadata = {
      activeColor: 'w',
      castling: { K: true, Q: true, k: true, q: true },
      enPassant: '-',
      halfmoveClock: 0,
      fullmoveNumber: 1,
    };
    const fullFen = buildFullFen(board, metadata);
    expect(fullFen).toBe(startingFen);

    // Validate
    const result = validateBoard(board);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Infer castling
    const castling = inferCastlingDefaults(board);
    expect(castling).toEqual({ K: true, Q: true, k: true, q: true });
  });

  it('Sicilian Defense position validates and round-trips', () => {
    // chess.js normalizes en passant to '-' if no pawn can actually capture
    const fen = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const board = boardFromFen(fen);

    const placement = buildPiecePlacement(board);
    expect(placement).toBe('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR');

    const result = validateBoard(board);
    expect(result.valid).toBe(true);

    const chess = new Chess(fen);
    expect(chess.fen()).toBe(fen);
  });

  it('mid-game position with castling changes', () => {
    // Position where white king has moved to g1 (castled)
    const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4';
    const board = boardFromFen(fen);

    const result = validateBoard(board);
    expect(result.valid).toBe(true);

    // Infer castling: white king on g1 (not e1) → no white castling
    const castling = inferCastlingDefaults(board);
    expect(castling.K).toBe(false);
    expect(castling.Q).toBe(false);
    // Black king still on e8 with rooks on a8/h8
    expect(castling.k).toBe(true);
    expect(castling.q).toBe(true);
  });

  it('endgame position with few pieces', () => {
    const fen = 'k7/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const board = boardFromFen(fen);

    const result = validateBoard(board);
    expect(result.valid).toBe(true);

    const castling = inferCastlingDefaults(board);
    expect(castling).toEqual({ K: false, Q: false, k: false, q: false });
  });

  it('rejects board with no kings', () => {
    const board: BoardState = Array(64).fill(null);
    board[0] = { color: 'b', type: 'q' };
    board[63] = { color: 'w', type: 'q' };

    const result = validateBoard(board);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.type === 'missing_king')).toBe(true);
  });

  it('rejects board with pawns on rank 1/8', () => {
    const board: BoardState = Array(64).fill(null);
    board[4] = { color: 'b', type: 'k' }; // e8
    board[60] = { color: 'w', type: 'k' }; // e1
    board[0] = { color: 'w', type: 'p' }; // a8 — illegal!

    const result = validateBoard(board);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.type === 'pawns_on_back_rank')).toBe(true);
  });
});

describe('End-to-end: UCI parsing → eval display', () => {
  it('parses a full analysis info line and formats score', () => {
    const line = 'info depth 20 seldepth 28 multipv 1 score cp 35 wdl 150 800 50 nodes 1500000 nps 2000000 time 750 pv e2e4 e7e5 g1f3';
    const result = parseUciLine(line);

    expect(result.type).toBe('info');
    if (result.type === 'info') {
      expect(result.info.depth).toBe(20);
      expect(result.info.multipv).toBe(1);
      expect(result.info.score).toEqual({ type: 'cp', value: 35 });
      expect(result.info.wdl).toEqual({ wins: 150, draws: 800, losses: 50 });
      expect(result.info.pv).toEqual(['e2e4', 'e7e5', 'g1f3']);

      // Format score
      const formatted = formatScore(result.info.score!);
      expect(formatted).toBe('+0.35');

      // WDL to win percent
      const winPct = wdlToWinPercent(result.info.wdl!);
      expect(winPct).toBeGreaterThan(50); // White is ahead
      expect(winPct).toBeLessThan(70);
    }
  });

  it('parses bestmove line', () => {
    const line = 'bestmove e2e4 ponder e7e5';
    const result = parseUciLine(line);
    expect(result.type).toBe('bestmove');
    if (result.type === 'bestmove') {
      expect(result.move).toBe('e2e4');
      expect(result.ponder).toBe('e7e5');
    }
  });

  it('handles mate scores correctly', () => {
    const line = 'info depth 15 score mate 3 pv d1h5 g6h5 f3g5';
    const result = parseUciLine(line);
    if (result.type === 'info') {
      expect(result.info.score).toEqual({ type: 'mate', value: 3 });
      const formatted = formatScore(result.info.score!);
      expect(formatted).toBe('M3');
    }
  });

  it('handles negative mate scores', () => {
    const formatted = formatScore({ type: 'mate', value: -2 });
    expect(formatted).toBe('-M2');
  });

  it('sigmoid fallback produces reasonable values', () => {
    expect(cpToWinPercent(0)).toBeCloseTo(50, 1);
    expect(cpToWinPercent(100)).toBeGreaterThan(55);
    expect(cpToWinPercent(100)).toBeLessThan(70);
    expect(cpToWinPercent(-300)).toBeLessThan(25);
  });
});

describe('End-to-end: Square indexing consistency', () => {
  it('FEN builder and square cropper agree on board layout', () => {
    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const board = boardFromFen(startingFen);

    // Index 0 = a8 (black rook in starting position)
    expect(squareIndexToAlgebraic(0)).toBe('a8');
    expect(board[0]).toEqual({ color: 'b', type: 'r' });

    // Index 4 = e8 (black king)
    expect(squareIndexToAlgebraic(4)).toBe('e8');
    expect(board[4]).toEqual({ color: 'b', type: 'k' });

    // Index 60 = e1 (white king)
    expect(squareIndexToAlgebraic(60)).toBe('e1');
    expect(board[60]).toEqual({ color: 'w', type: 'k' });

    // Index 63 = h1 (white rook)
    expect(squareIndexToAlgebraic(63)).toBe('h1');
    expect(board[63]).toEqual({ color: 'w', type: 'r' });
  });

  it('algebraic to index round-trips for all 64 squares', () => {
    for (let i = 0; i < 64; i++) {
      const alg = squareIndexToAlgebraic(i);
      const back = algebraicToSquareIndex(alg);
      expect(back).toBe(i);
    }
  });
});

describe('End-to-end: Predictions → Board → FEN', () => {
  it('converts mock predictions to valid FEN', () => {
    // Simulate ML output: starting position predictions
    const predictions: SquarePrediction[] = [];
    const startingBoard = boardFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

    for (let i = 0; i < 64; i++) {
      const piece = startingBoard[i];
      predictions.push({
        occupied: piece !== null,
        occupancyConfidence: 0.99,
        piece: piece,
        pieceConfidence: piece ? 0.95 : 0,
      });
    }

    const board = predictionsToBoard(predictions);
    const placement = buildPiecePlacement(board);
    expect(placement).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');

    const validation = validateBoard(board);
    expect(validation.valid).toBe(true);
  });
});

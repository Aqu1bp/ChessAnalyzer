import { uciToSan, parseUciMove } from '../src/utils/notation';
import { parseFen, isEnPassantPossible } from '../src/utils/fen';

describe('parseUciMove', () => {
  it('should parse a normal move', () => {
    expect(parseUciMove('e2e4')).toEqual({ from: 'e2', to: 'e4' });
  });

  it('should parse a promotion move', () => {
    expect(parseUciMove('e7e8q')).toEqual({
      from: 'e7',
      to: 'e8',
      promotion: 'q',
    });
  });

  it('should parse a knight promotion', () => {
    expect(parseUciMove('a7a8n')).toEqual({
      from: 'a7',
      to: 'a8',
      promotion: 'n',
    });
  });

  it('should parse a castling move', () => {
    expect(parseUciMove('e1g1')).toEqual({ from: 'e1', to: 'g1' });
  });
});

describe('uciToSan', () => {
  const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('should convert opening moves', () => {
    const result = uciToSan(['e2e4', 'e7e5', 'g1f3'], startingFen);
    expect(result).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('should handle a single move', () => {
    const result = uciToSan(['d2d4'], startingFen);
    expect(result).toEqual(['d4']);
  });

  it('should handle an empty move list', () => {
    const result = uciToSan([], startingFen);
    expect(result).toEqual([]);
  });

  it('should handle Scholar\'s Mate', () => {
    const result = uciToSan(
      ['e2e4', 'e7e5', 'f1c4', 'd7d6', 'd1h5', 'b8c6', 'h5f7'],
      startingFen
    );
    expect(result).toEqual(['e4', 'e5', 'Bc4', 'd6', 'Qh5', 'Nc6', 'Qxf7#']);
  });

  it('should handle castling kingside', () => {
    // Position where white can castle kingside
    const fen =
      'r1bqk2r/ppppbppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const result = uciToSan(['e1g1'], fen);
    expect(result).toEqual(['O-O']);
  });

  it('should handle promotion', () => {
    // Position where white can promote (kings not blocking)
    const fen = '8/4P3/8/8/8/8/8/2k1K3 w - - 0 1';
    const result = uciToSan(['e7e8q'], fen);
    expect(result).toEqual(['e8=Q']);
  });

  it('should throw on illegal move', () => {
    expect(() => uciToSan(['e2e5'], startingFen)).toThrow();
  });
});

describe('parseFen', () => {
  it('should parse the starting position', () => {
    const result = parseFen(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    );
    expect(result).not.toBeNull();
    expect(result!.metadata.activeColor).toBe('w');
    expect(result!.metadata.castling).toEqual({
      K: true,
      Q: true,
      k: true,
      q: true,
    });
    expect(result!.metadata.enPassant).toBe('-');
    expect(result!.metadata.halfmoveClock).toBe(0);
    expect(result!.metadata.fullmoveNumber).toBe(1);

    // Check a few pieces
    expect(result!.board[0]).toEqual({ color: 'b', type: 'r' }); // a8
    expect(result!.board[4]).toEqual({ color: 'b', type: 'k' }); // e8
    expect(result!.board[60]).toEqual({ color: 'w', type: 'k' }); // e1
    expect(result!.board[32]).toBeNull(); // a4 (empty)
  });

  it('should return null for an invalid FEN', () => {
    expect(parseFen('not a valid fen')).toBeNull();
  });

  it('should parse en passant target', () => {
    const result = parseFen(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
    );
    expect(result).not.toBeNull();
    expect(result!.metadata.enPassant).toBe('e3');
    expect(result!.metadata.activeColor).toBe('b');
  });

  it('should parse partial castling rights', () => {
    const result = parseFen(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w Kq - 0 1'
    );
    expect(result).not.toBeNull();
    expect(result!.metadata.castling).toEqual({
      K: true,
      Q: false,
      k: false,
      q: true,
    });
  });
});

describe('isEnPassantPossible', () => {
  it('should detect en passant possibility for white', () => {
    // White pawn on d5 (index 27), black pawn on e5 (index 28)
    const result = parseFen(
      'rnbqkbnr/pppp1ppp/8/3Pp3/8/8/PPP1PPPP/RNBQKBNR w KQkq - 0 3'
    );
    expect(result).not.toBeNull();
    const squares = isEnPassantPossible(result!.board, 'w');
    // The black pawn on e5 could have just moved there, so e6 is a candidate
    expect(squares).toContain('e6');
  });

  it('should detect en passant possibility for black', () => {
    // Black pawn on d4 (index 35), white pawn on e4 (index 36)
    const result = parseFen(
      'rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPP1PPPP/RNBQKBNR b KQkq - 0 3'
    );
    expect(result).not.toBeNull();
    const squares = isEnPassantPossible(result!.board, 'b');
    // The white pawn on e4 could have just moved there, so e3 is a candidate
    expect(squares).toContain('e3');
  });

  it('should return empty array when no en passant is possible', () => {
    const result = parseFen(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    );
    expect(result).not.toBeNull();
    const squares = isEnPassantPossible(result!.board, 'w');
    expect(squares).toHaveLength(0);
  });

  it('should not detect en passant when pawns are not adjacent', () => {
    // White pawn on a5 (index 24), black pawn on c5 (index 26) - not adjacent
    const result = parseFen(
      'rnbqkbnr/1p1ppppp/8/P1p5/8/8/1PP1PPPP/RNBQKBNR w KQkq - 0 3'
    );
    expect(result).not.toBeNull();
    const squares = isEnPassantPossible(result!.board, 'w');
    // c5 pawn is not adjacent to a5 pawn (b5 is between them and empty)
    expect(squares).not.toContain('c6');
  });
});

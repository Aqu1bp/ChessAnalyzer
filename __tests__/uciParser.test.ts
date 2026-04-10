import { parseUciLine, parseInfoLine } from '../src/services/engine/uciParser';

describe('uciParser', () => {
  describe('parseUciLine', () => {
    it('parses "uciok"', () => {
      const result = parseUciLine('uciok');
      expect(result).toEqual({ type: 'uciok' });
    });

    it('parses "readyok"', () => {
      const result = parseUciLine('readyok');
      expect(result).toEqual({ type: 'readyok' });
    });

    it('returns unknown for unrecognized lines', () => {
      const result = parseUciLine('id name Stockfish 18');
      expect(result.type).toBe('unknown');
      if (result.type === 'unknown') {
        expect(result.raw).toBe('id name Stockfish 18');
      }
    });
  });

  describe('bestmove parsing', () => {
    it('parses bestmove without ponder', () => {
      const result = parseUciLine('bestmove e2e4');
      expect(result).toEqual({ type: 'bestmove', move: 'e2e4' });
    });

    it('parses bestmove with ponder', () => {
      const result = parseUciLine('bestmove e2e4 ponder d7d5');
      expect(result).toEqual({
        type: 'bestmove',
        move: 'e2e4',
        ponder: 'd7d5',
      });
    });

    it('parses bestmove (none)', () => {
      const result = parseUciLine('bestmove (none)');
      expect(result).toEqual({ type: 'bestmove', move: '(none)' });
    });
  });

  describe('info line parsing', () => {
    it('parses a full info line with standard field ordering', () => {
      const line =
        'info depth 20 seldepth 30 multipv 1 score cp 35 nodes 1234567 nps 987654 time 1250 hashfull 500 tbhits 0 pv e2e4 e7e5 g1f3';
      const result = parseUciLine(line);
      expect(result.type).toBe('info');
      if (result.type === 'info') {
        const info = result.info;
        expect(info.depth).toBe(20);
        expect(info.seldepth).toBe(30);
        expect(info.multipv).toBe(1);
        expect(info.score).toEqual({ type: 'cp', value: 35 });
        expect(info.nodes).toBe(1234567);
        expect(info.nps).toBe(987654);
        expect(info.time).toBe(1250);
        expect(info.hashfull).toBe(500);
        expect(info.tbhits).toBe(0);
        expect(info.pv).toEqual(['e2e4', 'e7e5', 'g1f3']);
      }
    });

    it('parses info line with fields in different order', () => {
      const line =
        'info multipv 2 score cp -15 depth 12 nodes 50000 pv d7d5 e2e4';
      const info = parseInfoLine(line);
      expect(info.multipv).toBe(2);
      expect(info.score).toEqual({ type: 'cp', value: -15 });
      expect(info.depth).toBe(12);
      expect(info.nodes).toBe(50000);
      expect(info.pv).toEqual(['d7d5', 'e2e4']);
    });

    it('parses score with mate value', () => {
      const line = 'info depth 25 score mate 3 pv e1g1 e8g8 d1h5';
      const info = parseInfoLine(line);
      expect(info.score).toEqual({ type: 'mate', value: 3 });
    });

    it('parses score with negative mate value', () => {
      const line = 'info depth 25 score mate -2 pv e8g8';
      const info = parseInfoLine(line);
      expect(info.score).toEqual({ type: 'mate', value: -2 });
    });

    it('parses score with upperbound', () => {
      const line = 'info depth 10 score cp 50 upperbound pv e2e4';
      const info = parseInfoLine(line);
      expect(info.score).toEqual({
        type: 'cp',
        value: 50,
        bound: 'upperbound',
      });
    });

    it('parses score with lowerbound', () => {
      const line = 'info depth 10 score cp -30 lowerbound pv d2d4';
      const info = parseInfoLine(line);
      expect(info.score).toEqual({
        type: 'cp',
        value: -30,
        bound: 'lowerbound',
      });
    });

    it('parses empty PV (pv at end with no moves)', () => {
      const line = 'info depth 1 score cp 0 pv';
      const info = parseInfoLine(line);
      expect(info.pv).toEqual([]);
    });

    it('parses "info string" with free text', () => {
      const line = 'info string NNUE evaluation using nn-xyz.nnue';
      const info = parseInfoLine(line);
      expect(info.string).toBe('NNUE evaluation using nn-xyz.nnue');
    });

    it('parses "info string" with complex free text', () => {
      const line =
        'info string d2d4  (0.35) d7d5  (-0.22) c2c4  (0.15) e7e6  (-0.10)';
      const info = parseInfoLine(line);
      expect(info.string).toBe(
        'd2d4  (0.35) d7d5  (-0.22) c2c4  (0.15) e7e6  (-0.10)',
      );
    });

    it('parses WDL values', () => {
      const line = 'info depth 20 score cp 35 wdl 450 400 150 pv e2e4';
      const info = parseInfoLine(line);
      expect(info.wdl).toEqual({ wins: 450, draws: 400, losses: 150 });
      expect(info.score).toEqual({ type: 'cp', value: 35 });
      expect(info.pv).toEqual(['e2e4']);
    });

    it('handles unknown fields by skipping them (forward-compatible)', () => {
      const line =
        'info depth 15 currmove e2e4 currmovenumber 1 score cp 20 pv e2e4';
      const info = parseInfoLine(line);
      expect(info.depth).toBe(15);
      expect(info.score).toEqual({ type: 'cp', value: 20 });
      expect(info.pv).toEqual(['e2e4']);
    });

    it('parses info line with only depth and score', () => {
      const line = 'info depth 5 score cp 0';
      const info = parseInfoLine(line);
      expect(info.depth).toBe(5);
      expect(info.score).toEqual({ type: 'cp', value: 0 });
      expect(info.pv).toBeUndefined();
    });
  });
});

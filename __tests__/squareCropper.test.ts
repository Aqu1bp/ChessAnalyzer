import {
  getSquareRegion,
  getSquareCenter,
  squareIndexToAlgebraic,
  algebraicToSquareIndex,
  BOARD_SIZE,
  SQUARE_SIZE,
} from '../src/services/recognition/squareCropper';

describe('squareCropper', () => {
  describe('getSquareRegion', () => {
    it('returns correct region for a8 (index 0)', () => {
      const region = getSquareRegion(0);
      expect(region).toEqual({ x: 0, y: 0, width: SQUARE_SIZE, height: SQUARE_SIZE });
    });

    it('returns correct region for h8 (index 7)', () => {
      const region = getSquareRegion(7);
      expect(region).toEqual({ x: 7 * SQUARE_SIZE, y: 0, width: SQUARE_SIZE, height: SQUARE_SIZE });
    });

    it('returns correct region for a1 (index 56)', () => {
      const region = getSquareRegion(56);
      expect(region).toEqual({ x: 0, y: 7 * SQUARE_SIZE, width: SQUARE_SIZE, height: SQUARE_SIZE });
    });

    it('returns correct region for h1 (index 63)', () => {
      const region = getSquareRegion(63);
      expect(region).toEqual({
        x: 7 * SQUARE_SIZE,
        y: 7 * SQUARE_SIZE,
        width: SQUARE_SIZE,
        height: SQUARE_SIZE,
      });
    });

    it('throws for out-of-range index', () => {
      expect(() => getSquareRegion(-1)).toThrow();
      expect(() => getSquareRegion(64)).toThrow();
    });

    it('covers the full board without gaps', () => {
      const covered = new Set<string>();
      for (let i = 0; i < 64; i++) {
        const r = getSquareRegion(i);
        covered.add(`${r.x},${r.y}`);
        expect(r.x + r.width).toBeLessThanOrEqual(BOARD_SIZE);
        expect(r.y + r.height).toBeLessThanOrEqual(BOARD_SIZE);
      }
      expect(covered.size).toBe(64);
    });
  });

  describe('squareIndexToAlgebraic', () => {
    it('maps index 0 to a8', () => {
      expect(squareIndexToAlgebraic(0)).toBe('a8');
    });

    it('maps index 7 to h8', () => {
      expect(squareIndexToAlgebraic(7)).toBe('h8');
    });

    it('maps index 56 to a1', () => {
      expect(squareIndexToAlgebraic(56)).toBe('a1');
    });

    it('maps index 63 to h1', () => {
      expect(squareIndexToAlgebraic(63)).toBe('h1');
    });

    it('maps e4 correctly', () => {
      // e4 = rank 4, file e = index (7-3)*8 + 4 = 36
      expect(squareIndexToAlgebraic(36)).toBe('e4');
    });
  });

  describe('algebraicToSquareIndex', () => {
    it('maps a8 to 0', () => {
      expect(algebraicToSquareIndex('a8')).toBe(0);
    });

    it('maps h1 to 63', () => {
      expect(algebraicToSquareIndex('h1')).toBe(63);
    });

    it('round-trips with squareIndexToAlgebraic', () => {
      for (let i = 0; i < 64; i++) {
        const alg = squareIndexToAlgebraic(i);
        expect(algebraicToSquareIndex(alg)).toBe(i);
      }
    });
  });

  describe('getSquareCenter', () => {
    it('returns center of first square', () => {
      const center = getSquareCenter(0);
      expect(center.x).toBe(SQUARE_SIZE / 2);
      expect(center.y).toBe(SQUARE_SIZE / 2);
    });
  });
});

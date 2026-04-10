import {
  wdlToWinPercent,
  cpToWinPercent,
  formatScore,
} from '../src/utils/evalUtils';
import type { EngineScore, WDL } from '../src/types/analysis';

describe('evalUtils', () => {
  describe('wdlToWinPercent', () => {
    it('converts equal WDL to 50%', () => {
      const wdl: WDL = { wins: 333, draws: 334, losses: 333 };
      expect(wdlToWinPercent(wdl)).toBeCloseTo(50, 0);
    });

    it('converts dominant white WDL to high percentage', () => {
      const wdl: WDL = { wins: 900, draws: 80, losses: 20 };
      // (900 + 80 * 0.5) / 10 = 94
      expect(wdlToWinPercent(wdl)).toBe(94);
    });

    it('converts dominant black WDL to low percentage', () => {
      const wdl: WDL = { wins: 20, draws: 80, losses: 900 };
      // (20 + 80 * 0.5) / 10 = 6
      expect(wdlToWinPercent(wdl)).toBe(6);
    });

    it('handles all wins', () => {
      const wdl: WDL = { wins: 1000, draws: 0, losses: 0 };
      expect(wdlToWinPercent(wdl)).toBe(100);
    });

    it('handles all losses', () => {
      const wdl: WDL = { wins: 0, draws: 0, losses: 1000 };
      expect(wdlToWinPercent(wdl)).toBe(0);
    });

    it('handles all draws', () => {
      const wdl: WDL = { wins: 0, draws: 1000, losses: 0 };
      expect(wdlToWinPercent(wdl)).toBe(50);
    });
  });

  describe('cpToWinPercent', () => {
    it('converts 0 cp to ~50%', () => {
      expect(cpToWinPercent(0)).toBeCloseTo(50, 5);
    });

    it('converts positive cp to > 50%', () => {
      expect(cpToWinPercent(100)).toBeGreaterThan(50);
    });

    it('converts negative cp to < 50%', () => {
      expect(cpToWinPercent(-100)).toBeLessThan(50);
    });

    it('is symmetric around 0', () => {
      const plus = cpToWinPercent(200);
      const minus = cpToWinPercent(-200);
      expect(plus + minus).toBeCloseTo(100, 5);
    });

    it('approaches 100 for large positive cp', () => {
      expect(cpToWinPercent(1000)).toBeGreaterThan(95);
    });

    it('approaches 0 for large negative cp', () => {
      expect(cpToWinPercent(-1000)).toBeLessThan(5);
    });
  });

  describe('formatScore', () => {
    it('formats positive centipawn score with + prefix', () => {
      const score: EngineScore = { type: 'cp', value: 35 };
      expect(formatScore(score)).toBe('+0.35');
    });

    it('formats negative centipawn score', () => {
      const score: EngineScore = { type: 'cp', value: -120 };
      expect(formatScore(score)).toBe('-1.20');
    });

    it('formats zero centipawn score', () => {
      const score: EngineScore = { type: 'cp', value: 0 };
      expect(formatScore(score)).toBe('0.00');
    });

    it('formats large positive centipawn score', () => {
      const score: EngineScore = { type: 'cp', value: 550 };
      expect(formatScore(score)).toBe('+5.50');
    });

    it('formats positive mate score', () => {
      const score: EngineScore = { type: 'mate', value: 3 };
      expect(formatScore(score)).toBe('M3');
    });

    it('formats negative mate score', () => {
      const score: EngineScore = { type: 'mate', value: -2 };
      expect(formatScore(score)).toBe('-M2');
    });

    it('formats mate in 1', () => {
      const score: EngineScore = { type: 'mate', value: 1 };
      expect(formatScore(score)).toBe('M1');
    });

    it('formats negative mate in 1', () => {
      const score: EngineScore = { type: 'mate', value: -1 };
      expect(formatScore(score)).toBe('-M1');
    });
  });
});

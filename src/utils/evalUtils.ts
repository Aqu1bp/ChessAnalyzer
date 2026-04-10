/**
 * Evaluation display utilities for Stockfish engine output.
 */

import type { EngineScore, WDL } from '../types/analysis';

/**
 * Convert WDL (in permille, sums to 1000) to white win percentage (0–100).
 * Formula: (wins + draws * 0.5) / 10
 */
export function wdlToWinPercent(wdl: WDL): number {
  return (wdl.wins + wdl.draws * 0.5) / 10;
}

/**
 * Fallback sigmoid conversion from centipawns to win percentage (0–100)
 * when WDL data is not available.
 *
 * Uses the Lichess/Stockfish standard sigmoid:
 *   50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
 */
export function cpToWinPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/**
 * Format an engine score for display.
 *
 * Examples:
 *   { type: 'cp', value: 35 }   => "+0.35"
 *   { type: 'cp', value: -120 } => "-1.20"
 *   { type: 'cp', value: 0 }    => "0.00"
 *   { type: 'mate', value: 3 }  => "M3"
 *   { type: 'mate', value: -2 } => "-M2"
 */
export function formatScore(score: EngineScore): string {
  if (score.type === 'mate') {
    if (score.value > 0) {
      return `M${score.value}`;
    } else if (score.value < 0) {
      return `-M${Math.abs(score.value)}`;
    }
    // mate in 0 shouldn't happen, but handle gracefully
    return 'M0';
  }

  // Centipawn score — convert to pawns with 2 decimal places
  const pawns = score.value / 100;

  if (pawns > 0) {
    return `+${pawns.toFixed(2)}`;
  }
  // toFixed handles negative sign and zero correctly
  return pawns.toFixed(2);
}

import { Chess } from 'chess.js';

/**
 * Parse a UCI move string into its components.
 *
 * UCI moves are formatted as:
 * - Normal: "e2e4" (from e2 to e4)
 * - Promotion: "e7e8q" (from e7 to e8 promoting to queen)
 *
 * @param uci - A UCI move string (4 or 5 characters)
 * @returns Parsed move with from, to, and optional promotion
 */
export function parseUciMove(uci: string): {
  from: string;
  to: string;
  promotion?: string;
} {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;

  return { from, to, promotion };
}

/**
 * Convert a sequence of UCI moves to SAN (Standard Algebraic Notation).
 *
 * Replays each move on a temporary Chess instance starting from the given FEN,
 * collecting the SAN representation of each move.
 *
 * @param uciMoves - Array of UCI move strings (e.g., ['e2e4', 'e7e5', 'g1f3'])
 * @param fen - Starting FEN position
 * @returns Array of SAN move strings (e.g., ['e4', 'e5', 'Nf3'])
 * @throws If any UCI move is illegal in the current position
 */
export function uciToSan(uciMoves: string[], fen: string): string[] {
  const chess = new Chess(fen);
  const sanMoves: string[] = [];

  for (const uci of uciMoves) {
    const { from, to, promotion } = parseUciMove(uci);
    try {
      const move = chess.move({ from, to, promotion });
      sanMoves.push(move.san);
    } catch {
      throw new Error(`Illegal UCI move: ${uci} in position ${chess.fen()}`);
    }
  }

  return sanMoves;
}

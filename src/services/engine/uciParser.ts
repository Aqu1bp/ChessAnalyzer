/**
 * Token-based, order-independent UCI output parser.
 *
 * Parses `info` and `bestmove` lines from Stockfish into structured types.
 * Unknown fields are silently skipped (forward-compatible).
 */

import type { EngineScore, UciInfo, WDL } from '../../types/analysis';

/** Result of parsing a single UCI output line. */
export type UciParseResult =
  | { type: 'info'; info: UciInfo }
  | { type: 'bestmove'; move: string; ponder?: string }
  | { type: 'uciok' }
  | { type: 'readyok' }
  | { type: 'unknown'; raw: string };

/**
 * Parse a single line of UCI engine output.
 */
export function parseUciLine(line: string): UciParseResult {
  const trimmed = line.trim();

  if (trimmed === 'uciok') {
    return { type: 'uciok' };
  }
  if (trimmed === 'readyok') {
    return { type: 'readyok' };
  }
  if (trimmed.startsWith('bestmove')) {
    return parseBestMove(trimmed);
  }
  if (trimmed.startsWith('info ')) {
    return { type: 'info', info: parseInfoLine(trimmed) };
  }
  return { type: 'unknown', raw: trimmed };
}

/**
 * Parse a `bestmove` line.
 * Format: `bestmove e2e4 [ponder d7d5]`
 */
function parseBestMove(line: string): UciParseResult {
  const tokens = line.split(/\s+/);
  const move = tokens[1] ?? '(none)';
  let ponder: string | undefined;
  const ponderIdx = tokens.indexOf('ponder');
  if (ponderIdx !== -1 && ponderIdx + 1 < tokens.length) {
    ponder = tokens[ponderIdx + 1];
  }
  return { type: 'bestmove', move, ponder };
}

/**
 * Parse an `info` line into a UciInfo object.
 *
 * Token-based: we walk through the tokens array, consuming field names
 * and their associated values. Unknown field names skip one token (the value).
 * Special fields:
 *   - `score`: consumes 2-3 tokens (type, value, optional bound)
 *   - `pv`: consumes all remaining tokens
 *   - `string`: consumes all remaining tokens as free text
 *   - `wdl`: consumes 3 tokens
 */
export function parseInfoLine(line: string): UciInfo {
  // Handle "info string ..." specially: preserve original whitespace
  const stringMatch = line.match(/^info\s+string\s(.*)/);
  if (stringMatch) {
    return { string: stringMatch[1] };
  }

  const tokens = line.split(/\s+/);
  const info: UciInfo = {};

  // Skip "info" prefix
  let i = tokens[0] === 'info' ? 1 : 0;

  while (i < tokens.length) {
    const token = tokens[i];

    switch (token) {
      case 'depth':
        i++;
        info.depth = parseInt(tokens[i], 10);
        i++;
        break;

      case 'seldepth':
        i++;
        info.seldepth = parseInt(tokens[i], 10);
        i++;
        break;

      case 'multipv':
        i++;
        info.multipv = parseInt(tokens[i], 10);
        i++;
        break;

      case 'nodes':
        i++;
        info.nodes = parseInt(tokens[i], 10);
        i++;
        break;

      case 'nps':
        i++;
        info.nps = parseInt(tokens[i], 10);
        i++;
        break;

      case 'time':
        i++;
        info.time = parseInt(tokens[i], 10);
        i++;
        break;

      case 'hashfull':
        i++;
        info.hashfull = parseInt(tokens[i], 10);
        i++;
        break;

      case 'tbhits':
        i++;
        info.tbhits = parseInt(tokens[i], 10);
        i++;
        break;

      case 'score': {
        i++;
        const scoreType = tokens[i] as 'cp' | 'mate';
        i++;
        const scoreValue = parseInt(tokens[i], 10);
        i++;

        const score: EngineScore = { type: scoreType, value: scoreValue };

        // Check for optional bound
        if (i < tokens.length && (tokens[i] === 'upperbound' || tokens[i] === 'lowerbound')) {
          score.bound = tokens[i] as 'upperbound' | 'lowerbound';
          i++;
        }

        info.score = score;
        break;
      }

      case 'wdl': {
        i++;
        const wins = parseInt(tokens[i], 10);
        i++;
        const draws = parseInt(tokens[i], 10);
        i++;
        const losses = parseInt(tokens[i], 10);
        i++;

        info.wdl = { wins, draws, losses };
        break;
      }

      case 'pv':
        i++;
        // PV consumes all remaining tokens
        info.pv = tokens.slice(i);
        i = tokens.length;
        break;

      case 'string':
        i++;
        // string consumes all remaining tokens as free text
        info.string = tokens.slice(i).join(' ');
        i = tokens.length;
        break;

      default:
        // Unknown field — skip the field name and its single value token
        i++;
        // Only skip a value if there is one (don't skip past end)
        if (i < tokens.length) {
          i++;
        }
        break;
    }
  }

  return info;
}

/**
 * Analysis Manager — orchestrates Stockfish analysis sessions.
 *
 * Responsibilities:
 * - Validates FEN before sending to engine (illegal positions crash Stockfish)
 * - Accumulates MultiPV lines per depth
 * - Converts UCI moves to SAN for display
 * - Debounces update callbacks (at most every 100ms)
 * - Provides clean callbacks: onDepthUpdate, onBestMove, onError
 */

import { Chess } from 'chess.js';

import type { StockfishWebView } from './stockfishWebView';
import { parseUciLine } from './uciParser';
import type { UciParseResult } from './uciParser';
import type { EngineScore, PVLine, UciInfo, WDL } from '../../types/analysis';

/** Depth update payload. */
export interface DepthUpdate {
  depth: number;
  pvLines: PVLine[];
  evaluation: EngineScore;
  wdl?: WDL;
}

/** Callbacks for analysis events. */
export interface AnalysisCallbacks {
  onDepthUpdate?: (update: DepthUpdate) => void;
  onBestMove?: (move: string, ponder?: string) => void;
  onError?: (error: string) => void;
}

export class AnalysisManager {
  private engine: StockfishWebView;
  private callbacks: AnalysisCallbacks = {};
  private currentFen: string | null = null;

  // PV accumulation: keyed by depth, each depth has an array of PVLines
  // indexed by multipv number (1-based).
  private pvByDepth: Map<number, Map<number, PVLine>> = new Map();

  // Debounce state
  private pendingUpdate: DepthUpdate | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEmitTime = 0;

  private _isRunning = false;

  constructor(engine: StockfishWebView) {
    this.engine = engine;
    this.engine.onLine(this.handleLine.bind(this));
  }

  /** Whether analysis is currently running. */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Set analysis callbacks. */
  setCallbacks(callbacks: AnalysisCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Start analysis on the given FEN position.
   * Validates the FEN with chess.js first.
   *
   * @param fen - FEN string to analyze
   * @param depth - Search depth limit
   */
  startAnalysis(fen: string, depth: number): void {
    // Validate FEN
    try {
      const chess = new Chess(fen);
      // chess.js constructor throws on invalid FEN
      // Double-check that the FEN roundtrips
      if (!chess.fen()) {
        throw new Error('Invalid FEN');
      }
    } catch {
      this.callbacks.onError?.(`Invalid FEN position: ${fen}`);
      return;
    }

    // Stop any current analysis
    if (this._isRunning) {
      this.engine.stop();
    }

    // Reset accumulation state
    this.pvByDepth.clear();
    this.pendingUpdate = null;
    this.currentFen = fen;
    this._isRunning = true;

    // Send commands to engine
    this.engine.sendCommand('ucinewgame');
    this.engine.sendCommand(`position fen ${fen}`);
    this.engine.sendCommand(`go depth ${depth}`);
  }

  /** Stop current analysis. */
  stopAnalysis(): void {
    if (this._isRunning) {
      this.engine.stop();
      this._isRunning = false;
    }
    this.flushPendingUpdate();
  }

  /** Clean up timers, callbacks, and state. */
  destroy(): void {
    this.stopAnalysis();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    // Unregister line callback to prevent stale references
    this.engine.onLine(() => {});
    this.callbacks = {};
  }

  /**
   * Handle a parsed UCI line from the engine.
   */
  private handleLine(result: UciParseResult): void {
    switch (result.type) {
      case 'info':
        this.handleInfoLine(result.info);
        break;

      case 'bestmove':
        this._isRunning = false;
        this.flushPendingUpdate();
        this.callbacks.onBestMove?.(result.move, result.ponder);
        break;

      default:
        // uciok, readyok, unknown — handled by StockfishWebView or ignored
        break;
    }
  }

  /**
   * Process a parsed info line.
   */
  private handleInfoLine(info: UciInfo): void {
    // Skip info lines without depth or score (e.g., "info string" debug output)
    if (info.depth === undefined || info.score === undefined) {
      return;
    }

    const depth = info.depth;
    const multipv = info.multipv ?? 1;

    // Convert UCI moves to SAN
    const movesUci = info.pv ?? [];
    const movesSan = this.uciToSan(movesUci);

    const pvLine: PVLine = {
      multipv,
      score: info.score,
      wdl: info.wdl,
      moves: movesSan,
      movesUci,
      depth,
    };

    // Store in accumulation map
    if (!this.pvByDepth.has(depth)) {
      this.pvByDepth.set(depth, new Map());
    }
    this.pvByDepth.get(depth)!.set(multipv, pvLine);

    // Build current PV lines for this depth (sorted by multipv)
    const depthMap = this.pvByDepth.get(depth)!;
    const pvLines = Array.from(depthMap.values()).sort(
      (a, b) => a.multipv - b.multipv,
    );

    // The primary line (multipv 1) provides the evaluation
    const primaryLine = pvLines.find((l) => l.multipv === 1) ?? pvLines[0];

    const update: DepthUpdate = {
      depth,
      pvLines,
      evaluation: primaryLine.score,
      wdl: primaryLine.wdl,
    };

    this.scheduleUpdate(update);
  }

  /**
   * Convert UCI move strings to SAN using chess.js.
   * If conversion fails (e.g., illegal move), returns the UCI strings.
   */
  private uciToSan(uciMoves: string[]): string[] {
    if (!this.currentFen || uciMoves.length === 0) {
      return uciMoves;
    }

    try {
      const chess = new Chess(this.currentFen);
      const sanMoves: string[] = [];

      for (const uciMove of uciMoves) {
        const from = uciMove.slice(0, 2);
        const to = uciMove.slice(2, 4);
        const promotion = uciMove.length > 4 ? uciMove[4] : undefined;

        try {
          const result = chess.move({ from, to, promotion });
          if (result) {
            sanMoves.push(result.san);
          } else {
            // Move failed, fall back to UCI for remaining moves
            sanMoves.push(uciMove);
          }
        } catch {
          // chess.js throws on illegal moves
          sanMoves.push(uciMove);
        }
      }

      return sanMoves;
    } catch {
      // If the FEN is somehow invalid, just return UCI moves
      return uciMoves;
    }
  }

  /**
   * Debounced update scheduling — emit at most every 100ms.
   */
  private scheduleUpdate(update: DepthUpdate): void {
    this.pendingUpdate = update;

    const now = Date.now();
    const elapsed = now - this.lastEmitTime;

    if (elapsed >= 100) {
      this.emitUpdate();
    } else if (!this.debounceTimer) {
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        this.emitUpdate();
      }, 100 - elapsed);
    }
  }

  private flushPendingUpdate(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.pendingUpdate) {
      this.emitUpdate();
    }
  }

  private emitUpdate(): void {
    if (!this.pendingUpdate) return;
    this.lastEmitTime = Date.now();
    const update = this.pendingUpdate;
    this.pendingUpdate = null;
    this.callbacks.onDepthUpdate?.(update);
  }
}

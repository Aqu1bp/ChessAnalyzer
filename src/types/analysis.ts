/** Score from Stockfish */
export interface EngineScore {
  type: 'cp' | 'mate';
  value: number;
  bound?: 'upperbound' | 'lowerbound';
}

/** Win/Draw/Loss in permille (sums to 1000) */
export interface WDL {
  wins: number;
  draws: number;
  losses: number;
}

/** Parsed UCI info line */
export interface UciInfo {
  depth?: number;
  seldepth?: number;
  multipv?: number;
  score?: EngineScore;
  nodes?: number;
  nps?: number;
  time?: number;
  hashfull?: number;
  tbhits?: number;
  pv?: string[]; // UCI long algebraic moves
  wdl?: WDL;
  string?: string; // free-text debug output
}

/** A single principal variation line */
export interface PVLine {
  multipv: number;
  score: EngineScore;
  wdl?: WDL;
  moves: string[]; // SAN notation for display
  movesUci: string[]; // UCI notation (raw from engine)
  depth: number;
}

/** Engine analysis state */
export type AnalysisStatus = 'idle' | 'initializing' | 'running' | 'stopped' | 'error';

/** Engine lifecycle state */
export type EngineStatus = 'unloaded' | 'loading' | 'ready' | 'error';

import { create } from 'zustand';
import type {
  BoardState,
  CastlingRights,
  InputMode,
  PieceColor,
  SquarePrediction,
  BoardQuad,
} from '../types/chess';
import type {
  AnalysisStatus,
  EngineScore,
  EngineStatus,
  PVLine,
  WDL,
} from '../types/analysis';

interface AppState {
  // --- Image & Input ---
  sourceImageUri: string | null;
  inputMode: InputMode | null;

  // --- Board Localization ---
  boardQuad: BoardQuad | null;
  warpedBoardUri: string | null;

  // --- Recognition ---
  recognitionStatus: 'idle' | 'processing' | 'complete' | 'error';
  predictions: SquarePrediction[];
  editableBoard: BoardState;

  // --- FEN Metadata (user-editable) ---
  activeColor: PieceColor;
  castling: CastlingRights;
  enPassant: string;

  // --- Computed FEN ---
  fen: string | null;

  // --- Engine ---
  engineStatus: EngineStatus;
  analysisStatus: AnalysisStatus;
  currentDepth: number;
  targetDepth: number;
  evaluation: EngineScore | null;
  wdl: WDL | null;
  bestMove: string | null;
  pvLines: PVLine[];

  // --- UI ---
  boardFlipped: boolean;

  // --- Actions ---
  setSourceImage: (uri: string, mode: InputMode) => void;
  setBoardQuad: (quad: BoardQuad) => void;
  setWarpedBoard: (uri: string) => void;
  setPredictions: (predictions: SquarePrediction[]) => void;
  setEditableBoard: (board: BoardState) => void;
  setActiveColor: (color: PieceColor) => void;
  setCastling: (castling: CastlingRights) => void;
  setEnPassant: (square: string) => void;
  setFen: (fen: string) => void;
  setEngineStatus: (status: EngineStatus) => void;
  setAnalysisStatus: (status: AnalysisStatus) => void;
  clearAnalysis: () => void;
  updateAnalysis: (update: {
    depth?: number;
    evaluation?: EngineScore;
    wdl?: WDL;
    bestMove?: string;
    pvLines?: PVLine[];
  }) => void;
  setTargetDepth: (depth: number) => void;
  flipBoard: () => void;
  reset: () => void;
}

const initialState = {
  sourceImageUri: null,
  inputMode: null,
  boardQuad: null,
  warpedBoardUri: null,
  recognitionStatus: 'idle' as const,
  predictions: [],
  editableBoard: Array(64).fill(null) as BoardState,
  activeColor: 'w' as PieceColor,
  castling: { K: true, Q: true, k: true, q: true },
  enPassant: '-',
  fen: null,
  engineStatus: 'unloaded' as EngineStatus,
  analysisStatus: 'idle' as AnalysisStatus,
  currentDepth: 0,
  targetDepth: 20,
  evaluation: null,
  wdl: null,
  bestMove: null,
  pvLines: [],
  boardFlipped: false,
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setSourceImage: (uri, mode) => set({ sourceImageUri: uri, inputMode: mode }),
  setBoardQuad: (quad) => set({ boardQuad: quad }),
  setWarpedBoard: (uri) => set({ warpedBoardUri: uri }),
  setPredictions: (predictions) => set({ predictions, recognitionStatus: 'complete' }),
  setEditableBoard: (board) => set({ editableBoard: board }),
  setActiveColor: (color) => set({ activeColor: color }),
  setCastling: (castling) => set({ castling }),
  setEnPassant: (square) => set({ enPassant: square }),
  setFen: (fen) => set({ fen }),
  setEngineStatus: (status) => set({ engineStatus: status }),
  setAnalysisStatus: (status) => set({ analysisStatus: status }),
  clearAnalysis: () =>
    set({
      analysisStatus: 'idle',
      currentDepth: 0,
      evaluation: null,
      wdl: null,
      bestMove: null,
      pvLines: [],
    }),
  updateAnalysis: (update) =>
    set((state) => ({
      currentDepth: update.depth ?? state.currentDepth,
      evaluation: update.evaluation ?? state.evaluation,
      wdl: update.wdl ?? state.wdl,
      bestMove: update.bestMove ?? state.bestMove,
      pvLines: update.pvLines ?? state.pvLines,
    })),
  setTargetDepth: (depth) => set({ targetDepth: depth }),
  flipBoard: () => set((state) => ({ boardFlipped: !state.boardFlipped })),
  reset: () => set(initialState),
}));

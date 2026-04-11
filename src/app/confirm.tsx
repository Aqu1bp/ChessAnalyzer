/**
 * Confirmation Screen — review and correct the detected chess position.
 *
 * Displays an editable board where squares cycle through pieces on tap.
 * Below the board: side to move, castling toggles, FEN display, and validation.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

import { useAppStore } from '../stores/appStore';
import BoardSurface from '../components/board/BoardSurface';
import { buildFullFen, predictionsToBoard } from '../services/recognition/fenBuilder';
import {
  validateBoard,
  inferCastlingDefaults,
  validateFen,
  type ValidationError,
} from '../services/recognition/boardValidator';
import { isEnPassantPossible } from '../utils/fen';
import type {
  BoardState,
  Piece,
  PieceColor,
  PieceType,
  CastlingRights,
  FenMetadata,
} from '../types/chess';

/** Cycle order for tapping a square. */
const PIECE_CYCLE: (Piece | null)[] = [
  null,
  { color: 'w', type: 'p' },
  { color: 'w', type: 'n' },
  { color: 'w', type: 'b' },
  { color: 'w', type: 'r' },
  { color: 'w', type: 'q' },
  { color: 'w', type: 'k' },
  { color: 'b', type: 'p' },
  { color: 'b', type: 'n' },
  { color: 'b', type: 'b' },
  { color: 'b', type: 'r' },
  { color: 'b', type: 'q' },
  { color: 'b', type: 'k' },
];

function piecesEqual(a: Piece | null, b: Piece | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.color === b.color && a.type === b.type;
}

/** Build the standard starting position as a BoardState. */
function startingBoard(): BoardState {
  const board: BoardState = Array(64).fill(null);
  // Rank 8 (indices 0-7): black pieces
  const backRank: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let i = 0; i < 8; i++) {
    board[i] = { color: 'b', type: backRank[i] };
    board[8 + i] = { color: 'b', type: 'p' };
    board[48 + i] = { color: 'w', type: 'p' };
    board[56 + i] = { color: 'w', type: backRank[i] };
  }
  return board;
}

export default function ConfirmScreen() {
  const router = useRouter();
  const { width: winWidth } = useWindowDimensions();

  const editableBoard = useAppStore((s) => s.editableBoard);
  const predictions = useAppStore((s) => s.predictions);
  const sourceImageUri = useAppStore((s) => s.sourceImageUri);
  const setEditableBoard = useAppStore((s) => s.setEditableBoard);
  const activeColor = useAppStore((s) => s.activeColor);
  const setActiveColor = useAppStore((s) => s.setActiveColor);
  const castling = useAppStore((s) => s.castling);
  const setCastling = useAppStore((s) => s.setCastling);
  const enPassant = useAppStore((s) => s.enPassant);
  const setEnPassant = useAppStore((s) => s.setEnPassant);
  const boardFlipped = useAppStore((s) => s.boardFlipped);
  const flipBoard = useAppStore((s) => s.flipBoard);
  const setFen = useAppStore((s) => s.setFen);

  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  const boardSize = Math.min(winWidth - 32, 360);

  const recognitionBackfillNeeded =
    predictions.length === 64 && editableBoard.every((sq) => sq === null);
  const manualEntryMode =
    predictions.length === 0 && editableBoard.every((sq) => sq === null);

  // Initialize board from recognition output when available.
  useEffect(() => {
    if (recognitionBackfillNeeded) {
      const board = predictionsToBoard(predictions);
      setEditableBoard(board);
      const rights = inferCastlingDefaults(board);
      setCastling(rights);
    } else if (!editableBoard.every((sq) => sq === null)) {
      const rights = inferCastlingDefaults(editableBoard);
      setCastling(rights);
    } else {
      setCastling({ K: false, Q: false, k: false, q: false });
    }
  }, [editableBoard, predictions, recognitionBackfillNeeded, setCastling, setEditableBoard]);

  // Compute FEN from current state
  const currentFen = useMemo(() => {
    const metadata: FenMetadata = {
      activeColor,
      castling,
      enPassant,
      halfmoveClock: 0,
      fullmoveNumber: 1,
    };
    return buildFullFen(editableBoard, metadata);
  }, [activeColor, castling, editableBoard, enPassant]);

  const enPassantCandidates = useMemo(
    () => isEnPassantPossible(editableBoard, activeColor),
    [activeColor, editableBoard],
  );

  useEffect(() => {
    if (enPassant !== '-' && !enPassantCandidates.includes(enPassant)) {
      setEnPassant('-');
    }
  }, [enPassant, enPassantCandidates, setEnPassant]);

  const handleSquarePress = useCallback(
    (index: number) => {
      const current = editableBoard[index] ?? null;
      // Find current position in cycle
      let cycleIdx = PIECE_CYCLE.findIndex((p) => piecesEqual(p, current));
      if (cycleIdx === -1) cycleIdx = 0;
      const nextIdx = (cycleIdx + 1) % PIECE_CYCLE.length;
      const newBoard = [...editableBoard];
      newBoard[index] = PIECE_CYCLE[nextIdx];
      setEditableBoard(newBoard);
      setValidationErrors([]);
    },
    [editableBoard, setEditableBoard],
  );

  const handleCopyFen = async () => {
    await Clipboard.setStringAsync(currentFen);
    Alert.alert('Copied', 'FEN copied to clipboard');
  };

  const handleLoadStartingPosition = () => {
    const board = startingBoard();
    setEditableBoard(board);
    setCastling(inferCastlingDefaults(board));
    setEnPassant('-');
    setValidationErrors([]);
  };

  const handleClearBoard = () => {
    setEditableBoard(Array(64).fill(null));
    setCastling({ K: false, Q: false, k: false, q: false });
    setEnPassant('-');
    setValidationErrors([]);
  };

  const toggleCastling = (key: keyof CastlingRights) => {
    setCastling({ ...castling, [key]: !castling[key] });
  };

  const handleAnalyze = () => {
    // Validate
    const result = validateBoard(editableBoard);
    if (!result.valid) {
      setValidationErrors(result.errors);
      return;
    }

    const fenValidation = validateFen(currentFen);
    if (!fenValidation.valid) {
      setValidationErrors(fenValidation.errors);
      return;
    }

    setValidationErrors([]);
    setFen(currentFen);
    router.push('/analysis');
  };

  // Highlight squares that have validation errors
  const errorSquares = useMemo(() => {
    const set = new Set<number>();
    for (const err of validationErrors) {
      if (err.squares) {
        for (const sq of err.squares) {
          set.add(sq);
        }
      }
    }
    return Array.from(set);
  }, [validationErrors]);

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
    >
      {sourceImageUri && (
        <View style={styles.referenceSection}>
          <Text style={styles.sectionTitle}>Reference Image</Text>
          <Image
            source={{ uri: sourceImageUri }}
            style={styles.referenceImage}
            resizeMode="contain"
          />
        </View>
      )}

      {manualEntryMode && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            Automatic board recognition is not wired into this build yet. Use the selected image as a
            reference and tap squares to enter the position manually.
          </Text>
        </View>
      )}

      {/* Board */}
      <BoardSurface
        board={editableBoard}
        boardFlipped={boardFlipped}
        size={boardSize}
        onSquarePress={handleSquarePress}
        highlightSquares={errorSquares}
        highlightColor="#ff4444"
      />

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <View style={styles.errorContainer}>
          {validationErrors.map((err, i) => (
            <Text key={i} style={styles.errorText}>
              {err.message}
            </Text>
          ))}
        </View>
      )}

      {/* Flip Board button */}
      <Pressable style={styles.flipButton} onPress={flipBoard}>
        <Text style={styles.flipButtonText}>Flip Board</Text>
      </Pressable>

      <View style={styles.utilityRow}>
        <Pressable style={styles.utilityButton} onPress={handleLoadStartingPosition}>
          <Text style={styles.utilityButtonText}>Load Start</Text>
        </Pressable>
        <Pressable style={styles.utilityButton} onPress={handleClearBoard}>
          <Text style={styles.utilityButtonText}>Clear Board</Text>
        </Pressable>
      </View>

      {/* Side to move */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Side to Move</Text>
        <View style={styles.sideRow}>
          <Pressable
            style={[
              styles.sideButton,
              activeColor === 'w' && styles.sideButtonActive,
            ]}
            onPress={() => setActiveColor('w')}
          >
            <Text
              style={[
                styles.sideButtonText,
                activeColor === 'w' && styles.sideButtonTextActive,
              ]}
            >
              White
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.sideButton,
              activeColor === 'b' && styles.sideButtonActive,
            ]}
            onPress={() => setActiveColor('b')}
          >
            <Text
              style={[
                styles.sideButtonText,
                activeColor === 'b' && styles.sideButtonTextActive,
              ]}
            >
              Black
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Castling */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Castling Rights</Text>
        <View style={styles.castlingRow}>
          {([
            { key: 'K' as const, label: '\u2654 O-O' },
            { key: 'Q' as const, label: '\u2654 O-O-O' },
            { key: 'k' as const, label: '\u265A O-O' },
            { key: 'q' as const, label: '\u265A O-O-O' },
          ] as const).map(({ key, label }) => (
            <Pressable
              key={key}
              style={[
                styles.castlingToggle,
                castling[key] && styles.castlingToggleActive,
              ]}
              onPress={() => toggleCastling(key)}
            >
              <Text
                style={[
                  styles.castlingText,
                  castling[key] && styles.castlingTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>En Passant</Text>
        <View style={styles.castlingRow}>
          <Pressable
            style={[
              styles.castlingToggle,
              enPassant === '-' && styles.castlingToggleActive,
            ]}
            onPress={() => setEnPassant('-')}
          >
            <Text
              style={[
                styles.castlingText,
                enPassant === '-' && styles.castlingTextActive,
              ]}
            >
              None
            </Text>
          </Pressable>
          {enPassantCandidates.map((square) => (
            <Pressable
              key={square}
              style={[
                styles.castlingToggle,
                enPassant === square && styles.castlingToggleActive,
              ]}
              onPress={() => setEnPassant(square)}
            >
              <Text
                style={[
                  styles.castlingText,
                  enPassant === square && styles.castlingTextActive,
                ]}
              >
                {square}
              </Text>
            </Pressable>
          ))}
        </View>
        {enPassantCandidates.length === 0 && (
          <Text style={styles.helperText}>
            No en passant square is geometrically plausible in the current position.
          </Text>
        )}
      </View>

      {/* FEN display */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>FEN</Text>
        <View style={styles.fenRow}>
          <Text style={styles.fenText} numberOfLines={2} selectable>
            {currentFen}
          </Text>
          <Pressable style={styles.copyButton} onPress={handleCopyFen}>
            <Text style={styles.copyButtonText}>Copy</Text>
          </Pressable>
        </View>
      </View>

      {/* Analyze button */}
      <Pressable style={styles.analyzeButton} onPress={handleAnalyze}>
        <Text style={styles.analyzeButtonText}>Analyze</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#16213e',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    alignItems: 'center',
  },
  errorContainer: {
    width: '100%',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  referenceSection: {
    width: '100%',
    marginBottom: 16,
  },
  referenceImage: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  infoBanner: {
    width: '100%',
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#0f3460',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  infoBannerText: {
    color: '#c0c0c0',
    fontSize: 13,
    lineHeight: 19,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 13,
    marginBottom: 2,
  },
  flipButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#0f3460',
    borderRadius: 8,
  },
  flipButtonText: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: '600',
  },
  utilityRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  utilityButton: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#0f3460',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  utilityButtonText: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    width: '100%',
    marginTop: 20,
  },
  sectionTitle: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  sideRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sideButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  sideButtonActive: {
    backgroundColor: '#0f3460',
    borderColor: '#22c55e',
  },
  sideButtonText: {
    color: '#8892b0',
    fontSize: 15,
    fontWeight: '600',
  },
  sideButtonTextActive: {
    color: '#e0e0e0',
  },
  castlingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  castlingToggle: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  castlingToggleActive: {
    backgroundColor: '#0f3460',
    borderColor: '#22c55e',
  },
  castlingText: {
    color: '#8892b0',
    fontSize: 13,
    fontWeight: '600',
  },
  castlingTextActive: {
    color: '#e0e0e0',
  },
  helperText: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  fenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 10,
    gap: 8,
  },
  fenText: {
    flex: 1,
    color: '#8892b0',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  copyButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#0f3460',
    borderRadius: 6,
  },
  copyButtonText: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: '600',
  },
  analyzeButton: {
    marginTop: 24,
    width: '100%',
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  analyzeButtonText: {
    color: '#1a1a1a',
    fontSize: 18,
    fontWeight: '700',
  },
});

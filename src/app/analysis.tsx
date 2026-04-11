/**
 * Analysis Screen — displays the board, eval bar, PV lines, and engine controls.
 *
 * On mount: starts Stockfish analysis via the analysis manager.
 * On unmount: stops analysis and cleans up.
 */

import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Alert,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { useAppStore } from '../stores/appStore';
import BoardSurface from '../components/board/BoardSurface';
import EvalBar from '../components/analysis/EvalBar';
import { useStockfish } from '../components/analysis/StockfishProvider';
import { AnalysisManager } from '../services/engine/analysisManager';
import { formatScore } from '../utils/evalUtils';
import { parseFen } from '../utils/fen';
import type { PVLine } from '../types/analysis';

/** Parse a UCI move string "e2e4" to { from, to } board indices. */
function uciMoveToIndices(uci: string): { from: number; to: number } | null {
  if (!uci || uci.length < 4) return null;
  const fromFile = uci.charCodeAt(0) - 'a'.charCodeAt(0);
  const fromRank = parseInt(uci[1], 10);
  const toFile = uci.charCodeAt(2) - 'a'.charCodeAt(0);
  const toRank = parseInt(uci[3], 10);

  if (
    fromFile < 0 || fromFile > 7 || fromRank < 1 || fromRank > 8 ||
    toFile < 0 || toFile > 7 || toRank < 1 || toRank > 8
  ) {
    return null;
  }

  const fromIdx = (8 - fromRank) * 8 + fromFile;
  const toIdx = (8 - toRank) * 8 + toFile;
  return { from: fromIdx, to: toIdx };
}

export default function AnalysisScreen() {
  const router = useRouter();
  const { width: winWidth } = useWindowDimensions();
  const engine = useStockfish();
  const managerRef = useRef<AnalysisManager | null>(null);

  // Store state
  const fen = useAppStore((s) => s.fen);
  const evaluation = useAppStore((s) => s.evaluation);
  const wdl = useAppStore((s) => s.wdl);
  const bestMove = useAppStore((s) => s.bestMove);
  const pvLines = useAppStore((s) => s.pvLines);
  const currentDepth = useAppStore((s) => s.currentDepth);
  const targetDepth = useAppStore((s) => s.targetDepth);
  const boardFlipped = useAppStore((s) => s.boardFlipped);
  const flipBoard = useAppStore((s) => s.flipBoard);
  const setEngineStatus = useAppStore((s) => s.setEngineStatus);
  const updateAnalysis = useAppStore((s) => s.updateAnalysis);
  const setAnalysisStatus = useAppStore((s) => s.setAnalysisStatus);
  const clearAnalysis = useAppStore((s) => s.clearAnalysis);
  const reset = useAppStore((s) => s.reset);

  // Parse board from FEN
  const board = useMemo(() => {
    if (!fen) return Array(64).fill(null);
    const parsed = parseFen(fen);
    return parsed ? parsed.board : Array(64).fill(null);
  }, [fen]);

  // Sizes
  const evalBarWidth = 32;
  const boardSize = Math.min(winWidth - evalBarWidth - 32, 340);

  // Best move arrow
  const arrow = useMemo(() => {
    if (!bestMove) return null;
    // bestMove could be UCI like "e2e4" or might be from PV line 1
    const indices = uciMoveToIndices(bestMove);
    if (indices) return indices;
    // Try PV line 1 first move
    if (pvLines.length > 0 && pvLines[0].movesUci.length > 0) {
      return uciMoveToIndices(pvLines[0].movesUci[0]);
    }
    return null;
  }, [bestMove, pvLines]);

  // Depth progress bar
  const depthProgress = useSharedValue(0);

  useEffect(() => {
    const pct = targetDepth > 0 ? (currentDepth / targetDepth) * 100 : 0;
    depthProgress.value = withTiming(Math.min(pct, 100), {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [currentDepth, targetDepth, depthProgress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${depthProgress.value}%`,
  }));

  useEffect(() => {
    if (!fen) return;

    clearAnalysis();
    setAnalysisStatus('initializing');
    engine.onStatusChange(setEngineStatus);

    const manager = new AnalysisManager(engine);
    managerRef.current = manager;

    manager.setCallbacks({
      onDepthUpdate: (update) => {
        setAnalysisStatus('running');
        updateAnalysis({
          depth: update.depth,
          evaluation: update.evaluation,
          wdl: update.wdl,
          pvLines: update.pvLines,
        });
      },
      onBestMove: (move) => {
        updateAnalysis({ bestMove: move });
        setAnalysisStatus('stopped');
      },
      onError: (error) => {
        setAnalysisStatus('error');
        Alert.alert('Analysis Error', error);
      },
    });

    let cancelled = false;

    const start = async () => {
      try {
        await engine.init();
        if (cancelled) return;
        manager.startAnalysis(fen, targetDepth);
      } catch (error) {
        if (cancelled) return;
        setAnalysisStatus('error');
        Alert.alert(
          'Engine Error',
          error instanceof Error ? error.message : 'Failed to initialize Stockfish.',
        );
      }
    };

    void start();

    return () => {
      cancelled = true;
      manager.destroy();
      managerRef.current = null;
    };
  }, [
    clearAnalysis,
    engine,
    fen,
    setAnalysisStatus,
    setEngineStatus,
    targetDepth,
    updateAnalysis,
  ]);

  const handleNewScan = () => {
    if (managerRef.current) {
      managerRef.current.stopAnalysis();
    }
    reset();
    router.replace('/');
  };

  const handleCopyFen = async () => {
    if (fen) {
      await Clipboard.setStringAsync(fen);
      Alert.alert('Copied', 'FEN copied to clipboard');
    }
  };

  const handleShare = async () => {
    if (fen) {
      const scoreText = evaluation ? formatScore(evaluation) : 'N/A';
      const message = `Chess position analysis:\nFEN: ${fen}\nEval: ${scoreText}\nDepth: ${currentDepth}`;
      try {
        await Share.share({ message });
      } catch {
        // User cancelled or share failed
      }
    }
  };

  if (!fen) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          No position to analyze. Go back and set up a position.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Board + Eval Bar row */}
      <View style={styles.boardRow}>
        <EvalBar
          score={evaluation}
          wdl={wdl}
          height={boardSize}
          width={evalBarWidth}
        />
        <BoardSurface
          board={board}
          boardFlipped={boardFlipped}
          size={boardSize}
          arrow={arrow}
          arrowColor="#22c55e"
        />
      </View>

      {/* Depth progress */}
      <View style={styles.depthContainer}>
        <Text style={styles.depthText}>
          Depth: {currentDepth}/{targetDepth}
        </Text>
        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFill, progressStyle]} />
        </View>
      </View>

      {/* PV Lines */}
      <View style={styles.pvContainer}>
        <Text style={styles.sectionTitle}>Principal Variations</Text>
        {pvLines.length === 0 ? (
          <Text style={styles.pvPlaceholder}>Calculating...</Text>
        ) : (
          pvLines.slice(0, 3).map((pv) => (
            <PVLineRow key={pv.multipv} pv={pv} />
          ))
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actionsContainer}>
        <View style={styles.actionRow}>
          <Pressable style={styles.actionButton} onPress={flipBoard}>
            <Text style={styles.actionButtonText}>Flip Board</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={handleCopyFen}>
            <Text style={styles.actionButtonText}>Copy FEN</Text>
          </Pressable>
        </View>
        <View style={styles.actionRow}>
          <Pressable style={styles.actionButton} onPress={handleShare}>
            <Text style={styles.actionButtonText}>Share</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, styles.newScanButton]}
            onPress={handleNewScan}
          >
            <Text style={[styles.actionButtonText, styles.newScanText]}>
              New Scan
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

/** Single PV line row. */
function PVLineRow({ pv }: { pv: PVLine }) {
  const scoreText = formatScore(pv.score);
  const movesText = pv.moves.slice(0, 8).join(' ');

  return (
    <View style={styles.pvRow}>
      <View style={styles.pvHeader}>
        <Text style={styles.pvNumber}>{pv.multipv}.</Text>
        <Text style={styles.pvScore}>{scoreText}</Text>
        <Text style={styles.pvDepth}>d{pv.depth}</Text>
      </View>
      <Text style={styles.pvMoves} numberOfLines={2}>
        {movesText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#16213e',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    alignItems: 'center',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 16,
    textAlign: 'center',
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  depthContainer: {
    width: '100%',
    marginTop: 16,
  },
  depthText: {
    color: '#8892b0',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginBottom: 6,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1a1a2e',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: 3,
  },
  pvContainer: {
    width: '100%',
    marginTop: 20,
  },
  sectionTitle: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  pvPlaceholder: {
    color: '#8892b0',
    fontSize: 13,
    fontStyle: 'italic',
  },
  pvRow: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  pvHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  pvNumber: {
    color: '#8892b0',
    fontSize: 13,
    fontWeight: '700',
    width: 20,
  },
  pvScore: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 50,
  },
  pvDepth: {
    color: '#8892b0',
    fontSize: 11,
  },
  pvMoves: {
    color: '#c0c0c0',
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  actionsContainer: {
    width: '100%',
    marginTop: 20,
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#0f3460',
    borderRadius: 10,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: '600',
  },
  newScanButton: {
    backgroundColor: '#0f3460',
    borderColor: '#0f3460',
  },
  newScanText: {
    color: '#e0e0e0',
  },
});

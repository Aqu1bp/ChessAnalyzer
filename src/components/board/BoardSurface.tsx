/**
 * Reusable SVG chess board component.
 *
 * - 8x8 grid with configurable square colors
 * - Renders pieces as Unicode text
 * - Supports flipping, square tapping, highlighting, and best-move arrow
 */

import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Rect,
  Text as SvgText,
  Line,
  Polygon,
  G,
} from 'react-native-svg';
import type { BoardState, Piece } from '../../types/chess';

// Unicode chess symbols keyed by "color-type"
const PIECE_UNICODE: Record<string, string> = {
  'w-k': '\u2654', // ♔
  'w-q': '\u2655', // ♕
  'w-r': '\u2656', // ♖
  'w-b': '\u2657', // ♗
  'w-n': '\u2658', // ♘
  'w-p': '\u2659', // ♙
  'b-k': '\u265A', // ♚
  'b-q': '\u265B', // ♛
  'b-r': '\u265C', // ♜
  'b-b': '\u265D', // ♝
  'b-n': '\u265E', // ♞
  'b-p': '\u265F', // ♟
};

function pieceToUnicode(piece: Piece): string {
  return PIECE_UNICODE[`${piece.color}-${piece.type}`] ?? '?';
}

interface Arrow {
  from: number; // board index
  to: number; // board index
}

interface BoardSurfaceProps {
  board: BoardState;
  boardFlipped?: boolean;
  size?: number;
  lightColor?: string;
  darkColor?: string;
  onSquarePress?: (index: number) => void;
  highlightSquares?: number[];
  highlightColor?: string;
  arrow?: Arrow | null;
  arrowColor?: string;
}

export default function BoardSurface({
  board,
  boardFlipped = false,
  size = 320,
  lightColor = '#f0d9b5',
  darkColor = '#b58863',
  onSquarePress,
  highlightSquares = [],
  highlightColor = '#ff4444',
  arrow = null,
  arrowColor = '#22c55e',
}: BoardSurfaceProps) {
  const sqSize = size / 8;

  /** Convert board index (0=a8) to visual row/col accounting for flip. */
  const indexToVisual = useCallback(
    (index: number): { col: number; row: number } => {
      const boardRow = Math.floor(index / 8); // 0 = rank 8
      const boardCol = index % 8; // 0 = a-file
      if (boardFlipped) {
        return { col: 7 - boardCol, row: 7 - boardRow };
      }
      return { col: boardCol, row: boardRow };
    },
    [boardFlipped],
  );

  /** Convert visual row/col back to board index. */
  const visualToIndex = useCallback(
    (row: number, col: number): number => {
      if (boardFlipped) {
        return (7 - row) * 8 + (7 - col);
      }
      return row * 8 + col;
    },
    [boardFlipped],
  );

  const highlightSet = new Set(highlightSquares);

  const squares: React.ReactNode[] = [];

  for (let vRow = 0; vRow < 8; vRow++) {
    for (let vCol = 0; vCol < 8; vCol++) {
      const idx = visualToIndex(vRow, vCol);
      const isDark = (vRow + vCol) % 2 === 1;
      const x = vCol * sqSize;
      const y = vRow * sqSize;
      const piece = board[idx] ?? null;
      const isHighlighted = highlightSet.has(idx);

      squares.push(
        <G
          key={idx}
          onPress={onSquarePress ? () => onSquarePress(idx) : undefined}
        >
          <Rect
            x={x}
            y={y}
            width={sqSize}
            height={sqSize}
            fill={isDark ? darkColor : lightColor}
          />
          {isHighlighted && (
            <Rect
              x={x + 1}
              y={y + 1}
              width={sqSize - 2}
              height={sqSize - 2}
              fill="none"
              stroke={highlightColor}
              strokeWidth={2}
            />
          )}
          {piece && (
            <SvgText
              x={x + sqSize / 2}
              y={y + sqSize * 0.78}
              textAnchor="middle"
              fontSize={sqSize * 0.7}
              fill={piece.color === 'w' ? '#ffffff' : '#1a1a1a'}
              // Add a subtle stroke so white pieces are visible on light squares
              stroke={piece.color === 'w' ? '#333333' : '#cccccc'}
              strokeWidth={0.5}
            >
              {pieceToUnicode(piece)}
            </SvgText>
          )}
        </G>,
      );
    }
  }

  // Arrow overlay
  let arrowOverlay: React.ReactNode = null;
  if (arrow) {
    const from = indexToVisual(arrow.from);
    const to = indexToVisual(arrow.to);
    const fx = from.col * sqSize + sqSize / 2;
    const fy = from.row * sqSize + sqSize / 2;
    const tx = to.col * sqSize + sqSize / 2;
    const ty = to.row * sqSize + sqSize / 2;

    // Compute arrowhead
    const dx = tx - fx;
    const dy = ty - fy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const ux = dx / len;
      const uy = dy / len;
      const headLen = sqSize * 0.35;
      const headWidth = sqSize * 0.2;

      // Shorten the line so arrow tip sits at target center
      const tipX = tx;
      const tipY = ty;
      const baseX = tx - ux * headLen;
      const baseY = ty - uy * headLen;

      // Perpendicular
      const px = -uy * headWidth;
      const py = ux * headWidth;

      arrowOverlay = (
        <G opacity={0.8}>
          <Line
            x1={fx}
            y1={fy}
            x2={baseX}
            y2={baseY}
            stroke={arrowColor}
            strokeWidth={sqSize * 0.18}
            strokeLinecap="round"
          />
          <Polygon
            points={`${tipX},${tipY} ${baseX + px},${baseY + py} ${baseX - px},${baseY - py}`}
            fill={arrowColor}
          />
        </G>
      );
    }
  }

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {squares}
        {arrowOverlay}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
  },
});

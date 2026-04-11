/**
 * Quad Editor Screen — board localization.
 *
 * Displays the source image with 4 draggable corner handles.
 * User drags corners to align with the chess board, then confirms.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  useWindowDimensions,
  LayoutChangeEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Line, Circle } from 'react-native-svg';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useAppStore } from '../stores/appStore';
import type { Point, BoardQuad } from '../types/chess';

const HANDLE_RADIUS = 14;
const HANDLE_HIT = 30; // hit-test radius

interface HandleState {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

type CornerKey = keyof HandleState;
const CORNER_KEYS: CornerKey[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

function defaultHandles(w: number, h: number): HandleState {
  const mx = w * 0.15;
  const my = h * 0.15;
  return {
    topLeft: { x: mx, y: my },
    topRight: { x: w - mx, y: my },
    bottomRight: { x: w - mx, y: h - my },
    bottomLeft: { x: mx, y: h - my },
  };
}

export default function QuadEditorScreen() {
  const router = useRouter();
  const { width: winWidth } = useWindowDimensions();
  const sourceImageUri = useAppStore((s) => s.sourceImageUri);
  const setBoardQuad = useAppStore((s) => s.setBoardQuad);

  // Image display area dimensions (fit to screen width with some padding)
  const imageAreaWidth = winWidth - 32;
  const [imageAreaHeight, setImageAreaHeight] = useState(imageAreaWidth);
  const [imageNaturalSize, setImageNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);

  const [handles, setHandles] = useState<HandleState>(
    defaultHandles(imageAreaWidth, imageAreaWidth),
  );

  // Use ref for handles so gesture callbacks don't capture stale state
  const handlesRef = useRef(handles);
  handlesRef.current = handles;

  // Track which corner is being dragged
  const activeCorner = useRef<CornerKey | null>(null);
  const startPos = useRef<Point>({ x: 0, y: 0 });

  // Resolve natural image size so we can maintain aspect ratio
  useEffect(() => {
    if (sourceImageUri) {
      Image.getSize(
        sourceImageUri,
        (w, h) => {
          setImageNaturalSize({ w, h });
          const aspect = h / w;
          const displayH = imageAreaWidth * aspect;
          setImageAreaHeight(displayH);
          setHandles(defaultHandles(imageAreaWidth, displayH));
        },
        () => {
          // fallback: square
          setImageAreaHeight(imageAreaWidth);
          setHandles(defaultHandles(imageAreaWidth, imageAreaWidth));
        },
      );
    }
  }, [sourceImageUri, imageAreaWidth]);

  const findClosestCorner = useCallback(
    (x: number, y: number): CornerKey | null => {
      let best: CornerKey | null = null;
      let bestDist = HANDLE_HIT;
      const currentHandles = handlesRef.current;
      for (const key of CORNER_KEYS) {
        const h = currentHandles[key];
        const dist = Math.sqrt((h.x - x) ** 2 + (h.y - y) ** 2);
        if (dist < bestDist) {
          best = key;
          bestDist = dist;
        }
      }
      return best;
    },
    [],
  );

  const panGesture = Gesture.Pan()
    .onBegin((e) => {
      const corner = findClosestCorner(e.x, e.y);
      activeCorner.current = corner;
      if (corner) {
        startPos.current = { ...handles[corner] };
      }
    })
    .onUpdate((e) => {
      const corner = activeCorner.current;
      if (!corner) return;
      const newX = Math.max(0, Math.min(imageAreaWidth, startPos.current.x + e.translationX));
      const newY = Math.max(0, Math.min(imageAreaHeight, startPos.current.y + e.translationY));
      setHandles((prev) => ({
        ...prev,
        [corner]: { x: newX, y: newY },
      }));
    })
    .onEnd(() => {
      activeCorner.current = null;
    });

  const handleReset = () => {
    setHandles(defaultHandles(imageAreaWidth, imageAreaHeight));
  };

  const handleConfirm = () => {
    // Convert display coords to normalized coords (0-1) relative to image
    const scaleX = imageNaturalSize ? imageNaturalSize.w / imageAreaWidth : 1;
    const scaleY = imageNaturalSize ? imageNaturalSize.h / imageAreaHeight : 1;

    const quad: BoardQuad = {
      topLeft: {
        x: handles.topLeft.x * scaleX,
        y: handles.topLeft.y * scaleY,
      },
      topRight: {
        x: handles.topRight.x * scaleX,
        y: handles.topRight.y * scaleY,
      },
      bottomRight: {
        x: handles.bottomRight.x * scaleX,
        y: handles.bottomRight.y * scaleY,
      },
      bottomLeft: {
        x: handles.bottomLeft.x * scaleX,
        y: handles.bottomLeft.y * scaleY,
      },
    };

    setBoardQuad(quad);
    router.push('/confirm');
  };

  if (!sourceImageUri) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No image selected. Go back and take or import a photo.</Text>
      </View>
    );
  }

  const cornerOrder: CornerKey[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

  return (
    <GestureHandlerRootView style={styles.container}>
      <Text style={styles.instructions}>
        Drag the corners to align with the board. The next screen uses this image as a reference
        for manual position confirmation.
      </Text>

      {/* Image + overlay area */}
      <GestureDetector gesture={panGesture}>
        <View style={[styles.imageContainer, { width: imageAreaWidth, height: imageAreaHeight }]}>
          <Image
            source={{ uri: sourceImageUri }}
            style={{ width: imageAreaWidth, height: imageAreaHeight }}
            resizeMode="contain"
          />

          {/* SVG overlay for lines and handles */}
          <Svg
            style={StyleSheet.absoluteFill}
            width={imageAreaWidth}
            height={imageAreaHeight}
          >
            {/* Connect corners with lines */}
            {cornerOrder.map((key, i) => {
              const next = cornerOrder[(i + 1) % 4];
              return (
                <Line
                  key={`${key}-${next}`}
                  x1={handles[key].x}
                  y1={handles[key].y}
                  x2={handles[next].x}
                  y2={handles[next].y}
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  strokeDasharray="8,4"
                />
              );
            })}

            {/* Corner handles */}
            {CORNER_KEYS.map((key) => (
              <Circle
                key={key}
                cx={handles[key].x}
                cy={handles[key].y}
                r={HANDLE_RADIUS}
                fill="#22c55e"
                fillOpacity={0.6}
                stroke="#ffffff"
                strokeWidth={2}
              />
            ))}
          </Svg>
        </View>
      </GestureDetector>

      {/* Preview section (placeholder for future warp) */}
      <View style={styles.previewContainer}>
        <Text style={styles.previewTitle}>Corner Positions</Text>
        <View style={styles.previewGrid}>
          {CORNER_KEYS.map((key) => (
            <Text key={key} style={styles.previewCoord}>
              {key}: ({Math.round(handles[key].x)}, {Math.round(handles[key].y)})
            </Text>
          ))}
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.buttonRow}>
        <Pressable style={styles.resetButton} onPress={handleReset}>
          <Text style={styles.resetButtonText}>Reset</Text>
        </Pressable>
        <Pressable style={styles.confirmButton} onPress={handleConfirm}>
          <Text style={styles.confirmButtonText}>Confirm</Text>
        </Pressable>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
    alignItems: 'center',
    paddingTop: 12,
  },
  instructions: {
    color: '#8892b0',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  imageContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  previewContainer: {
    marginTop: 16,
    paddingHorizontal: 16,
    width: '100%',
  },
  previewTitle: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  previewCoord: {
    color: '#8892b0',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    width: '48%',
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    width: '100%',
    marginTop: 'auto',
    paddingBottom: 32,
  },
  resetButton: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#0f3460',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 2,
    backgroundColor: '#0f3460',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 16,
    textAlign: 'center',
    padding: 32,
  },
});

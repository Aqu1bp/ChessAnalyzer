/**
 * EvalBar — vertical evaluation bar showing win percentage.
 *
 * White portion fills from the bottom based on win percentage (0-100).
 * Animated with react-native-reanimated for smooth transitions.
 */

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { EngineScore, WDL } from '../../types/analysis';
import { wdlToWinPercent, cpToWinPercent, formatScore } from '../../utils/evalUtils';

interface EvalBarProps {
  score: EngineScore | null;
  wdl: WDL | null;
  height?: number;
  width?: number;
}

export default function EvalBar({
  score,
  wdl,
  height = 320,
  width = 28,
}: EvalBarProps) {
  const fillPercent = useSharedValue(50);

  useEffect(() => {
    let pct = 50;

    if (score) {
      if (score.type === 'mate') {
        pct = score.value > 0 ? 100 : score.value < 0 ? 0 : 50;
      } else if (wdl) {
        pct = wdlToWinPercent(wdl);
      } else {
        pct = cpToWinPercent(score.value);
      }
    }

    // Clamp
    pct = Math.max(0, Math.min(100, pct));
    fillPercent.value = withTiming(pct, {
      duration: 400,
      easing: Easing.out(Easing.cubic),
    });
  }, [score, wdl, fillPercent]);

  // Compute bar height minus label area (~24px for label container)
  const barHeight = height - 28;
  const whiteFillStyle = useAnimatedStyle(() => ({
    height: (fillPercent.value / 100) * barHeight,
  }));

  const scoreLabel = score ? formatScore(score) : '0.00';
  const isWhiteFavored = !score || (score.type === 'cp' ? score.value >= 0 : score.value >= 0);

  return (
    <View style={[styles.container, { height, width }]}>
      {/* Score label */}
      <View
        style={[
          styles.labelContainer,
          { backgroundColor: isWhiteFavored ? '#ffffff' : '#1a1a1a' },
        ]}
      >
        <Animated.Text
          style={[
            styles.label,
            { color: isWhiteFavored ? '#1a1a1a' : '#ffffff' },
          ]}
          numberOfLines={1}
        >
          {scoreLabel}
        </Animated.Text>
      </View>

      {/* Bar */}
      <View style={styles.barOuter}>
        {/* Black (top, the "remaining" area) */}
        <View style={styles.blackFill} />
        {/* White fills from bottom */}
        <Animated.View style={[styles.whiteFill, whiteFillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  labelContainer: {
    paddingHorizontal: 3,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
    minWidth: 28,
    alignItems: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  barOuter: {
    flex: 1,
    width: '100%',
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a', // black portion
    position: 'relative',
  },
  blackFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a1a',
  },
  whiteFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#f5f5f5',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
});

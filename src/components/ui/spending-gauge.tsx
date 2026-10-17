import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const STROKE_WIDTH = 14;

export type SpendingGaugeProps = {
  actual: number;
  target: number;
  formattedActual?: string;
  formattedTarget?: string;
  size?: number;
  thresholds?: { warning: number; over: number };
  onPressDetails?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

export function SpendingGauge({
  actual,
  target,
  formattedActual,
  formattedTarget,
  size = 160,
  thresholds = { warning: 0.8, over: 1 },
  onPressDetails,
  accessibilityLabel,
  testID,
}: SpendingGaugeProps) {
  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  // Guard target === 0: this is a brand-new user's very first Dashboard render, before a
  // budget is set. actual / 0 is Infinity (or NaN), which would render a blank or inexplicably
  // full arc — show an explicit empty state instead (06-custom-components.md).
  const ratio = target > 0 ? actual / target : null;
  const clampedRatio = ratio === null ? 0 : Math.min(Math.max(ratio, 0), 1);
  const isOver = ratio !== null && ratio > thresholds.over;
  const isWarning = ratio !== null && ratio > thresholds.warning && !isOver;
  const color = isOver ? '#D33' : isWarning ? '#E0A500' : '#3C87F7';
  const overPercent = ratio !== null && ratio > 1 ? Math.round((ratio - 1) * 100) : null;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      progress.value = reduceMotion ? clampedRatio : withTiming(clampedRatio, { duration: 600 });
    });
  }, [clampedRatio, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const actualLabel = formattedActual ?? String(actual);
  const targetLabel = formattedTarget ?? String(target);

  // Status is conveyed by arc color alone, which a colour-blind user can't perceive — the
  // "over" percentage and a worded label carry the same information non-visually.
  const label =
    accessibilityLabel ??
    (target === 0
      ? `No target set, spent ${actualLabel}`
      : `Spent ${actualLabel} of ${targetLabel} target${overPercent !== null ? `, ${overPercent}% over` : ''}`);

  return (
    <Pressable
      onPress={onPressDetails}
      disabled={!onPressDetails}
      hitSlop={onPressDetails ? 8 : undefined}
      accessibilityRole={onPressDetails ? 'button' : 'progressbar'}
      accessibilityValue={target > 0 ? { min: 0, max: target, now: actual } : undefined}
      accessibilityLabel={label}
      testID={testID}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#E0E1E6" strokeWidth={STROKE_WIDTH} fill="none" />
        {target > 0 && (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={STROKE_WIDTH}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeLinecap="round"
            rotation={-90}
            originX={size / 2}
            originY={size / 2}
            animatedProps={animatedProps}
          />
        )}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.centerText]} pointerEvents="none">
        {target === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No target set
          </ThemedText>
        ) : (
          <>
            <ThemedText type="smallBold">{actualLabel}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              of {targetLabel}
            </ThemedText>
            {overPercent !== null && (
              <ThemedText type="small" style={{ color }}>
                +{overPercent}% over
              </ThemedText>
            )}
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centerText: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

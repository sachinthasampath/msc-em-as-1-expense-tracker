/* eslint-disable react-hooks/immutability, react-hooks/exhaustive-deps --
   Reanimated shared values (.value) are intentionally mutable containers, not render state —
   this entire file's gesture/animation code mutates them outside React's render cycle by
   design, which the React-Compiler-era hook rules can't distinguish from mutating props/state. */
import { memo, useEffect } from 'react';
import { Alert, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Card } from '@/types/domain';

export type SwipeableCardItemProps = {
  card: Pick<Card, 'id' | 'nickname' | 'last4' | 'cardType'>;
  isOpen: boolean;
  onRequestOpen: (id: string) => void;
  onRequestClose: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  swipeThreshold?: number;
  disabled?: boolean;
  testID?: string;
};

function SwipeableCardItemComponent({
  card,
  isOpen,
  onRequestOpen,
  onRequestClose,
  onEdit,
  onDelete,
  swipeThreshold = 80,
  disabled = false,
  testID,
}: SwipeableCardItemProps) {
  const theme = useTheme();
  const translateX = useSharedValue(0);
  const actionsWidth = useSharedValue(160);

  useEffect(() => {
    translateX.value = withSpring(isOpen ? -actionsWidth.value : 0);
  }, [isOpen]);

  // The stated use case ("while a sync is in flight for this row") can become true mid-gesture —
  // snap back to resting rather than leaving the row stranded half-open.
  useEffect(() => {
    if (disabled) translateX.value = withSpring(0);
  }, [disabled]);

  function handleActionsLayout(event: LayoutChangeEvent) {
    actionsWidth.value = event.nativeEvent.layout.width;
  }

  function confirmDelete() {
    Alert.alert('Delete card?', `Remove ${card.nickname}? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(card.id) },
    ]);
  }

  const pan = Gesture.Pan()
    .enabled(!disabled)
    // Constrains the pan to mostly-horizontal gestures so this doesn't steal vertical scroll
    // from the surrounding list — the single most common bug in hand-built swipeable rows.
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      const restingX = isOpen ? -actionsWidth.value : 0;
      translateX.value = Math.min(0, Math.max(-actionsWidth.value, restingX + event.translationX));
    })
    .onEnd((event) => {
      const crossedThreshold = isOpen
        ? event.translationX < swipeThreshold
        : event.translationX < -swipeThreshold;

      if (crossedThreshold) {
        translateX.value = withSpring(-actionsWidth.value);
        runOnJS(onRequestOpen)(card.id);
      } else {
        translateX.value = withSpring(0);
        runOnJS(onRequestClose)(card.id);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.actions} onLayout={handleActionsLayout}>
        <Pressable
          onPress={() => onEdit(card.id)}
          style={[styles.action, { backgroundColor: theme.primary }]}
          accessibilityLabel={`Edit ${card.nickname}`}
        >
          <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
            Edit
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={confirmDelete}
          style={[styles.action, { backgroundColor: theme.danger }]}
          accessibilityLabel={`Delete ${card.nickname}`}
        >
          <ThemedText type="smallBold" style={styles.deleteLabel}>
            Delete
          </ThemedText>
        </Pressable>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>
          <Pressable
            onPress={() => isOpen && onRequestClose(card.id)}
            accessibilityActions={[{ name: 'edit' }, { name: 'delete' }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'edit') onEdit(card.id);
              if (event.nativeEvent.actionName === 'delete') confirmDelete();
            }}
          >
            <ThemedView type="card" style={[styles.row, { borderColor: theme.border }]}>
              <ThemedView type="card" style={styles.rowText}>
                <ThemedText type="smallBold">{card.nickname}</ThemedText>
                {card.last4 ? (
                  <ThemedText themeColor="textSecondary">•••• {card.last4}</ThemedText>
                ) : null}
              </ThemedView>
              <ThemedView style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="caption">{card.cardType}</ThemedText>
              </ThemedView>
            </ThemedView>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export const SwipeableCardItem = memo(SwipeableCardItemComponent);

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: Radius.card,
  },
  actions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  action: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteLabel: {
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1,
    gap: Spacing.two,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  chip: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
});

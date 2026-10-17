import { ActivityIndicator, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PrimaryButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  loading?: boolean;
  loadingLabel?: string;
  variant?: 'primary' | 'danger';
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  label,
  loading = false,
  loadingLabel,
  disabled,
  variant = 'primary',
  style,
  ...rest
}: PrimaryButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const background = variant === 'danger' ? theme.danger : theme.primary;
  const textColor = variant === 'danger' ? '#FFFFFF' : theme.onPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={[styles.button, { backgroundColor: background, opacity: isDisabled ? 0.55 : 1 }, style]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={textColor} /> : null}
      <ThemedText type="smallBold" style={{ color: textColor }}>
        {loading ? (loadingLabel ?? label) : label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
});

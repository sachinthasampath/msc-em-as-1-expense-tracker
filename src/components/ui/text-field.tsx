import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({ label, error, style, containerStyle, ...rest }: TextFieldProps) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.card,
            borderColor: error ? theme.danger : theme.border,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <ThemedText type="caption" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
});

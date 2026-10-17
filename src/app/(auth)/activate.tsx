import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { resendActivationCode, verifyActivationCode } from '@/features/auth/activation';
import { useTheme } from '@/hooks/use-theme';

export default function ActivateScreen() {
  const theme = useTheme();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleVerify() {
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const { error: verifyError } = await verifyActivationCode(email, code);

      if (verifyError) {
        setError(verifyError.message);
        return;
      }

      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify code.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    const { error: resendError } = await resendActivationCode(email);
    if (resendError) {
      setError(resendError.message);
    } else {
      setInfo('A new code has been sent.');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Activate account</ThemedText>
      <ThemedText themeColor="textSecondary">Enter the 8-digit code sent to {email}</ThemedText>

      <TextInput
        placeholder="12345678"
        placeholderTextColor={theme.textSecondary}
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={8}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
      {info && <ThemedText themeColor="textSecondary">{info}</ThemedText>}

      <Pressable
        onPress={handleVerify}
        disabled={submitting}
        style={[styles.button, { backgroundColor: theme.backgroundSelected }]}
      >
        <ThemedText type="smallBold">{submitting ? 'Verifying…' : 'Verify'}</ThemedText>
      </Pressable>

      <Pressable onPress={handleResend}>
        <ThemedText type="link" themeColor="textSecondary">
          Resend code
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  error: {
    color: '#D33',
  },
});

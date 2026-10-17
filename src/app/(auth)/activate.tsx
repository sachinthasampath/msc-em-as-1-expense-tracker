import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextField } from '@/components/ui/text-field';
import { Layout, Radius, Spacing } from '@/constants/theme';
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
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ThemedView style={styles.container}>
        <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText type="title">Activate account</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            Enter the 8-digit code sent to {email}
          </ThemedText>

          <TextField
            label="Code"
            placeholder="12345678"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={8}
            style={styles.codeInput}
          />

          {error ? (
            <ThemedText type="caption" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}
          {info ? (
            <ThemedText type="caption" themeColor="success">
              {info}
            </ThemedText>
          ) : null}

          <PrimaryButton
            label="Verify"
            loading={submitting}
            loadingLabel="Verifying…"
            onPress={handleVerify}
          />

          <Pressable onPress={handleResend}>
            <ThemedText type="linkPrimary">Resend code</ThemedText>
          </Pressable>
        </ThemedView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPadding,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Layout.sectionGap,
  },
  codeInput: {
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
  },
});

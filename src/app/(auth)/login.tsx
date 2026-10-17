import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextField } from '@/components/ui/text-field';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { isEmailNotConfirmedError, signIn } from '@/features/auth/activation';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        if (isEmailNotConfirmedError(signInError.message)) {
          router.push({ pathname: '/(auth)/activate', params: { email } });
          return;
        }
        setError(signInError.message);
        return;
      }

      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ThemedView style={styles.container}>
        <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText type="title">Log in</ThemedText>

          <TextField
            label="Email"
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextField
            label="Password"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />

          {error ? (
            <ThemedText type="caption" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}

          <PrimaryButton
            label="Log in"
            loading={submitting}
            loadingLabel="Logging in…"
            onPress={handleLogin}
          />

          <Link href="/(auth)/register">
            <ThemedText type="linkPrimary">Need an account? Register</ThemedText>
          </Link>
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
});

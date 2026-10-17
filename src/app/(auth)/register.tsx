import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextField } from '@/components/ui/text-field';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { signUp } from '@/features/auth/activation';
import { useTheme } from '@/hooks/use-theme';

export default function RegisterScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRegister() {
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const { error: signUpError } = await signUp(email, password);

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      router.push({ pathname: '/(auth)/activate', params: { email } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ThemedView style={styles.container}>
        <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText type="title">Register</ThemedText>

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
          />
          <TextField
            label="Confirm password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          {error ? (
            <ThemedText type="caption" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}

          <PrimaryButton
            label="Create account"
            loading={submitting}
            loadingLabel="Creating account…"
            onPress={handleRegister}
          />

          <Link href="/(auth)/login">
            <ThemedText type="linkPrimary">Already have an account? Log in</ThemedText>
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

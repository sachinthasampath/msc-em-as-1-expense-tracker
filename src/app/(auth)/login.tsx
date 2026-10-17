import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
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
    <ThemedView style={styles.container}>
      <ThemedText type="title">Log in</ThemedText>

      <TextInput
        placeholder="Email"
        placeholderTextColor={theme.textSecondary}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
      <TextInput
        placeholder="Password"
        placeholderTextColor={theme.textSecondary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      <Pressable
        onPress={handleLogin}
        disabled={submitting}
        style={[styles.button, { backgroundColor: theme.backgroundSelected }]}
      >
        <ThemedText type="smallBold">{submitting ? 'Logging in…' : 'Log in'}</ThemedText>
      </Pressable>

      <Link href="/(auth)/register">
        <ThemedText type="link" themeColor="textSecondary">
          Need an account? Register
        </ThemedText>
      </Link>
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
    fontSize: 16,
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

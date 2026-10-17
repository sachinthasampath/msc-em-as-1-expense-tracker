import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
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
    const { error: signUpError } = await signUp(email, password);
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    router.push({ pathname: '/(auth)/activate', params: { email } });
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Register</ThemedText>

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
      <TextInput
        placeholder="Confirm password"
        placeholderTextColor={theme.textSecondary}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />

      {error && (
        <ThemedText themeColor="text" style={styles.error}>
          {error}
        </ThemedText>
      )}

      <Pressable
        onPress={handleRegister}
        disabled={submitting}
        style={[styles.button, { backgroundColor: theme.backgroundSelected }]}
      >
        <ThemedText type="smallBold">{submitting ? 'Creating account…' : 'Create account'}</ThemedText>
      </Pressable>

      <Link href="/(auth)/login">
        <ThemedText type="link" themeColor="textSecondary">
          Already have an account? Log in
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

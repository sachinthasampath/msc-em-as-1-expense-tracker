import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';

import { SpendingGauge } from '@/components/ui/spending-gauge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/data/remote/supabase-client';
import { useAuth } from '@/features/auth/use-auth';
import { useBudget } from '@/features/dashboard/use-budget';
import { usePayments } from '@/features/payments/use-payments';
import { useTheme } from '@/hooks/use-theme';

function formatLkr(amountMinor: number) {
  return `LKR ${(amountMinor / 100).toFixed(2)}`;
}

export default function DashboardScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { payments, loading } = usePayments(userId);
  const { budgetMinor, setBudgetMinor } = useBudget(userId);
  const [budgetInput, setBudgetInput] = useState('');

  const now = new Date();
  const thisMonthTotal = payments
    .filter((p) => {
      const d = new Date(p.occurredAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, p) => sum + p.amountMinor, 0);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Dashboard</ThemedText>

      <ThemedView style={styles.gaugeRow}>
        <SpendingGauge
          actual={thisMonthTotal}
          target={budgetMinor}
          formattedActual={formatLkr(thisMonthTotal)}
          formattedTarget={formatLkr(budgetMinor)}
        />
        <ThemedView style={styles.budgetForm}>
          <ThemedText themeColor="textSecondary">Monthly budget</ThemedText>
          <TextInput
            placeholder="Set budget (LKR)"
            placeholderTextColor={theme.textSecondary}
            value={budgetInput}
            onChangeText={setBudgetInput}
            keyboardType="decimal-pad"
            style={[styles.budgetInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            onSubmitEditing={() => {
              const value = Number(budgetInput);
              if (value > 0) setBudgetMinor(Math.round(value * 100));
              setBudgetInput('');
            }}
          />
        </ThemedView>
      </ThemedView>

      <ThemedText type="smallBold">Recent payments</ThemedText>

      {loading ? (
        <ThemedText themeColor="textSecondary">Loading…</ThemedText>
      ) : (
        <FlatList
          data={payments.slice(0, 20)}
          keyExtractor={(p) => p.id}
          ListEmptyComponent={<ThemedText themeColor="textSecondary">No payments yet.</ThemedText>}
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={styles.paymentRow}>
              <ThemedText>{new Date(item.occurredAt).toLocaleDateString()}</ThemedText>
              <ThemedText type="smallBold">{formatLkr(item.amountMinor)}</ThemedText>
            </ThemedView>
          )}
          contentContainerStyle={{ gap: Spacing.two }}
        />
      )}

      <Pressable
        onPress={() => supabase.auth.signOut()}
        style={[styles.button, { backgroundColor: theme.backgroundSelected }]}
      >
        <ThemedText type="smallBold">Log out</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    gap: Spacing.three,
  },
  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  budgetForm: {
    flex: 1,
    gap: Spacing.two,
  },
  budgetInput: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.four,
  },
});

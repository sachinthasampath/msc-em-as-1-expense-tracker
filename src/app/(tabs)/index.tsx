import { useEffect, useState } from 'react';
import { FlatList, Keyboard, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SpendingGauge } from '@/components/ui/spending-gauge';
import { TextField } from '@/components/ui/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Layout, Radius, Spacing } from '@/constants/theme';
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

  useEffect(() => {
    if (budgetMinor > 0) setBudgetInput(String(budgetMinor / 100));
  }, [budgetMinor]);

  function commitBudget() {
    const value = Number(budgetInput.replace(/,/g, '').trim());
    if (!Number.isFinite(value) || value <= 0) return;
    setBudgetMinor(Math.round(value * 100));
  }

  const now = new Date();
  const thisMonthTotal = payments
    .filter((p) => {
      const d = new Date(p.occurredAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, p) => sum + p.amountMinor, 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Pressable style={styles.container} onPress={Keyboard.dismiss}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Dashboard</ThemedText>
        </ThemedView>

        <ThemedView type="card" style={[styles.gaugeCard, { borderColor: theme.border }]}>
          <SpendingGauge
            actual={thisMonthTotal}
            target={budgetMinor}
            formattedActual={formatLkr(thisMonthTotal)}
            formattedTarget={formatLkr(budgetMinor)}
          />
          <ThemedView type="card" style={styles.budgetForm}>
            <ThemedText type="subtitle">Monthly budget</ThemedText>
            <TextField
              placeholder="Set budget (LKR)"
              value={budgetInput}
              onChangeText={setBudgetInput}
              keyboardType="decimal-pad"
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={commitBudget}
              onEndEditing={commitBudget}
            />
          </ThemedView>
        </ThemedView>

        <ThemedText type="subtitle">Recent payments</ThemedText>

        {loading ? (
          <ThemedText themeColor="textSecondary">Loading…</ThemedText>
        ) : (
          <FlatList
            data={payments.slice(0, 20)}
            keyExtractor={(p) => p.id}
            style={styles.list}
            ListEmptyComponent={<ThemedText themeColor="textSecondary">No payments yet.</ThemedText>}
            renderItem={({ item }) => (
              <ThemedView type="card" style={[styles.paymentRow, { borderColor: theme.border }]}>
                <ThemedText>{new Date(item.occurredAt).toLocaleDateString()}</ThemedText>
                <ThemedText type="smallBold">{formatLkr(item.amountMinor)}</ThemedText>
              </ThemedView>
            )}
            contentContainerStyle={{ gap: Spacing.two }}
          />
        )}

        <Pressable onPress={() => supabase.auth.signOut()} style={styles.logout}>
          <ThemedText type="smallBold" themeColor="danger">
            Log out
          </ThemedText>
        </Pressable>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing.three,
    gap: Layout.sectionGap,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gaugeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Spacing.three,
  },
  budgetForm: {
    flex: 1,
    gap: Spacing.two,
  },
  list: { flex: 1 },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Spacing.three,
  },
  logout: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
});

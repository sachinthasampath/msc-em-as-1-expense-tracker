import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui/primary-button';
import { TextField } from '@/components/ui/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { uploadReceipt } from '@/data/remote/receipts-api';
import { useAuth } from '@/features/auth/use-auth';
import { useCards } from '@/features/cards/use-cards';
import { useCategories } from '@/features/categories/use-categories';
import { consumePendingReceiptUri } from '@/features/payments/pending-receipt';
import { usePaymentMethods } from '@/features/payments/use-payment-methods';
import { usePayments } from '@/features/payments/use-payments';
import { useTheme } from '@/hooks/use-theme';
import { useIsOnline } from '@/services/connectivity';
import { Payment } from '@/types/domain';

export default function AddPaymentScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const isOnline = useIsOnline();

  const { categories } = useCategories(userId);
  const { cards } = useCards(userId);
  const { methods } = usePaymentMethods(userId);
  const { addPayment, attachReceipt } = usePayments(userId);

  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const uri = consumePendingReceiptUri();
      if (uri) setReceiptUri(uri);
    }, []),
  );

  async function handleSave() {
    if (!userId) {
      setError('You need to be signed in to save a payment.');
      return;
    }
    const amountValue = Number(amount);
    if (!amountValue || amountValue <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }

    setError(null);
    setSaving(true);
    const pendingReceiptUri = receiptUri;
    let payment: Payment | null = null;
    try {
      const method = methods.find((m) => m.id === methodId) ?? null;
      const card = method?.cardId ? (cards.find((c) => c.id === method.cardId) ?? null) : null;

      // Persist locally first so a slow/hung receipt upload cannot block creation or leave the
      // button stuck on "Saving…". Receipts aren't outbox-queued — attach is best-effort/online-only.
      payment = await addPayment({
        userId,
        amountMinor: Math.round(amountValue * 100),
        occurredAt: new Date().toISOString(),
        categoryId,
        paymentMethod: method,
        card,
        notes: notes.trim() || null,
        photoPath: null,
      });

      setAmount('');
      setNotes('');
      setReceiptUri(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save payment.');
    } finally {
      setSaving(false);
    }

    if (payment && pendingReceiptUri && isOnline) {
      try {
        const photoPath = await uploadReceipt(userId, pendingReceiptUri);
        await attachReceipt(payment, photoPath);
      } catch {
        // Payment already saved; receipt attach is best-effort.
      }
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title">Add Payment</ThemedText>

        <TextField
          label="Amount"
          placeholder="Amount (LKR)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />

        <ThemedText type="subtitle">Category</ThemedText>
        <ThemedView style={styles.chipRow}>
          {categories.map((category) => {
            const selected = categoryId === category.id;
            return (
              <Pressable
                key={category.id}
                onPress={() => setCategoryId(category.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.primary : theme.card,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
              >
                <ThemedText style={{ color: selected ? theme.onPrimary : theme.text }}>{category.name}</ThemedText>
              </Pressable>
            );
          })}
        </ThemedView>

        <ThemedText type="subtitle">Payment method</ThemedText>
        <ThemedView style={styles.chipRow}>
          {methods.map((method) => {
            const selected = methodId === method.id;
            return (
              <Pressable
                key={method.id}
                onPress={() => setMethodId(method.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.primary : theme.card,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
              >
                <ThemedText style={{ color: selected ? theme.onPrimary : theme.text }}>
                  {method.label ?? method.methodType}
                </ThemedText>
              </Pressable>
            );
          })}
        </ThemedView>

        <TextField
          label="Notes"
          placeholder="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
        />

        <ThemedText type="subtitle">Receipt</ThemedText>
        {receiptUri ? (
          <ThemedView style={styles.receiptPreview}>
            <Image source={{ uri: receiptUri }} style={[styles.receiptThumbnail, { borderColor: theme.border }]} />
            <Pressable onPress={() => setReceiptUri(null)}>
              <ThemedText type="linkPrimary">Remove</ThemedText>
            </Pressable>
          </ThemedView>
        ) : (
          <Pressable
            onPress={() => router.push('/receipt-capture')}
            style={[styles.chip, { backgroundColor: theme.card, borderColor: theme.border, alignSelf: 'flex-start' }]}
          >
            <ThemedText>Add receipt photo</ThemedText>
          </Pressable>
        )}

        {error ? (
          <ThemedText type="caption" themeColor="danger">
            {error}
          </ThemedText>
        ) : null}

        <PrimaryButton
          label={saved ? 'Saved' : 'Save payment'}
          loading={saving}
          loadingLabel="Saving…"
          onPress={handleSave}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing.five,
    gap: Layout.sectionGap,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  receiptPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  receiptThumbnail: {
    width: 64,
    height: 64,
    borderRadius: Radius.input,
    borderWidth: 1,
  },
});

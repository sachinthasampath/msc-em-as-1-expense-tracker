import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { uploadReceipt } from '@/data/remote/receipts-api';
import { useAuth } from '@/features/auth/use-auth';
import { useCards } from '@/features/cards/use-cards';
import { useCategories } from '@/features/categories/use-categories';
import { consumePendingReceiptUri } from '@/features/payments/pending-receipt';
import { usePaymentMethods } from '@/features/payments/use-payment-methods';
import { usePayments } from '@/features/payments/use-payments';
import { useTheme } from '@/hooks/use-theme';
import { useIsOnline } from '@/services/connectivity';

export default function AddPaymentScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const isOnline = useIsOnline();

  const { categories } = useCategories(userId);
  const { cards } = useCards(userId);
  const { methods } = usePaymentMethods(userId);
  const { addPayment } = usePayments(userId);

  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const uri = consumePendingReceiptUri();
      if (uri) setReceiptUri(uri);
    }, []),
  );

  async function handleSave() {
    if (!userId) return;
    const amountValue = Number(amount);
    if (!amountValue || amountValue <= 0) return;

    setSaving(true);
    const method = methods.find((m) => m.id === methodId) ?? null;
    const card = method?.cardId ? (cards.find((c) => c.id === method.cardId) ?? null) : null;

    // Receipts aren't outbox-queued (04-offline-sync.md's outbox only covers cards/payment_
    // methods/payments) — attaching one requires connectivity now; offline, the payment still
    // saves, just without a photo.
    let photoPath: string | null = null;
    if (receiptUri && isOnline) {
      try {
        photoPath = await uploadReceipt(userId, receiptUri);
      } catch {
        photoPath = null;
      }
    }

    await addPayment({
      userId,
      amountMinor: Math.round(amountValue * 100),
      occurredAt: new Date().toISOString(),
      categoryId,
      paymentMethod: method,
      card,
      notes: notes.trim() || null,
      photoPath,
    });

    setAmount('');
    setNotes('');
    setReceiptUri(null);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Add Payment</ThemedText>

      <TextInput
        placeholder="Amount (LKR)"
        placeholderTextColor={theme.textSecondary}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />

      <ThemedText type="smallBold">Category</ThemedText>
      <ThemedView style={styles.chipRow}>
        {categories.map((category) => (
          <Pressable
            key={category.id}
            onPress={() => setCategoryId(category.id)}
            style={[
              styles.chip,
              { backgroundColor: categoryId === category.id ? theme.backgroundSelected : theme.backgroundElement },
            ]}
          >
            <ThemedText>{category.name}</ThemedText>
          </Pressable>
        ))}
      </ThemedView>

      <ThemedText type="smallBold">Payment method</ThemedText>
      <ThemedView style={styles.chipRow}>
        {methods.map((method) => (
          <Pressable
            key={method.id}
            onPress={() => setMethodId(method.id)}
            style={[
              styles.chip,
              { backgroundColor: methodId === method.id ? theme.backgroundSelected : theme.backgroundElement },
            ]}
          >
            <ThemedText>{method.label ?? method.methodType}</ThemedText>
          </Pressable>
        ))}
      </ThemedView>

      <TextInput
        placeholder="Notes (optional)"
        placeholderTextColor={theme.textSecondary}
        value={notes}
        onChangeText={setNotes}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />

      <ThemedText type="smallBold">Receipt</ThemedText>
      {receiptUri ? (
        <ThemedView style={styles.receiptPreview}>
          <Image source={{ uri: receiptUri }} style={styles.receiptThumbnail} />
          <Pressable onPress={() => setReceiptUri(null)}>
            <ThemedText themeColor="textSecondary">Remove</ThemedText>
          </Pressable>
        </ThemedView>
      ) : (
        <Pressable
          onPress={() => router.push('/receipt-capture')}
          style={[styles.chip, { backgroundColor: theme.backgroundElement, alignSelf: 'flex-start' }]}
        >
          <ThemedText>Add receipt photo</ThemedText>
        </Pressable>
      )}

      <Pressable
        onPress={handleSave}
        disabled={saving}
        style={[styles.button, { backgroundColor: theme.backgroundSelected }]}
      >
        <ThemedText type="smallBold">{saving ? 'Saving…' : saved ? 'Saved' : 'Save payment'}</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Spacing.two,
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
    borderRadius: Spacing.two,
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});

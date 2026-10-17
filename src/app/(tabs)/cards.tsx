import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SwipeableCardItem } from '@/components/ui/swipeable-card-item';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextField } from '@/components/ui/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { useCards } from '@/features/cards/use-cards';
import { useTheme } from '@/hooks/use-theme';
import { Card } from '@/types/domain';

export default function CardsScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { cards, loading, addCard, removeCard } = useCards(userId);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const handleRequestOpen = useCallback((id: string) => setOpenCardId(id), []);
  const handleRequestClose = useCallback((id: string) => {
    setOpenCardId((current) => (current === id ? null : current));
  }, []);
  const handleEdit = useCallback(() => {
    Alert.alert('Edit card', 'Card editing is coming in a later build step.');
  }, []);
  const handleDelete = useCallback(
    (id: string) => {
      setOpenCardId((current) => (current === id ? null : current));
      removeCard(id);
    },
    [removeCard],
  );

  const [showForm, setShowForm] = useState(false);
  const [nickname, setNickname] = useState('');
  const [cardType, setCardType] = useState<Card['cardType']>('debit');
  const [last4, setLast4] = useState('');
  const [statementDay, setStatementDay] = useState('');
  const [paymentDueDay, setPaymentDueDay] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!userId) {
      setError('You need to be signed in to save a card.');
      return;
    }
    if (!nickname.trim()) {
      setError('Enter a nickname for the card.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await addCard({
        userId,
        nickname: nickname.trim(),
        cardType,
        last4: last4 || null,
        statementDay: cardType === 'credit' ? Number(statementDay) || null : null,
        paymentDueDay: cardType === 'credit' ? Number(paymentDueDay) || null : null,
        reminderLeadDays: 3,
      });

      setNickname('');
      setLast4('');
      setStatementDay('');
      setPaymentDueDay('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save card.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">Cards</ThemedText>

        {loading ? (
          <ThemedText themeColor="textSecondary">Loading…</ThemedText>
        ) : (
          <FlatList
            data={cards}
            keyExtractor={(card) => card.id}
            style={styles.list}
            ListEmptyComponent={<ThemedText themeColor="textSecondary">No cards yet.</ThemedText>}
            renderItem={({ item }) => (
              <SwipeableCardItem
                card={item}
                isOpen={openCardId === item.id}
                onRequestOpen={handleRequestOpen}
                onRequestClose={handleRequestClose}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )}
            contentContainerStyle={{ gap: Spacing.two }}
          />
        )}

        {showForm ? (
          <ThemedView type="card" style={[styles.form, { borderColor: theme.border }]}>
            <TextField label="Nickname" placeholder="Nickname" value={nickname} onChangeText={setNickname} />
            <ThemedView type="card" style={styles.typeRow}>
              {(['debit', 'credit'] as const).map((type) => {
                const selected = cardType === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => setCardType(type)}
                    style={[
                      styles.typeOption,
                      {
                        backgroundColor: selected ? theme.primary : theme.backgroundElement,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <ThemedText style={{ color: selected ? theme.onPrimary : theme.text }}>{type}</ThemedText>
                  </Pressable>
                );
              })}
            </ThemedView>
            <TextField
              label="Last 4 digits"
              placeholder="Last 4 digits (optional)"
              value={last4}
              onChangeText={setLast4}
              keyboardType="number-pad"
              maxLength={4}
            />
            {cardType === 'credit' && (
              <>
                <TextField
                  label="Statement day"
                  placeholder="Statement day (1-28)"
                  value={statementDay}
                  onChangeText={setStatementDay}
                  keyboardType="number-pad"
                />
                <TextField
                  label="Payment due day"
                  placeholder="Payment due day (1-28)"
                  value={paymentDueDay}
                  onChangeText={setPaymentDueDay}
                  keyboardType="number-pad"
                />
              </>
            )}
            {error ? (
              <ThemedText type="caption" themeColor="danger">
                {error}
              </ThemedText>
            ) : null}
            <PrimaryButton label="Save card" loading={saving} loadingLabel="Saving…" onPress={handleAdd} />
          </ThemedView>
        ) : (
          <PrimaryButton label="Add card" onPress={() => setShowForm(true)} />
        )}
      </ThemedView>
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
  list: { flex: 1 },
  form: {
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Spacing.three,
  },
  typeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  typeOption: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});

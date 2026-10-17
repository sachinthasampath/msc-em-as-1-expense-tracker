import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';

import { SwipeableCardItem } from '@/components/ui/swipeable-card-item';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
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

  async function handleAdd() {
    if (!userId || !nickname.trim()) return;

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
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Cards</ThemedText>

      {loading ? (
        <ThemedText themeColor="textSecondary">Loading…</ThemedText>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(card) => card.id}
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
        <ThemedView style={styles.form}>
          <TextInput
            placeholder="Nickname"
            placeholderTextColor={theme.textSecondary}
            value={nickname}
            onChangeText={setNickname}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <ThemedView type="background" style={styles.typeRow}>
            {(['debit', 'credit'] as const).map((type) => (
              <Pressable
                key={type}
                onPress={() => setCardType(type)}
                style={[
                  styles.typeOption,
                  { backgroundColor: cardType === type ? theme.backgroundSelected : theme.backgroundElement },
                ]}
              >
                <ThemedText>{type}</ThemedText>
              </Pressable>
            ))}
          </ThemedView>
          <TextInput
            placeholder="Last 4 digits (optional)"
            placeholderTextColor={theme.textSecondary}
            value={last4}
            onChangeText={setLast4}
            keyboardType="number-pad"
            maxLength={4}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          {cardType === 'credit' && (
            <>
              <TextInput
                placeholder="Statement day (1-28)"
                placeholderTextColor={theme.textSecondary}
                value={statementDay}
                onChangeText={setStatementDay}
                keyboardType="number-pad"
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
              <TextInput
                placeholder="Payment due day (1-28)"
                placeholderTextColor={theme.textSecondary}
                value={paymentDueDay}
                onChangeText={setPaymentDueDay}
                keyboardType="number-pad"
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
            </>
          )}
          <Pressable
            onPress={handleAdd}
            style={[styles.button, { backgroundColor: theme.backgroundSelected }]}
          >
            <ThemedText type="smallBold">Save card</ThemedText>
          </Pressable>
        </ThemedView>
      ) : (
        <Pressable
          onPress={() => setShowForm(true)}
          style={[styles.button, { backgroundColor: theme.backgroundSelected }]}
        >
          <ThemedText type="smallBold">Add card</ThemedText>
        </Pressable>
      )}
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
  form: {
    gap: Spacing.two,
  },
  typeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  typeOption: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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
});

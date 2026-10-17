import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { useInfeasibleReminders } from '@/features/notifications/use-infeasible-reminders';
import { useNotificationSettings } from '@/features/notifications/use-notification-settings';
import { notifyCardsChanged } from '@/features/notifications/reminder-events';
import { useTheme } from '@/hooks/use-theme';

const REASON_LABEL: Record<string, string> = {
  'no-slot': "your daily limit leaves no free slot before the due date",
  'due-date-passed': 'the due date has already passed',
};

export default function SettingsScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { settings, setSettings } = useNotificationSettings(userId);
  const infeasible = useInfeasibleReminders();

  const [quietHoursStart, setQuietHoursStart] = useState(settings.quietHoursStart);
  const [quietHoursEnd, setQuietHoursEnd] = useState(settings.quietHoursEnd);
  const [maxPerDay, setMaxPerDay] = useState(String(settings.maxPerDay));

  async function handleSave() {
    await setSettings({
      ...settings,
      quietHoursStart,
      quietHoursEnd,
      maxPerDay: Number(maxPerDay) || settings.maxPerDay,
    });
    notifyCardsChanged(); // take effect immediately, not just on next foreground
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Settings</ThemedText>

      {infeasible.length > 0 && (
        <ThemedView type="backgroundElement" style={styles.banner}>
          <ThemedText type="smallBold">Sync issue — reminders couldn&apos;t be scheduled</ThemedText>
          {infeasible.map((item) => (
            <ThemedText key={item.cardId} themeColor="textSecondary">
              No reminder for {item.cardNickname} — {REASON_LABEL[item.reason] ?? item.reason}.
            </ThemedText>
          ))}
        </ThemedView>
      )}

      <ThemedText type="smallBold">Quiet hours</ThemedText>
      <ThemedView style={styles.row}>
        <TextInput
          placeholder="Start (HH:MM)"
          placeholderTextColor={theme.textSecondary}
          value={quietHoursStart}
          onChangeText={setQuietHoursStart}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <TextInput
          placeholder="End (HH:MM)"
          placeholderTextColor={theme.textSecondary}
          value={quietHoursEnd}
          onChangeText={setQuietHoursEnd}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
      </ThemedView>

      <ThemedText type="smallBold">Max reminders per day</ThemedText>
      <TextInput
        value={maxPerDay}
        onChangeText={setMaxPerDay}
        keyboardType="number-pad"
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />

      <ThemedText themeColor="textSecondary">Timezone: {settings.timeZone}</ThemedText>

      <Pressable onPress={handleSave} style={[styles.button, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="smallBold">Save</ThemedText>
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
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
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
  banner: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
});

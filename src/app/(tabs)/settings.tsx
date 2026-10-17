import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui/primary-button';
import { TextField } from '@/components/ui/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Layout, Radius, Spacing } from '@/constants/theme';
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await setSettings({
        ...settings,
        quietHoursStart,
        quietHoursEnd,
        maxPerDay: Number(maxPerDay) || settings.maxPerDay,
      });
      notifyCardsChanged(); // take effect immediately, not just on next foreground
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title">Settings</ThemedText>

        {infeasible.length > 0 && (
          <ThemedView type="card" style={[styles.group, { borderColor: theme.danger }]}>
            <ThemedText type="subtitle">Sync issue — reminders couldn&apos;t be scheduled</ThemedText>
            {infeasible.map((item) => (
              <ThemedText key={item.cardId} type="caption" themeColor="textSecondary">
                No reminder for {item.cardNickname} — {REASON_LABEL[item.reason] ?? item.reason}.
              </ThemedText>
            ))}
          </ThemedView>
        )}

        <ThemedView type="card" style={[styles.group, { borderColor: theme.border }]}>
          <ThemedText type="subtitle">Quiet hours</ThemedText>
          <ThemedView type="card" style={styles.row}>
            <TextField
              label="Start"
              placeholder="Start (HH:MM)"
              value={quietHoursStart}
              onChangeText={setQuietHoursStart}
              containerStyle={styles.flexInput}
            />
            <TextField
              label="End"
              placeholder="End (HH:MM)"
              value={quietHoursEnd}
              onChangeText={setQuietHoursEnd}
              containerStyle={styles.flexInput}
            />
          </ThemedView>
        </ThemedView>

        <ThemedView type="card" style={[styles.group, { borderColor: theme.border }]}>
          <ThemedText type="subtitle">Max reminders per day</ThemedText>
          <TextField value={maxPerDay} onChangeText={setMaxPerDay} keyboardType="number-pad" />
          <ThemedText type="caption" themeColor="textSecondary">
            Timezone: {settings.timeZone}
          </ThemedText>
        </ThemedView>

        {error ? (
          <ThemedText type="caption" themeColor="danger">
            {error}
          </ThemedText>
        ) : null}

        <PrimaryButton
          label={saved ? 'Saved' : 'Save'}
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
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flexInput: {
    flex: 1,
  },
  group: {
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});

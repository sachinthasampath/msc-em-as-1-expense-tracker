import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export type NotificationSettings = {
  quietHoursStart: string;
  quietHoursEnd: string;
  maxPerDay: number;
  timeZone: string;
};

const DEFAULTS: NotificationSettings = {
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  maxPerDay: 3,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Asia/Colombo',
};

function settingsKey(userId: string) {
  return `notification-settings:${userId}`;
}

// profiles.quiet_hours_start/end/max_notifications_per_day/timezone exist in the Supabase
// schema, but scheduling must work fully offline and is never gated on connectivity
// (05-notification-scheduler.md) — mirrored here as a local, per-device preference rather than
// round-tripping through Supabase on every scheduler run.
export function useNotificationSettings(userId: string | null) {
  const [settings, setSettingsState] = useState<NotificationSettings>(DEFAULTS);

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(settingsKey(userId)).then((value) => {
      if (value) setSettingsState(JSON.parse(value));
    });
  }, [userId]);

  const setSettings = useCallback(
    async (next: NotificationSettings) => {
      if (!userId) return;
      await AsyncStorage.setItem(settingsKey(userId), JSON.stringify(next));
      setSettingsState(next);
    },
    [userId],
  );

  return { settings, setSettings };
}

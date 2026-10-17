import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { recomputeReminders } from '@/features/notifications/recompute-reminders';
import { onCardsChanged, publishInfeasibleReminders } from '@/features/notifications/reminder-events';
import { useNotificationSettings } from '@/features/notifications/use-notification-settings';
import { initNotifications } from '@/services/notifications';

// Invocation points per 05-notification-scheduler.md: card create/edit (via the
// notifyCardsChanged pub-sub) and app foreground. Deliberately NEVER gated on connectivity —
// local notification scheduling must keep working fully offline. Mounted once from the root
// layout; the Settings screen reads results via useInfeasibleReminders() instead of mounting
// this again, so there's only ever one set of AppState/permission side effects running.
export function useReminderScheduler(userId: string | null) {
  const { settings } = useNotificationSettings(userId);
  const settingsRef = useRef(settings);
  const notificationsReady = useRef<boolean | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!userId) return;
    const uid = userId;

    async function recompute() {
      try {
        if (notificationsReady.current === null) {
          notificationsReady.current = await initNotifications();
        }
        if (!notificationsReady.current) return;

        const result = await recomputeReminders(uid, settingsRef.current);
        publishInfeasibleReminders(result);
      } catch {
        notificationsReady.current = false;
      }
    }

    recompute();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recompute();
    });
    const unsubscribeCardsChanged = onCardsChanged(recompute);

    return () => {
      subscription.remove();
      unsubscribeCardsChanged();
    };
  }, [userId]);
}

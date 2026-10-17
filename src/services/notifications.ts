import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getDb } from '@/data/local/db';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Order matters: creating the channel before requesting permission is what triggers the
// Android 13+ system opt-in prompt. The permission result is checked, not discarded — a denial
// must stop scheduling, not be silently ignored (05-notification-scheduler.md).
export async function initNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('card-reminders', {
      name: 'Card payment reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

type NotificationLogRow = {
  id: string;
  card_id: string;
  scheduled_for: string;
  local_notification_id: string;
};

async function listLogRows(): Promise<NotificationLogRow[]> {
  const db = await getDb();
  return db.getAllAsync<NotificationLogRow>('select * from notification_log');
}

async function insertLogRow(cardId: string, scheduledFor: Date, notificationId: string) {
  const db = await getDb();
  await db.runAsync(
    'insert into notification_log (id, card_id, scheduled_for, local_notification_id, created_at) values (?, ?, ?, ?, ?)',
    [`${cardId}:${scheduledFor.toISOString()}`, cardId, scheduledFor.toISOString(), notificationId, new Date().toISOString()],
  );
}

async function deleteLogRowsForCard(cardId: string) {
  const db = await getDb();
  await db.runAsync('delete from notification_log where card_id = ?', [cardId]);
}

async function deleteLogRowById(id: string) {
  const db = await getDb();
  await db.runAsync('delete from notification_log where id = ?', [id]);
}

function truncatedToMinute(iso: string): string {
  return iso.slice(0, 16); // 'YYYY-MM-DDTHH:MM'
}

export type ReminderToApply = {
  cardId: string;
  cardNickname: string;
  dueDateLabel: string;
  scheduledAt: Date | null; // null means: this card is infeasible, cancel any existing reminder
};

// Reconciles notification_log (the app's belief about what's scheduled) against the OS (the
// source of truth) and the new computed schedule, then only cancels+reschedules what actually
// changed. Called on every scheduler run — card create/edit and app foreground
// (05-notification-scheduler.md). Never gated on connectivity: this is a fully offline concern.
export async function applyReminders(reminders: ReminderToApply[]): Promise<void> {
  const osScheduled = await Notifications.getAllScheduledNotificationsAsync();
  const osIds = new Set(osScheduled.map((n) => n.identifier));
  const logRows = await listLogRows();

  // Cancel OS notifications the log doesn't know about (orphans — e.g. a card deleted while
  // the app was closed), and drop log rows whose id no longer exists in the OS.
  const logIds = new Set(logRows.map((r) => r.local_notification_id));
  for (const notification of osScheduled) {
    if (notification.content.data?.cardId && !logIds.has(notification.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }
  const validLogRows = logRows.filter((r) => osIds.has(r.local_notification_id));
  for (const row of logRows) {
    if (!osIds.has(row.local_notification_id)) {
      await deleteLogRowById(row.id);
    }
  }

  const logByCardId = new Map(validLogRows.map((r) => [r.card_id, r]));

  for (const reminder of reminders) {
    const existing = logByCardId.get(reminder.cardId);

    if (!reminder.scheduledAt) {
      // Infeasible (or deleted) card: cancel any existing reminder, remove the log row.
      if (existing) {
        await Notifications.cancelScheduledNotificationAsync(existing.local_notification_id);
        await deleteLogRowsForCard(reminder.cardId);
      }
      continue;
    }

    const unchanged =
      existing && truncatedToMinute(existing.scheduled_for) === truncatedToMinute(reminder.scheduledAt.toISOString());
    if (unchanged) continue;

    if (existing) {
      await Notifications.cancelScheduledNotificationAsync(existing.local_notification_id);
      await deleteLogRowsForCard(reminder.cardId);
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Card payment due soon',
        body: `${reminder.cardNickname} statement is due on ${reminder.dueDateLabel}`,
        data: { cardId: reminder.cardId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.scheduledAt,
        channelId: 'card-reminders',
      },
    });

    await insertLogRow(reminder.cardId, reminder.scheduledAt, id);
  }
}

export async function cancelRemindersForCard(cardId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<NotificationLogRow>('select * from notification_log where card_id = ?', [
    cardId,
  ]);
  for (const row of rows) {
    await Notifications.cancelScheduledNotificationAsync(row.local_notification_id);
  }
  await deleteLogRowsForCard(cardId);
}

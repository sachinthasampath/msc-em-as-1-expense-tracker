import { listCards } from '@/data/repositories/cards-repository';
import { computeCurrentCycleDueDate } from '@/features/notifications/compute-due-date';
import { NotificationSettings } from '@/features/notifications/use-notification-settings';
import { CardReminder, scheduleReminders } from '@/services/notification-scheduler';
import { applyReminders, ReminderToApply } from '@/services/notifications';

const MIN_SPACING_MINUTES = 30;

export type InfeasibleReminder = {
  cardId: string;
  cardNickname: string;
  reason: 'no-slot' | 'due-date-passed';
};

// Recomputes the user's ENTIRE reminder set (cheap — realistically a handful of cards) and
// reconciles it against the OS. Called on card create/edit and on app foreground — never from
// the sync engine, never gated on connectivity (05-notification-scheduler.md).
export async function recomputeReminders(
  userId: string,
  settings: NotificationSettings,
  now: Date = new Date(),
): Promise<InfeasibleReminder[]> {
  const cards = await listCards(userId);
  const eligible = cards.filter(
    (c) => c.cardType === 'credit' && c.statementDay != null && c.paymentDueDay != null,
  );

  const cardReminders: CardReminder[] = eligible.map((c) => ({
    cardId: c.id,
    dueDate: computeCurrentCycleDueDate(c.paymentDueDay as number, now, settings.timeZone),
    leadDays: c.reminderLeadDays,
  }));

  const scheduled = scheduleReminders(cardReminders, {
    quietHoursStart: settings.quietHoursStart,
    quietHoursEnd: settings.quietHoursEnd,
    maxPerDay: settings.maxPerDay,
    minSpacingMinutes: MIN_SPACING_MINUTES,
    timeZone: settings.timeZone,
    now,
  });

  const cardById = new Map(eligible.map((c) => [c.id, c]));
  const dueDateById = new Map(cardReminders.map((r) => [r.cardId, r.dueDate]));
  const toApply: ReminderToApply[] = [];
  const infeasible: InfeasibleReminder[] = [];

  for (const result of scheduled) {
    const card = cardById.get(result.cardId);
    if (!card) continue;

    if (result.infeasible) {
      toApply.push({ cardId: result.cardId, cardNickname: card.nickname, dueDateLabel: '', scheduledAt: null });
      infeasible.push({ cardId: result.cardId, cardNickname: card.nickname, reason: result.reason });
    } else {
      const dueDate = dueDateById.get(result.cardId);
      toApply.push({
        cardId: result.cardId,
        cardNickname: card.nickname,
        dueDateLabel: dueDate?.toLocaleDateString() ?? '',
        scheduledAt: result.scheduledAt,
      });
    }
  }

  await applyReminders(toApply);
  return infeasible;
}

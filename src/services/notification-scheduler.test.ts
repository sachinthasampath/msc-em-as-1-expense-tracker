import { CardReminder, SchedulerConstraints, scheduleReminders } from '@/services/notification-scheduler';

const TZ = 'Asia/Colombo'; // UTC+5:30, no DST

function baseConstraints(overrides: Partial<SchedulerConstraints> = {}): SchedulerConstraints {
  return {
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    maxPerDay: 3,
    minSpacingMinutes: 30,
    timeZone: TZ,
    now: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function reminder(cardId: string, dueDate: string, leadDays: number): CardReminder {
  return { cardId, dueDate: new Date(dueDate), leadDays };
}

describe('scheduleReminders', () => {
  it('schedules a single card at its desired slot when nothing conflicts', () => {
    const [result] = scheduleReminders(
      [reminder('card-1', '2026-01-10T12:00:00Z', 3)],
      baseConstraints(),
    );
    expect(result.infeasible).toBe(false);
  });

  it('a due date in the past relative to now is infeasible with reason due-date-passed', () => {
    const [result] = scheduleReminders(
      [reminder('card-1', '2025-12-31T00:00:00Z', 3)],
      baseConstraints({ now: new Date('2026-01-01T00:00:00Z') }),
    );
    expect(result).toEqual({ cardId: 'card-1', infeasible: true, reason: 'due-date-passed' });
  });

  it('maxPerDay: 0 makes every card infeasible with reason no-slot, never scheduled anyway', () => {
    const [result] = scheduleReminders(
      [reminder('card-1', '2026-01-10T12:00:00Z', 3)],
      baseConstraints({ maxPerDay: 0 }),
    );
    expect(result).toEqual({ cardId: 'card-1', infeasible: true, reason: 'no-slot' });
  });

  it('clamps a desired slot inside quiet hours to quietHoursEnd', () => {
    // 2026-01-07 05:00 Colombo local time is inside 22:00-07:00 quiet hours.
    const [result] = scheduleReminders(
      [reminder('card-1', '2026-01-20T00:00:00Z', 13)], // desired ~2026-01-07, inside the window
      baseConstraints(),
    );
    expect(result.infeasible).toBe(false);
    if (!result.infeasible) {
      // quietHoursEnd is 07:00 local = 01:30 UTC in Colombo (UTC+5:30).
      expect(result.scheduledAt.getUTCHours()).toBe(1);
      expect(result.scheduledAt.getUTCMinutes()).toBe(30);
    }
  });

  it('overnight quiet-hours clamp moves an evening slot to the NEXT local day', () => {
    // Desired slot 2026-01-10 22:30 Colombo local (17:00 UTC) is in the evening portion of
    // 22:00-07:00 quiet hours and must clamp to 07:00 the next local calendar day. Due date is
    // 2 local days later so there's room for the clamp to land before it.
    const desired = new Date('2026-01-10T17:00:00Z');
    const dueDate = new Date('2026-01-12T17:00:00Z');
    const [result] = scheduleReminders([{ cardId: 'card-1', dueDate, leadDays: 2 }], baseConstraints());
    expect(result.infeasible).toBe(false);
    if (!result.infeasible) {
      expect(result.scheduledAt.getTime()).toBeGreaterThan(desired.getTime());
      expect(result.scheduledAt.getUTCHours()).toBe(1);
      expect(result.scheduledAt.getUTCMinutes()).toBe(30);
    }
  });

  it('overflow beyond maxPerDay for the same desired day lands on a different day, still before the due date', () => {
    const dueDate = '2026-01-20T12:00:00Z';
    const reminders = [
      reminder('card-1', dueDate, 3),
      reminder('card-2', dueDate, 3),
      reminder('card-3', dueDate, 3),
      reminder('card-4', dueDate, 3),
    ];
    const results = scheduleReminders(reminders, baseConstraints({ maxPerDay: 3 }));
    const feasible = results.filter((r) => !r.infeasible) as Extract<(typeof results)[number], { infeasible: false }>[];

    expect(feasible).toHaveLength(4);
    const days = feasible.map((r) => r.scheduledAt.toISOString().slice(0, 10));
    const uniqueDays = new Set(days);
    expect(uniqueDays.size).toBeGreaterThan(1); // at least one card pushed to a different day
    for (const r of feasible) {
      expect(r.scheduledAt.getTime()).toBeLessThanOrEqual(new Date(dueDate).getTime());
    }
  });

  it('two cards with an identical due date produce a stable, cardId-tie-broken assignment', () => {
    const dueDate = '2026-01-15T12:00:00Z';
    const resultsA = scheduleReminders(
      [reminder('b-card', dueDate, 3), reminder('a-card', dueDate, 3)],
      baseConstraints(),
    );
    const resultsB = scheduleReminders(
      [reminder('a-card', dueDate, 3), reminder('b-card', dueDate, 3)],
      baseConstraints(),
    );
    expect(resultsA).toEqual(resultsB);
  });

  it('a slot just after local midnight but before midnight UTC counts against the correct local day', () => {
    // 2026-01-05 00:15 Colombo local = 2026-01-04 18:45 UTC — must bucket as 2026-01-05 locally,
    // not 2026-01-04. Due date is 2 local days later so there's room to resolve.
    const dueDate = new Date('2026-01-06T18:45:00Z');
    const [result] = scheduleReminders(
      [{ cardId: 'card-1', dueDate, leadDays: 2 }],
      baseConstraints({ now: new Date('2026-01-01T00:00:00Z') }),
    );
    expect(result.infeasible).toBe(false);
  });
});

// Pure functions only — no SQLite, no Supabase, no expo-notifications calls in this file. This
// is what makes it unit-testable in isolation and demoable as "here's the algorithm" independent
// of "here's how it's wired up" (05-notification-scheduler.md).
//
// This is a genuine constraint-satisfaction problem:
//   Variables:   one per credit card with both statement_day and payment_due_day set.
//   Domain:      candidate notification date-times for that card, bounded to (now, dueDate],
//                starting from its desired slot (dueDate - leadDays) and searching forward.
//   Constraints: (1) not inside quiet hours; (2) no more than maxPerDay reminders across ALL
//                cards on the same local calendar day; (3) any two reminders at least
//                minSpacingMinutes apart; (4) now < scheduledAt <= dueDate; (5) each card gets
//                exactly one reminder per cycle.
//   Goal:        assign every card a date-time satisfying all constraints, as close as possible
//                to its desired slot.
//
// Solved with greedy most-constrained-first assignment with forward repair — not backtracking.
// It never revisits an assignment it has already made; it only repairs the current candidate
// forward (toward the due date, never past it). See the doc's naming note before describing
// this as "backtracking" anywhere — it isn't.
export type CardReminder = {
  cardId: string;
  dueDate: Date; // the card's computed payment-due date for the current cycle
  leadDays: number; // per-card configurable reminder lead time
};

export type SchedulerConstraints = {
  quietHoursStart: string; // 'HH:MM'
  quietHoursEnd: string; // 'HH:MM' (may wrap past midnight)
  maxPerDay: number; // across all cards combined
  minSpacingMinutes: number; // minimum gap between any two reminders
  timeZone: string; // IANA zone from profiles.timezone
  now: Date; // injected clock — never read Date.now() inside this module
};

export type ScheduledReminder =
  | { cardId: string; infeasible: false; scheduledAt: Date }
  | { cardId: string; infeasible: true; reason: 'no-slot' | 'due-date-passed' };

const MAX_SHIFTS = 14;

function parseHHMM(hhmm: string): { hours: number; minutes: number } {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return { hours, minutes };
}

// Reads instant's wall-clock fields in `timeZone` via Intl.DateTimeFormat — deliberately NOT
// using date-fns-tz's toZonedTime/fromZonedTime, which (as measured while building this module)
// silently use the *host machine's* local timezone as scratch storage internally, so they only
// happen to produce correct results on a machine whose system tz matches the target zone. That's
// exactly the "works here, breaks elsewhere" trap this project's own docs warn about elsewhere —
// see the decision log. This implementation only depends on Intl's IANA timezone database.
function wallClockParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24, // Intl can emit '24' for midnight under some hourCycle combos
    minute: get('minute'),
    second: get('second'),
  };
}

// A Date whose UTC-getters equal the local wall-clock fields for `instant` in `timeZone` — a
// convenient scratch representation for calendar arithmetic (compare, add days, etc.) without a
// dedicated zoned-date type.
function localWallClock(instant: Date, timeZone: string): Date {
  const p = wallClockParts(instant, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  return localWallClock(instant, timeZone).getTime() - instant.getTime();
}

// Inverse of localWallClock: given a wall-clock time (expressed via UTC getters, as produced by
// localWallClock), finds the real instant whose local representation in `timeZone` matches it.
// Two fixed-point iterations are enough for any real IANA zone (including DST transitions);
// Sri Lanka has none, but this isn't specific to Sri Lanka.
function toInstant(wallClockAsUtc: Date, timeZone: string): Date {
  let guess = wallClockAsUtc.getTime();
  for (let i = 0; i < 2; i++) {
    guess = wallClockAsUtc.getTime() - timeZoneOffsetMs(new Date(guess), timeZone);
  }
  return new Date(guess);
}

function minutesOfDay(wall: Date): number {
  return wall.getUTCHours() * 60 + wall.getUTCMinutes();
}

function dateKey(instant: Date, timeZone: string): string {
  const p = wallClockParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function addLocalDays(instant: Date, days: number, timeZone: string): Date {
  const wall = localWallClock(instant, timeZone);
  const shifted = new Date(wall.getTime());
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return toInstant(shifted, timeZone);
}

function startOfNextLocalDay(instant: Date, timeZone: string): Date {
  const wall = localWallClock(instant, timeZone);
  const next = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1, 0, 0, 0, 0));
  return toInstant(next, timeZone);
}

function addMinutesToInstant(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60000);
}

// start === end means no quiet hours at all (not 24 hours of them) — any other combination
// always leaves at least one legal minute of the day open, so no separate "unsatisfiable
// config" rejection is needed beyond this degenerate check.
function isInQuietHours(instant: Date, constraints: SchedulerConstraints): boolean {
  const { quietHoursStart, quietHoursEnd, timeZone } = constraints;
  if (quietHoursStart === quietHoursEnd) return false;

  const wall = localWallClock(instant, timeZone);
  const minuteOfDay = minutesOfDay(wall);
  const start = parseHHMM(quietHoursStart);
  const end = parseHHMM(quietHoursEnd);
  const startMin = start.hours * 60 + start.minutes;
  const endMin = end.hours * 60 + end.minutes;

  if (startMin < endMin) {
    return minuteOfDay >= startMin && minuteOfDay < endMin;
  }
  return minuteOfDay >= startMin || minuteOfDay < endMin; // overnight wrap, e.g. 22:00-07:00
}

function clampOutsideQuietHours(instant: Date, constraints: SchedulerConstraints): Date {
  if (!isInQuietHours(instant, constraints)) return instant;

  const { quietHoursStart, quietHoursEnd, timeZone } = constraints;
  const wall = localWallClock(instant, timeZone);
  const start = parseHHMM(quietHoursStart);
  const end = parseHHMM(quietHoursEnd);
  const startMin = start.hours * 60 + start.minutes;
  const endMin = end.hours * 60 + end.minutes;
  const minuteOfDay = minutesOfDay(wall);
  const overnightWrap = startMin >= endMin;

  const targetWall = new Date(
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), end.hours, end.minutes, 0, 0),
  );

  // Overnight wrap and we're in the evening portion before midnight (e.g. 22:30 with
  // 22:00-07:00): quietHoursEnd falls on the NEXT local calendar day, which changes dateKey.
  if (overnightWrap && minuteOfDay >= startMin) {
    targetWall.setUTCDate(targetWall.getUTCDate() + 1);
  }

  return toInstant(targetWall, timeZone);
}

function respectsSpacing(slot: Date, assigned: Date[], minSpacingMinutes: number): boolean {
  const minMs = minSpacingMinutes * 60000;
  return assigned.every((other) => Math.abs(slot.getTime() - other.getTime()) >= minMs);
}

export function scheduleReminders(
  reminders: CardReminder[],
  constraints: SchedulerConstraints,
): ScheduledReminder[] {
  const candidates = reminders
    .map((r) => ({
      cardId: r.cardId,
      dueDate: r.dueDate,
      desired: addLocalDays(r.dueDate, -r.leadDays, constraints.timeZone),
    }))
    // Most-constrained-first: soonest due date has the least room to move, so it picks first.
    // Tie-break on cardId so the result never depends on input/row order.
    .sort((a, b) => {
      const dueDiff = a.dueDate.getTime() - b.dueDate.getTime();
      return dueDiff !== 0 ? dueDiff : a.cardId.localeCompare(b.cardId);
    });

  const assigned: Date[] = [];
  const dayCounts = new Map<string, number>();
  const result: ScheduledReminder[] = [];

  for (const candidate of candidates) {
    if (candidate.dueDate.getTime() <= constraints.now.getTime()) {
      result.push({ cardId: candidate.cardId, infeasible: true, reason: 'due-date-passed' });
      continue;
    }

    let slot = candidate.desired;
    let placed = false;
    let day = '';

    for (let shift = 0; shift <= MAX_SHIFTS; shift++) {
      slot = clampOutsideQuietHours(slot, constraints);

      if (slot.getTime() > candidate.dueDate.getTime()) break; // searched past the deadline

      if (slot.getTime() <= constraints.now.getTime()) {
        slot = addLocalDays(slot, 1, constraints.timeZone);
        continue;
      }

      day = dateKey(slot, constraints.timeZone);
      const count = dayCounts.get(day) ?? 0;

      if (count < constraints.maxPerDay && respectsSpacing(slot, assigned, constraints.minSpacingMinutes)) {
        placed = true;
        break;
      }

      // Forward repair: prefer nudging later within the same day first (cheap, keeps the
      // original lead time), only falling back to a whole day once the day is full.
      if (count >= constraints.maxPerDay) {
        slot = startOfNextLocalDay(slot, constraints.timeZone);
      } else {
        slot = addMinutesToInstant(slot, constraints.minSpacingMinutes);
      }
    }

    if (!placed) {
      result.push({ cardId: candidate.cardId, infeasible: true, reason: 'no-slot' });
      continue;
    }

    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    assigned.push(slot);
    result.push({ cardId: candidate.cardId, infeasible: false, scheduledAt: slot });
  }

  return result;
}

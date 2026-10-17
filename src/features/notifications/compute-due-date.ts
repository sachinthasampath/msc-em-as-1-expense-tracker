// See notification-scheduler.ts for why this is hand-rolled against Intl.DateTimeFormat rather
// than using date-fns-tz's toZonedTime/fromZonedTime (which turned out to depend on the host
// machine's own system timezone internally).
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
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

function localWallClock(instant: Date, timeZone: string): Date {
  const p = wallClockParts(instant, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

function toInstant(wallClockAsUtc: Date, timeZone: string): Date {
  let guess = wallClockAsUtc.getTime();
  for (let i = 0; i < 2; i++) {
    const offset = localWallClock(new Date(guess), timeZone).getTime() - guess;
    guess = wallClockAsUtc.getTime() - offset;
  }
  return new Date(guess);
}

// Converts a card's payment_due_day (1-28) into a concrete due-date Date for the current
// billing cycle. Takes paymentDueDay in the current local month; if that date is already at or
// before `now`, rolls forward to next month — this is what makes "each card gets exactly one
// reminder per cycle" hold, since without a rollover rule the scheduler would schedule in the
// past once the first cycle passes and go quiet forever (05-notification-scheduler.md).
export function computeCurrentCycleDueDate(paymentDueDay: number, now: Date, timeZone: string): Date {
  const nowWall = wallClockParts(now, timeZone);
  let year = nowWall.year;
  let month = nowWall.month - 1;

  let dueInstant = toInstant(new Date(Date.UTC(year, month, paymentDueDay)), timeZone);

  if (dueInstant.getTime() <= now.getTime()) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    dueInstant = toInstant(new Date(Date.UTC(year, month, paymentDueDay)), timeZone);
  }

  return dueInstant;
}

// Computed once, client-side, when a card-linked payment is saved — not derived at query time —
// so a later edit to the card's statement day never silently changes historical attribution
// (02-schema-notes.md).
export function computeBillingPeriod(occurredAt: Date, statementDay: number) {
  const day = occurredAt.getDate();
  let month = occurredAt.getMonth();
  let year = occurredAt.getFullYear();

  if (day < statementDay) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }

  const start = new Date(year, month, statementDay);
  const end = new Date(year, month + 1, statementDay - 1);

  return { start: toDateString(start), end: toDateString(end) };
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

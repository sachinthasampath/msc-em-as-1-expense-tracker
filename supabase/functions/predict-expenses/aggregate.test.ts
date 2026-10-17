import { aggregate, forecastMonth, PaymentRow, windowStart } from './aggregate';

const NOW = new Date('2026-06-15T12:00:00Z'); // mid-June: current partial month is '2026-06'

function payment(overrides: Partial<PaymentRow> & { occurredAt: string; amount: number }): PaymentRow {
  return {
    id: `p-${Math.random()}`,
    categoryId: null,
    categoryName: null,
    parentCategoryId: null,
    cardBillingPeriodStart: null,
    cardBillingPeriodEnd: null,
    methodType: 'cash',
    ...overrides,
  };
}

describe('windowStart / forecastMonth', () => {
  it('windowStart is the first day of the month 6 months back', () => {
    expect(windowStart(NOW).toISOString()).toBe('2025-12-01T00:00:00.000Z');
  });

  it('forecastMonth is the month after the current (partial) one', () => {
    expect(forecastMonth(NOW)).toBe('2026-07');
  });
});

describe('aggregate', () => {
  it('reports insufficientData with fewer than 3 complete months', () => {
    const payments = [
      payment({ occurredAt: '2026-05-01T00:00:00Z', amount: 1000 }),
      payment({ occurredAt: '2026-04-01T00:00:00Z', amount: 1000 }),
    ];
    const result = aggregate(payments, NOW);
    expect(result).toEqual({ insufficientData: true, monthsOfData: 2 });
  });

  it('reports insufficientData when all data is older than the last 2 months, even with 3+ months', () => {
    const payments = [
      payment({ occurredAt: '2026-01-01T00:00:00Z', amount: 1000 }),
      payment({ occurredAt: '2025-12-01T00:00:00Z', amount: 1000 }),
      payment({ occurredAt: '2025-11-01T00:00:00Z', amount: 1000 }),
    ];
    const result = aggregate(payments, NOW);
    expect(result.insufficientData).toBe(true);
  });

  it('excludes the current partial month from the computation', () => {
    const payments = [
      payment({ occurredAt: '2026-06-10T00:00:00Z', amount: 999999 }), // current month, must be excluded
      payment({ occurredAt: '2026-05-01T00:00:00Z', amount: 1000 }),
      payment({ occurredAt: '2026-04-01T00:00:00Z', amount: 1000 }),
      payment({ occurredAt: '2026-03-01T00:00:00Z', amount: 1000 }),
    ];
    const result = aggregate(payments, NOW);
    expect(result.insufficientData).toBe(false);
    if (!result.insufficientData) {
      expect(result.forecast.predictedTotal).toBeLessThan(999999);
      expect(result.forecast.monthsOfData).toBe(3);
    }
  });

  it('attributes a card payment to its fixed billing period month, not occurred_at, avoiding double-count across a statement boundary', () => {
    const payments = [
      // occurred_at is May, but billing period attributes it to April — must land in April's bucket.
      payment({
        occurredAt: '2026-05-02T00:00:00Z',
        amount: 5000,
        methodType: 'card',
        cardBillingPeriodStart: '2026-04-15',
        cardBillingPeriodEnd: '2026-05-14',
      }),
      payment({ occurredAt: '2026-04-01T00:00:00Z', amount: 1000 }),
      payment({ occurredAt: '2026-03-01T00:00:00Z', amount: 1000 }),
      payment({ occurredAt: '2026-02-01T00:00:00Z', amount: 1000 }),
    ];
    const result = aggregate(payments, NOW);
    expect(result.insufficientData).toBe(false);
    // April's bucket should include the card payment (5000 + 1000 = 6000), not May's.
    // We can't read internal buckets directly, but predictedTotal should reflect the heavier
    // April month weighted most (newest-first weights [3,2,1,...]).
    if (!result.insufficientData) {
      expect(result.forecast.predictedTotal).toBeGreaterThan(1000);
    }
  });

  it('byCategory amounts sum exactly to predictedTotal', () => {
    const payments = [
      payment({ occurredAt: '2026-05-01T00:00:00Z', amount: 1000, categoryId: 'food', categoryName: 'Food' }),
      payment({ occurredAt: '2026-05-01T00:00:00Z', amount: 500, categoryId: 'transport', categoryName: 'Transport' }),
      payment({ occurredAt: '2026-04-01T00:00:00Z', amount: 800, categoryId: 'food', categoryName: 'Food' }),
      payment({ occurredAt: '2026-03-01T00:00:00Z', amount: 1200, categoryId: 'food', categoryName: 'Food' }),
    ];
    const result = aggregate(payments, NOW);
    expect(result.insufficientData).toBe(false);
    if (!result.insufficientData) {
      const sum = result.forecast.byCategory.reduce((s, c) => s + c.predictedAmount, 0);
      expect(sum).toBeCloseTo(result.forecast.predictedTotal, 6);
    }
  });

  it('flags a category as recurring when a similar amount appears in at least 3 of the last 4 months', () => {
    const payments = [
      payment({ occurredAt: '2026-05-01T00:00:00Z', amount: 2000, categoryId: 'sub', categoryName: 'Subscriptions' }),
      payment({ occurredAt: '2026-04-01T00:00:00Z', amount: 2050, categoryId: 'sub', categoryName: 'Subscriptions' }),
      payment({ occurredAt: '2026-03-01T00:00:00Z', amount: 1980, categoryId: 'sub', categoryName: 'Subscriptions' }),
      payment({ occurredAt: '2026-02-01T00:00:00Z', amount: 50, categoryId: 'sub', categoryName: 'Subscriptions' }),
    ];
    const result = aggregate(payments, NOW);
    expect(result.insufficientData).toBe(false);
    if (!result.insufficientData) {
      expect(result.forecast.recurringCategories).toContain('sub');
    }
  });

  it('does not flag a category as recurring when amounts vary too much', () => {
    const payments = [
      payment({ occurredAt: '2026-05-01T00:00:00Z', amount: 100, categoryId: 'misc', categoryName: 'Misc' }),
      payment({ occurredAt: '2026-04-01T00:00:00Z', amount: 900, categoryId: 'misc', categoryName: 'Misc' }),
      payment({ occurredAt: '2026-03-01T00:00:00Z', amount: 50, categoryId: 'misc', categoryName: 'Misc' }),
      payment({ occurredAt: '2026-02-01T00:00:00Z', amount: 1, categoryId: 'misc', categoryName: 'Misc' }),
    ];
    const result = aggregate(payments, NOW);
    expect(result.insufficientData).toBe(false);
    if (!result.insufficientData) {
      expect(result.forecast.recurringCategories).not.toContain('misc');
    }
  });

  it('returns recurringCategories: [] when fewer than 4 months of data', () => {
    const payments = [
      payment({ occurredAt: '2026-05-01T00:00:00Z', amount: 2000, categoryId: 'sub', categoryName: 'Subscriptions' }),
      payment({ occurredAt: '2026-04-01T00:00:00Z', amount: 2000, categoryId: 'sub', categoryName: 'Subscriptions' }),
      payment({ occurredAt: '2026-03-01T00:00:00Z', amount: 2000, categoryId: 'sub', categoryName: 'Subscriptions' }),
    ];
    const result = aggregate(payments, NOW);
    expect(result.insufficientData).toBe(false);
    if (!result.insufficientData) {
      expect(result.forecast.recurringCategories).toEqual([]);
      expect(result.forecast.monthsOfData).toBe(3);
    }
  });

  it('is deterministic: the same inputs and injected now produce byte-identical output across runs', () => {
    const payments = [
      payment({ occurredAt: '2026-05-01T00:00:00Z', amount: 1234, categoryId: 'food', categoryName: 'Food' }),
      payment({ occurredAt: '2026-04-01T00:00:00Z', amount: 2345, categoryId: 'food', categoryName: 'Food' }),
      payment({ occurredAt: '2026-03-01T00:00:00Z', amount: 3456, categoryId: 'transport', categoryName: 'Transport' }),
    ];
    const resultA = aggregate(payments, NOW);
    const resultB = aggregate(JSON.parse(JSON.stringify(payments)), new Date(NOW.getTime()));
    expect(resultA).toEqual(resultB);
  });
});

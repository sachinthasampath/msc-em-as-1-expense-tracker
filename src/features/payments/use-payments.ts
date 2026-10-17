import { useCallback, useEffect, useState } from 'react';

import * as paymentsRepo from '@/data/repositories/payments-repository';
import { computeBillingPeriod } from '@/features/payments/billing-period';
import { Card, Payment, PaymentMethod } from '@/types/domain';

export type AddPaymentInput = {
  userId: string;
  amountMinor: number;
  occurredAt: string;
  categoryId: string | null;
  paymentMethod: PaymentMethod | null;
  card: Card | null;
  notes: string | null;
  photoPath?: string | null;
};

export function usePayments(userId: string | null) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setPayments(await paymentsRepo.listPayments(userId));
  }, [userId]);

  useEffect(() => {
    async function load() {
      await refresh();
      setLoading(false);
    }
    load();
  }, [refresh]);

  const addPayment = useCallback(
    async (input: AddPaymentInput) => {
      const occurredAt = new Date(input.occurredAt);
      const billingPeriod =
        input.paymentMethod?.methodType === 'card' && input.card?.statementDay
          ? computeBillingPeriod(occurredAt, input.card.statementDay)
          : null;

      const payment = await paymentsRepo.createPayment({
        userId: input.userId,
        amountMinor: input.amountMinor,
        currency: 'LKR',
        occurredAt: input.occurredAt,
        categoryId: input.categoryId,
        paymentMethodId: input.paymentMethod?.id ?? null,
        cardBillingPeriodStart: billingPeriod?.start ?? null,
        cardBillingPeriodEnd: billingPeriod?.end ?? null,
        photoPath: input.photoPath ?? null,
        notes: input.notes,
        isRecurringGuess: false,
      });
      await refresh();
      return payment;
    },
    [refresh],
  );

  const removePayment = useCallback(
    async (id: string) => {
      await paymentsRepo.deletePayment(id);
      await refresh();
    },
    [refresh],
  );

  return { payments, loading, addPayment, removePayment };
}

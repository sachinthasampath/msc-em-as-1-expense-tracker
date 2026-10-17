export type Card = {
  id: string;
  userId: string;
  nickname: string;
  cardType: 'credit' | 'debit';
  last4: string | null;
  statementDay: number | null;
  paymentDueDay: number | null;
  reminderLeadDays: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type NewCard = Omit<Card, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export type PaymentMethod = {
  id: string;
  userId: string;
  methodType: 'card' | 'cash' | 'other';
  cardId: string | null;
  label: string | null;
  createdAt: string;
};

export type NewPaymentMethod = Omit<PaymentMethod, 'id' | 'createdAt'>;

export type Payment = {
  id: string;
  userId: string;
  amountMinor: number;
  currency: string;
  occurredAt: string;
  categoryId: string | null;
  paymentMethodId: string | null;
  cardBillingPeriodStart: string | null;
  cardBillingPeriodEnd: string | null;
  photoPath: string | null;
  notes: string | null;
  isRecurringGuess: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type NewPayment = Omit<Payment, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

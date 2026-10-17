import { useCallback, useEffect, useState } from 'react';

import * as cardsRepo from '@/data/repositories/cards-repository';
import * as paymentMethodsRepo from '@/data/repositories/payment-methods-repository';
import { notifyCardsChanged } from '@/features/notifications/reminder-events';
import { cancelRemindersForCard } from '@/services/notifications';
import { Card, NewCard } from '@/types/domain';

export function useCards(userId: string | null) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setCards(await cardsRepo.listCards(userId));
  }, [userId]);

  useEffect(() => {
    async function load() {
      await refresh();
      setLoading(false);
    }
    load();
  }, [refresh]);

  const addCard = useCallback(
    async (input: NewCard) => {
      const card = await cardsRepo.createCard(input);
      // Every card gets a matching payment method so it's selectable when logging a payment.
      await paymentMethodsRepo.createPaymentMethod({
        userId: card.userId,
        methodType: 'card',
        cardId: card.id,
        label: card.nickname,
      });
      await refresh();
      notifyCardsChanged();
      return card;
    },
    [refresh],
  );

  const removeCard = useCallback(
    async (id: string) => {
      await cardsRepo.deleteCard(id);
      // Cancel eagerly rather than waiting for the next scheduler reconcile pass
      // (05-notification-scheduler.md).
      await cancelRemindersForCard(id);
      await refresh();
      notifyCardsChanged();
    },
    [refresh],
  );

  return { cards, loading, addCard, removeCard };
}

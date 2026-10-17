import { useCallback, useEffect, useState } from 'react';

import * as paymentMethodsRepo from '@/data/repositories/payment-methods-repository';
import { PaymentMethod } from '@/types/domain';

export function usePaymentMethods(userId: string | null) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setMethods(await paymentMethodsRepo.listPaymentMethods(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    async function load() {
      await paymentMethodsRepo.ensureDefaultPaymentMethods(userId as string);
      await refresh();
      setLoading(false);
    }
    load();
  }, [userId, refresh]);

  return { methods, loading, refresh };
}

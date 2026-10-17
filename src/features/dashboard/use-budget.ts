import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

function budgetKey(userId: string) {
  return `monthly-budget-minor:${userId}`;
}

// Not in the Supabase schema — a monthly budget target is a per-device display preference for
// the Dashboard's SpendingGauge, not shared data, so it lives in AsyncStorage rather than adding
// a new synced table for one number.
export function useBudget(userId: string | null) {
  const [budgetMinor, setBudgetMinorState] = useState(0);

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(budgetKey(userId)).then((value) => {
      setBudgetMinorState(value ? Number(value) : 0);
    });
  }, [userId]);

  const setBudgetMinor = useCallback(
    async (minor: number) => {
      if (!userId) return;
      await AsyncStorage.setItem(budgetKey(userId), String(minor));
      setBudgetMinorState(minor);
    },
    [userId],
  );

  return { budgetMinor, setBudgetMinor };
}

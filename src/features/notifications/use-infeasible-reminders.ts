import { useEffect, useState } from 'react';

import { InfeasibleReminder } from '@/features/notifications/recompute-reminders';
import { getLatestInfeasibleReminders, onInfeasibleRemindersChanged } from '@/features/notifications/reminder-events';

export function useInfeasibleReminders(): InfeasibleReminder[] {
  const [infeasible, setInfeasible] = useState<InfeasibleReminder[]>(getLatestInfeasibleReminders());

  useEffect(() => onInfeasibleRemindersChanged(setInfeasible), []);

  return infeasible;
}

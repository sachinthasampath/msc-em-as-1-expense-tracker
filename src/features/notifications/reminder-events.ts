import { InfeasibleReminder } from '@/features/notifications/recompute-reminders';

// Minimal pub-sub so card mutations (in use-cards.ts) can trigger a reminder recompute without
// coupling that feature hook to the notification scheduler directly, and so the Settings screen
// can read the latest infeasible-reminder list without re-running the scheduling side effects
// itself — consistent with this project having no Redux/Zustand (00-overview.md), just plain
// hooks and the smallest pub-sub that gets the job done.
type Listener = () => void;
let listeners: Listener[] = [];

export function notifyCardsChanged() {
  listeners.forEach((listener) => listener());
}

export function onCardsChanged(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

type InfeasibleListener = (list: InfeasibleReminder[]) => void;
let latestInfeasible: InfeasibleReminder[] = [];
let infeasibleListeners: InfeasibleListener[] = [];

export function publishInfeasibleReminders(list: InfeasibleReminder[]) {
  latestInfeasible = list;
  infeasibleListeners.forEach((listener) => listener(list));
}

export function getLatestInfeasibleReminders() {
  return latestInfeasible;
}

export function onInfeasibleRemindersChanged(listener: InfeasibleListener): () => void {
  infeasibleListeners.push(listener);
  return () => {
    infeasibleListeners = infeasibleListeners.filter((l) => l !== listener);
  };
}

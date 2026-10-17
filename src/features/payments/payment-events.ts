// Minimal pub-sub so a payment write on one screen refreshes other usePayments subscribers
// (e.g. dashboard) without a shared store — same pattern as reminder-events.ts.
type Listener = () => void;
let listeners: Listener[] = [];

export function notifyPaymentsChanged() {
  listeners.forEach((listener) => listener());
}

export function onPaymentsChanged(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

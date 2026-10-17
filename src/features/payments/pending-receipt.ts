// Simple hand-off between the receipt-capture modal route and the add-payment screen: the modal
// can't return a value directly through expo-router navigation, so it stashes the captured uri
// here and the add-payment screen reads it back on focus.
let pendingUri: string | null = null;

export function setPendingReceiptUri(uri: string | null) {
  pendingUri = uri;
}

export function consumePendingReceiptUri(): string | null {
  const uri = pendingUri;
  pendingUri = null;
  return uri;
}

import { router } from 'expo-router';
import { Alert } from 'react-native';

import { ReceiptCaptureOverlay } from '@/components/ui/receipt-capture-overlay';
import { setPendingReceiptUri } from '@/features/payments/pending-receipt';

export default function ReceiptCaptureRoute() {
  return (
    <ReceiptCaptureOverlay
      onCancel={() => router.back()}
      onCapture={(result) => {
        setPendingReceiptUri(result.uri);
        router.back();
      }}
      onError={(error) => {
        Alert.alert('Camera error', error.message);
        router.back();
      }}
    />
  );
}

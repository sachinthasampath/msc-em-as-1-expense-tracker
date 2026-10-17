import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { SpendingGauge } from '@/components/ui/spending-gauge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { usePayments } from '@/features/payments/use-payments';
import { usePredictions } from '@/features/predictions/use-predictions';
import { useTheme } from '@/hooks/use-theme';
import { PredictResponse } from '@/types/predictions';

function formatLkr(amount: number) {
  return `LKR ${amount.toFixed(2)}`;
}

function actualSoFarThisMonth(payments: { occurredAt: string; amountMinor: number }[]) {
  const now = new Date();
  return (
    payments
      .filter((p) => {
        const d = new Date(p.occurredAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, p) => sum + p.amountMinor, 0) / 100
  );
}

export default function PredictionsScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { payments } = usePayments(userId);
  const { state, invoke } = usePredictions(userId);

  useEffect(() => {
    invoke();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const actualSoFar = actualSoFarThisMonth(payments);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Predictions</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.privacyNote}>
        Generating an explanation sends your aggregated, anonymized spending totals to an
        external AI provider (OpenRouter).
      </ThemedText>

      {state.status === 'loading' && <ThemedText themeColor="textSecondary">Loading prediction…</ThemedText>}

      {state.status === 'error' && (
        <ThemedView style={styles.gap}>
          <ThemedText style={styles.errorText}>{state.message}</ThemedText>
          <Pressable onPress={invoke} style={[styles.button, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold">Retry</ThemedText>
          </Pressable>
        </ThemedView>
      )}

      {state.status === 'rate-limited' && (
        <ThemedText themeColor="textSecondary">Daily AI limit reached, try again tomorrow.</ThemedText>
      )}

      {state.status === 'offline' &&
        (state.cached ? (
          <ThemedView style={styles.gap}>
            {!state.cached.insufficientData && (
              <ThemedText themeColor="textSecondary">
                Offline — showing the last prediction from {new Date(state.cached.generatedAt).toLocaleString()}.
              </ThemedText>
            )}
            <PredictionResult data={state.cached} actualSoFar={actualSoFar} theme={theme} />
          </ThemedView>
        ) : (
          <ThemedText themeColor="textSecondary">
            Offline, and no prediction has been fetched yet. Connect to the internet to see one.
          </ThemedText>
        ))}

      {state.status === 'result' && <PredictionResult data={state.data} actualSoFar={actualSoFar} theme={theme} />}
    </ScrollView>
  );
}

function PredictionResult({
  data,
  actualSoFar,
  theme,
}: {
  data: PredictResponse;
  actualSoFar: number;
  theme: ReturnType<typeof useTheme>;
}) {
  if (data.insufficientData) {
    return (
      <ThemedText themeColor="textSecondary">
        Add more expense history to see a prediction ({data.monthsOfData} month
        {data.monthsOfData === 1 ? '' : 's'} so far).
      </ThemedText>
    );
  }

  const { forecast, aiExplanation, aiError } = data;

  return (
    <ThemedView style={styles.gap}>
      <SpendingGauge
        actual={actualSoFar}
        target={forecast.predictedTotal}
        formattedActual={formatLkr(actualSoFar)}
        formattedTarget={formatLkr(forecast.predictedTotal)}
      />

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Forecast for {forecast.forecastMonth}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {formatLkr(forecast.lowerEstimate)} – {formatLkr(forecast.upperEstimate)}
        </ThemedText>
        <ThemedView type="backgroundSelected" style={styles.trendBadge}>
          <ThemedText type="small">{forecast.spendingTrend}</ThemedText>
        </ThemedView>
      </ThemedView>

      <ThemedText type="smallBold">By category</ThemedText>
      {forecast.byCategory.map((c) => (
        <ThemedView key={c.categoryId} style={styles.categoryRow}>
          <ThemedText>{c.name}</ThemedText>
          <ThemedText>{formatLkr(c.predictedAmount)}</ThemedText>
        </ThemedView>
      ))}

      {aiError ? (
        <ThemedText themeColor="textSecondary">AI insight unavailable right now.</ThemedText>
      ) : (
        aiExplanation && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText>{aiExplanation.explanation}</ThemedText>
            {aiExplanation.insights.map((insight, i) => (
              <ThemedText key={i} themeColor="textSecondary">
                • {insight}
              </ThemedText>
            ))}
          </ThemedView>
        )
      )}

      <ThemedText themeColor="textSecondary" style={styles.disclaimer}>
        This is an estimate, not a guarantee.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  gap: {
    gap: Spacing.three,
  },
  privacyNote: {
    fontSize: 12,
  },
  errorText: {
    color: '#D33',
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  trendBadge: {
    alignSelf: 'flex-start',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  disclaimer: {
    fontSize: 12,
    textAlign: 'center',
  },
});

import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui/primary-button';
import { SpendingGauge } from '@/components/ui/spending-gauge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Layout, Radius, Spacing } from '@/constants/theme';
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
  const { state, refreshing, regenerate } = usePredictions(userId);

  const actualSoFar = actualSoFarThisMonth(payments);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Predictions</ThemedText>
      <ThemedText type="caption" themeColor="textSecondary">
        Generating an explanation sends your aggregated, anonymized spending totals to an
        external AI provider (OpenRouter).
      </ThemedText>

      {state.status === 'loading' && <ThemedText themeColor="textSecondary">Loading prediction…</ThemedText>}

      {state.status === 'empty' && (
        <ThemedView style={styles.gap}>
          <ThemedText themeColor="textSecondary">No prediction saved on this device yet.</ThemedText>
          <PrimaryButton label="Generate prediction" loading={refreshing} loadingLabel="Generating…" onPress={regenerate} />
        </ThemedView>
      )}

      {state.status === 'error' && (
        <ThemedView style={styles.gap}>
          <ThemedText type="caption" themeColor="danger">
            {state.message}
          </ThemedText>
          <PrimaryButton label="Retry" loading={refreshing} loadingLabel="Generating…" onPress={regenerate} />
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
            <PredictionResult data={state.cached} actualSoFar={actualSoFar} />
          </ThemedView>
        ) : (
          <ThemedText themeColor="textSecondary">
            Offline, and no prediction has been fetched yet. Connect to the internet to see one.
          </ThemedText>
        ))}

      {state.status === 'result' && (
        <ThemedView style={styles.gap}>
          <PredictionResult data={state.data} actualSoFar={actualSoFar} />
          <PrimaryButton label="Regenerate" loading={refreshing} loadingLabel="Generating…" onPress={regenerate} />
        </ThemedView>
      )}
    </ScrollView>
    </SafeAreaView>
  );
}

function PredictionResult({
  data,
  actualSoFar,
}: {
  data: PredictResponse;
  actualSoFar: number;
}) {
  const theme = useTheme();

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

      <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
        <ThemedText type="subtitle">Forecast for {forecast.forecastMonth}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {formatLkr(forecast.lowerEstimate)} – {formatLkr(forecast.upperEstimate)}
        </ThemedText>
        <ThemedView type="backgroundSelected" style={styles.trendBadge}>
          <ThemedText type="caption">{forecast.spendingTrend}</ThemedText>
        </ThemedView>
      </ThemedView>

      <ThemedText type="subtitle">By category</ThemedText>
      {forecast.byCategory.map((c) => (
        <ThemedView key={c.categoryId} type="card" style={[styles.categoryRow, { borderColor: theme.border }]}>
          <ThemedText>{c.name}</ThemedText>
          <ThemedText type="smallBold">{formatLkr(c.predictedAmount)}</ThemedText>
        </ThemedView>
      ))}

      {aiError ? (
        <ThemedText themeColor="textSecondary">AI insight unavailable right now.</ThemedText>
      ) : (
        aiExplanation && (
          <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText>{aiExplanation.explanation}</ThemedText>
            {aiExplanation.insights.map((insight, i) => (
              <ThemedText key={i} themeColor="textSecondary">
                • {insight}
              </ThemedText>
            ))}
          </ThemedView>
        )
      )}

      <ThemedText type="caption" themeColor="textSecondary" style={styles.disclaimer}>
        This is an estimate, not a guarantee.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing.five,
    gap: Layout.sectionGap,
  },
  gap: {
    gap: Layout.sectionGap,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  trendBadge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Spacing.three,
  },
  disclaimer: {
    textAlign: 'center',
  },
});

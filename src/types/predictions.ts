// Mirrors supabase/functions/predict-expenses/aggregate.ts's Forecast type and index.ts's
// response contract. Duplicated rather than imported — that code runs on Deno and lives outside
// src/, so the mobile bundle doesn't cross-import it (07-ai-prediction.md's file split).
export type Forecast = {
  forecastMonth: string;
  currency: 'LKR';
  predictedTotal: number;
  lowerEstimate: number;
  upperEstimate: number;
  byCategory: { categoryId: string; name: string; predictedAmount: number }[];
  spendingTrend: 'increasing' | 'decreasing' | 'stable';
  monthsOfData: number;
  recurringCategories: string[];
};

export type AiExplanation = {
  explanation: string;
  insights: string[];
  limitations: string[];
};

export type PredictResponse =
  | { insufficientData: true; monthsOfData: number }
  | {
      insufficientData: false;
      forecast: Forecast;
      aiExplanation: AiExplanation | null;
      aiError: boolean;
      cached: boolean;
      generatedAt: string;
    };

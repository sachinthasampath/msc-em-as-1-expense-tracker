import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/data/remote/supabase-client';
import { useIsOnline } from '@/services/connectivity';
import { PredictResponse } from '@/types/predictions';

export type PredictionState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'rate-limited' }
  | { status: 'offline'; cached: PredictResponse | null }
  | { status: 'result'; data: PredictResponse };

function cacheKey(userId: string) {
  return `last-prediction:${userId}`;
}

async function readFunctionError(error: unknown): Promise<{ status?: number; message: string }> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context?.status as number | undefined;
    try {
      // Prefer text() so we don't trip Expo's Response.blob() warning path.
      const text = await error.context.text();
      const body = text ? JSON.parse(text) : null;
      if (status === 404 || body?.code === 'NOT_FOUND') {
        return {
          status: 404,
          message:
            'Prediction service is not deployed. From the project folder run: npx supabase functions deploy predict-expenses --project-ref <your-ref>',
        };
      }
      if (typeof body?.error === 'string') return { status, message: body.error };
      if (typeof body?.message === 'string') return { status, message: body.message };
    } catch {
      // Body was empty or not JSON.
    }
    if (status === 404) {
      return {
        status: 404,
        message: 'Prediction service is not deployed. Deploy the predict-expenses Edge Function.',
      };
    }
    return { status, message: error.message };
  }

  if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
    return { message: error.message };
  }

  return { message: error instanceof Error ? error.message : 'Prediction request failed.' };
}

// The one screen in the app that requires connectivity — the forecast is computed server-side
// (07-ai-prediction.md). Offline, show the last successfully fetched result rather than an
// error; it's cached locally (not a SQLite mirror, just a last-known-good snapshot) specifically
// for this.
export function usePredictions(userId: string | null) {
  const isOnline = useIsOnline();
  const [state, setState] = useState<PredictionState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(cacheKey(userId)).then((raw) => {
      if (cancelled) return;
      setState(raw ? { status: 'result', data: JSON.parse(raw) } : { status: 'empty' });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const regenerate = useCallback(async () => {
    if (!userId) return;

    if (!isOnline) {
      const cachedRaw = await AsyncStorage.getItem(cacheKey(userId));
      setState({ status: 'offline', cached: cachedRaw ? JSON.parse(cachedRaw) : null });
      return;
    }

    setRefreshing(true);
    const controller = new AbortController();
    // Client-side timeout: the function's own 8s abort only bounds the OpenRouter call, not
    // cold start + query + LLM + response — without this the loading state can hang
    // indefinitely on a stalled connection.
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const { data, error } = await supabase.functions.invoke<PredictResponse>('predict-expenses', {
        signal: controller.signal,
      });

      if (error) {
        const { status, message } = await readFunctionError(error);
        if (status === 429) {
          setState({ status: 'rate-limited' });
        } else {
          setState({ status: 'error', message });
        }
        return;
      }

      if (data) {
        await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(data));
        setState({ status: 'result', data });
      }
    } catch {
      setState({ status: 'error', message: 'Request failed or timed out.' });
    } finally {
      clearTimeout(timeout);
      setRefreshing(false);
    }
  }, [userId, isOnline]);

  return { state, refreshing, regenerate };
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';

import { supabase } from '@/data/remote/supabase-client';
import { useIsOnline } from '@/services/connectivity';
import { PredictResponse } from '@/types/predictions';

export type PredictionState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'rate-limited' }
  | { status: 'offline'; cached: PredictResponse | null }
  | { status: 'result'; data: PredictResponse };

function cacheKey(userId: string) {
  return `last-prediction:${userId}`;
}

// The one screen in the app that requires connectivity — the forecast is computed server-side
// (07-ai-prediction.md). Offline, show the last successfully fetched result rather than an
// error; it's cached locally (not a SQLite mirror, just a last-known-good snapshot) specifically
// for this.
export function usePredictions(userId: string | null) {
  const isOnline = useIsOnline();
  const [state, setState] = useState<PredictionState>({ status: 'loading' });

  const invoke = useCallback(async () => {
    if (!userId) return;

    if (!isOnline) {
      const cachedRaw = await AsyncStorage.getItem(cacheKey(userId));
      setState({ status: 'offline', cached: cachedRaw ? JSON.parse(cachedRaw) : null });
      return;
    }

    setState({ status: 'loading' });
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
        const status = (error as { context?: { status?: number } })?.context?.status;
        if (status === 429) {
          setState({ status: 'rate-limited' });
        } else {
          setState({ status: 'error', message: error.message });
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
    }
  }, [userId, isOnline]);

  return { state, invoke };
}

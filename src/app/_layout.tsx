import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { getDb } from '@/data/local/db';
import { useAuth } from '@/features/auth/use-auth';
import { useReminderScheduler } from '@/features/notifications/use-reminder-scheduler';
import { useSyncEngine } from '@/services/sync-engine';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { session, loading: authLoading } = useAuth();
  const [dbReady, setDbReady] = useState(false);
  useSyncEngine(session?.user.id ?? null);
  useReminderScheduler(session?.user.id ?? null);

  useEffect(() => {
    getDb().then(() => setDbReady(true));
  }, []);

  const ready = !authLoading && dbReady;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="receipt-capture" options={{ presentation: 'fullScreenModal' }} />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

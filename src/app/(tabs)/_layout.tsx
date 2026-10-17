import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useTheme } from '@/hooks/use-theme';

const TABS: { name: string; title: string; symbol: SFSymbol }[] = [
  { name: 'index', title: 'Dashboard', symbol: 'house.fill' },
  { name: 'cards', title: 'Cards', symbol: 'creditcard.fill' },
  { name: 'add-payment', title: 'Add Payment', symbol: 'plus.circle.fill' },
  { name: 'predictions', title: 'Predictions', symbol: 'chart.bar.fill' },
  { name: 'settings', title: 'Settings', symbol: 'gearshape.fill' },
];

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
        },
        tabBarLabelStyle: {
          fontSize: 11,
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => (
              <SymbolView name={tab.symbol} tintColor={color} size={22} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

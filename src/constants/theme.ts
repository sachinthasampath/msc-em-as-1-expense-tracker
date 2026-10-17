/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1C1917',
    background: '#F7F4EF',
    backgroundElement: '#EFEBE4',
    backgroundSelected: '#D7EDEB',
    textSecondary: '#6B6560',
    primary: '#0F766E',
    onPrimary: '#FFFFFF',
    danger: '#E07A5F',
    success: '#2F9E6B',
    border: '#E4DED6',
    card: '#FFFFFF',
  },
  dark: {
    text: '#F5F2ED',
    background: '#1A1816',
    backgroundElement: '#2A2623',
    backgroundSelected: '#134E4A',
    textSecondary: '#A8A29E',
    primary: '#2DD4BF',
    onPrimary: '#042F2E',
    danger: '#F4A38A',
    success: '#4ADE80',
    border: '#3A3530',
    card: '#24211E',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  input: 12,
  card: 16,
  pill: 999,
} as const;

export const Layout = {
  screenPadding: 20,
  sectionGap: 16,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

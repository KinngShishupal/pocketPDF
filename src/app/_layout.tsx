import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { C } from '@/constants/theme';
import { clearPicked } from '@/lib/pickers';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bg, card: C.surface, primary: C.accent, text: C.text, border: C.border },
};

export default function RootLayout() {
  useEffect(() => {
    clearPicked();
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scan" options={{ animation: 'fade_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="result" options={{ animation: 'fade', gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}

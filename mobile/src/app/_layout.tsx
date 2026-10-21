import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme as NavTheme } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SessionProvider, useSession } from "@/auth/session";
import { I18nProvider, useI18n } from "@/i18n";
import { SettingsProvider } from "@/lib/settings";
import { ToastHost } from "@/lib/toast";
import { CACHE_BUSTER, CACHE_MAX_AGE, persister, queryClient, wireNativeManagers } from "@/query/client";
import { useTheme } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});
wireNativeManagers();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <I18nProvider>
        <SettingsProvider>
          <SessionProvider>
            <AppShell />
          </SessionProvider>
        </SettingsProvider>
      </I18nProvider>
    </GestureHandlerRootView>
  );
}

function AppShell() {
  const session = useSession();
  const { t } = useI18n();
  const { dark, colors } = useTheme();
  const signedIn = session.account !== null;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  useEffect(() => {
    if (session.ready) SplashScreen.hideAsync().catch(() => {});
  }, [session.ready]);

  const navTheme = useMemo<NavTheme>(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.background,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    };
  }, [dark, colors]);

  // Keep the splash screen up until the key has been read from SecureStore,
  // so a signed-in person never sees the sign-in screen flash by.
  if (!session.ready) return null;

  return (
    <ThemeProvider value={navTheme}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: CACHE_MAX_AGE, buster: CACHE_BUSTER }}
        onSuccess={() => {
          // Changes made offline in an earlier session continue now.
          if (signedIn) void queryClient.resumePausedMutations();
        }}
      >
        <Stack
          screenOptions={{
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.text },
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: "minimal",
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Protected guard={signedIn}>
            <Stack.Screen
              name="index"
              options={{
                title: t("projects.title"),
                headerLargeTitleEnabled: true,
                headerLargeTitleShadowVisible: false,
                headerLargeStyle: { backgroundColor: colors.background },
              }}
            />
            <Stack.Screen name="projects/[projectId]/index" options={{ title: "" }} />
            <Stack.Screen
              name="projects/[projectId]/new-task"
              options={{ presentation: "modal", title: t("newTask.title") }}
            />
            <Stack.Screen name="tasks/[taskId]" options={{ title: "" }} />
            <Stack.Screen
              name="settings"
              options={{
                title: t("settings.title"),
                headerLargeTitleEnabled: true,
                headerLargeTitleShadowVisible: false,
                headerLargeStyle: { backgroundColor: colors.background },
              }}
            />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          </Stack.Protected>
        </Stack>
        <StatusBar style="auto" />
        <ToastHost />
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}

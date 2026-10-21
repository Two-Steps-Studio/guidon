import { useIsMutating } from "@tanstack/react-query";
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text } from "react-native";
import { DEFAULT_SERVER } from "@/api";
import { useSession } from "@/auth/session";
import { Row, Section } from "@/components/Rows";
import { useI18n } from "@/i18n";
import { useSettings } from "@/lib/settings";
import { spacing, typography, useTheme } from "@/theme";

/**
 * The legal documents are the app publisher's, so they always come from
 * useguidon.com - also for people signed in to a self-hosted server.
 */
const LEGAL = {
  privacy: `${DEFAULT_SERVER}/legal/privacy`,
  terms: `${DEFAULT_SERVER}/legal/terms`,
  eula: `${DEFAULT_SERVER}/legal/eula`,
} as const;

function openPage(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => {
    Linking.openURL(url).catch(() => {});
  });
}

export default function SettingsScreen() {
  const session = useSession();
  const settings = useSettings();
  const { t, languageName } = useI18n();
  const { colors } = useTheme();
  const pending = useIsMutating();

  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "1.0.0";
  const build = Application.nativeBuildVersion;
  const server = session.server.replace(/^https?:\/\//, "");

  const confirmSignOut = () => {
    const message =
      pending > 0 ? `${t("settings.signOutMessage")}\n\n${t("settings.pendingChanges", { count: pending })}` : undefined;
    Alert.alert(t("settings.signOutTitle"), message, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("settings.signOut"), style: "destructive", onPress: () => void session.signOut() },
    ]);
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Section title={t("settings.account")}>
        {session.account?.name ? <Row label={t("settings.name")} value={session.account.name} /> : null}
        <Row label={t("settings.email")} value={session.account?.email ?? ""} />
        <Row
          label={t("settings.server")}
          value={server}
          onPress={() => openPage(`${session.server}/profile`)}
          accessibilityHint={t("settings.manageAccountHint")}
          last
        />
      </Section>
      <Text style={[styles.footnote, { color: colors.textMuted }]}>{t("settings.manageAccountHint")}</Text>

      <Section title={t("settings.feedback")} footer={t("settings.hapticsHint")}>
        <Row
          label={t("settings.haptics")}
          right={
            <Switch
              value={settings.hapticsEnabled}
              onValueChange={settings.setHaptics}
              accessibilityLabel={t("settings.haptics")}
              trackColor={{ true: colors.primary }}
            />
          }
          last
        />
      </Section>

      <Section title={t("settings.language")} footer={t("settings.languageHint")}>
        <Row
          label={t("settings.language")}
          value={t("settings.languageValue", { language: languageName })}
          onPress={() => void Linking.openSettings()}
          accessibilityHint={t("settings.openSystemSettings")}
          last
        />
      </Section>

      <Section title={t("settings.about")}>
        <Row label={t("settings.privacy")} icon="shield-checkmark-outline" onPress={() => openPage(LEGAL.privacy)} />
        <Row label={t("settings.terms")} icon="document-text-outline" onPress={() => openPage(LEGAL.terms)} />
        <Row label={t("settings.eula")} icon="reader-outline" onPress={() => openPage(LEGAL.eula)} />
        <Row label={t("settings.version")} value={build ? `${version} (${build})` : version} last />
      </Section>

      <Section>
        <Row label={t("settings.signOut")} icon="log-out-outline" destructive onPress={confirmSignOut} last />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  footnote: { ...typography.footnote, marginTop: spacing.sm, marginHorizontal: spacing.xl + spacing.lg },
});

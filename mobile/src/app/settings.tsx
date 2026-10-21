import { useIsMutating } from "@tanstack/react-query";
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text } from "react-native";
import { DEFAULT_SERVER, api, isApiError } from "@/api";
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

  // App Store guideline 5.1.1(v): the account can be deleted from inside
  // the app. Two confirmations; organizations that would lose their only
  // owner have to be handed over on the web first.
  const deleteAccount = async () => {
    let plan;
    try {
      plan = await api.getDeletionPlan();
    } catch (error) {
      Alert.alert(t("settings.deleteAccountFailed"), isApiError(error) ? error.message : undefined);
      return;
    }
    if (plan.blockers.length > 0) {
      Alert.alert(t("settings.deleteAccountBlockedTitle"), t("settings.deleteAccountBlocked", { names: plan.blockers.map((o) => o.name).join(", ") }), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("settings.openOnWeb"), onPress: () => openPage(`${session.server}/organizations`) },
      ]);
      return;
    }
    const orgs = plan.deleteOrganizations.length
      ? `\n\n${t("settings.deleteAccountOrgs", { names: plan.deleteOrganizations.map((o) => o.name).join(", ") })}`
      : "";
    const email = session.account?.email ?? "";
    const reallyDelete = async () => {
      try {
        await api.deleteAccount(email);
        await session.signOut(t("settings.accountDeleted"));
      } catch (error) {
        Alert.alert(t("settings.deleteAccountFailed"), isApiError(error) ? error.message : undefined);
      }
    };
    Alert.alert(t("settings.deleteAccountTitle"), `${t("settings.deleteAccountMessage")}${orgs}`, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.deleteAccountContinue"),
        style: "destructive",
        onPress: () =>
          Alert.alert(t("settings.deleteAccountConfirmTitle"), t("settings.deleteAccountConfirm", { email }), [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("settings.deleteAccount"), style: "destructive", onPress: () => void reallyDelete() },
          ]),
      },
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
        <Row label={t("settings.signOut")} icon="log-out-outline" destructive onPress={confirmSignOut} />
        <Row label={t("settings.deleteAccount")} icon="trash-outline" destructive onPress={() => void deleteAccount()} last />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  footnote: { ...typography.footnote, marginTop: spacing.sm, marginHorizontal: spacing.xl + spacing.lg },
});

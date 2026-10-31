import Ionicons from "@expo/vector-icons/Ionicons";
import { MotionPressable } from "@/components/MotionPressable";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEFAULT_SERVER, normalizeServerUrl } from "@/api";
import { useSession } from "@/auth/session";
import { useI18n } from "@/i18n";
import { haptics } from "@/lib/haptics";
import { concentricRadius, radius, rounded, spacing, typography, useTheme } from "@/theme";

const wordmark = require("../../assets/wordmark.png") as number;
const WORDMARK_RATIO = 730 / 246;

function hostOf(server: string): string {
  return server.replace(/^https?:\/\//, "");
}

export default function SignInScreen() {
  const session = useSession();
  const { t } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingServer, setEditingServer] = useState(false);
  const [serverDraft, setServerDraft] = useState(session.server);
  const [serverError, setServerError] = useState<string | null>(null);

  const message = error ?? session.notice;

  const signIn = async () => {
    if (busy) return;
    haptics.tap();
    setBusy(true);
    setError(null);
    session.clearNotice();
    const result = await session.signIn();
    setBusy(false);
    if (!result.ok && !result.cancelled) setError(result.error);
  };

  const saveServer = async (value: string) => {
    const normalized = normalizeServerUrl(value);
    if (!normalized) {
      haptics.error();
      setServerError(t("signIn.serverInvalid"));
      return;
    }
    haptics.selection();
    setServerError(null);
    setServerDraft(normalized);
    await session.setServer(normalized);
    setEditingServer(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Image
            source={wordmark}
            style={[styles.wordmark, { tintColor: colors.text }]}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="Guidon"
          />
          <Text style={[styles.tagline, { color: colors.textMuted }]}>{t("signIn.tagline")}</Text>
        </View>

        <View style={styles.actions}>
          {message ? (
            <View
              style={[styles.message, rounded(radius.control), { backgroundColor: colors.surfaceMuted }]}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Ionicons name="information-circle" size={20} color={error ? colors.danger : colors.warning} />
              <Text style={[styles.messageText, { color: colors.text }]}>{message}</Text>
            </View>
          ) : null}

          <MotionPressable
            onPress={signIn}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("signIn.button")}
            accessibilityState={{ busy, disabled: busy }}
            style={[
              styles.primary,
              rounded(radius.control + 2),
              { backgroundColor: colors.primary, opacity: busy ? 0.85 : 1 },
            ]}
          >
            {busy ? <ActivityIndicator color={colors.onPrimary} /> : null}
            <Text style={[styles.primaryText, { color: colors.onPrimary }]}>
              {busy ? t("signIn.signingIn") : t("signIn.button")}
            </Text>
          </MotionPressable>

          <Text style={[styles.serverCaption, { color: colors.textMuted }]}>
            {t("signIn.serverCaption", { server: hostOf(session.server) })}
          </Text>

          {editingServer ? (
            <View style={[styles.serverCard, rounded(radius.card), { backgroundColor: colors.surface }]}>
              <Text style={[styles.label, { color: colors.textMuted }]}>{t("signIn.serverLabel")}</Text>
              <TextInput
                value={serverDraft}
                onChangeText={(text) => {
                  setServerDraft(text);
                  setServerError(null);
                }}
                onSubmitEditing={() => saveServer(serverDraft)}
                placeholder={t("signIn.serverPlaceholder")}
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textContentType="URL"
                returnKeyType="done"
                autoFocus
                accessibilityLabel={t("signIn.serverLabel")}
                style={[
                  styles.input,
                  rounded(concentricRadius(radius.card, spacing.md, 8)),
                  { color: colors.text, backgroundColor: colors.surfaceMuted },
                ]}
              />
              {serverError ? <Text style={[styles.serverError, { color: colors.danger }]}>{serverError}</Text> : null}
              <View style={styles.serverButtons}>
                <Pressable
                  onPress={() => saveServer(DEFAULT_SERVER)}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={styles.linkButton}
                >
                  <Text style={[styles.link, { color: colors.textMuted }]}>{t("signIn.useDefault")}</Text>
                </Pressable>
                <Pressable
                  onPress={() => saveServer(serverDraft)}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={styles.linkButton}
                >
                  <Text style={[styles.link, styles.bold, { color: colors.primary }]}>{t("common.save")}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setServerDraft(session.server);
                setEditingServer(true);
              }}
              accessibilityRole="button"
              hitSlop={8}
              style={styles.linkButton}
            >
              <Text style={[styles.link, { color: colors.primary }]}>{t("signIn.selfHosted")}</Text>
            </Pressable>
          )}

          <Text style={[styles.footnote, { color: colors.textMuted }]}>{t("signIn.footnote")}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: spacing.xl, justifyContent: "space-between", gap: spacing.xxl },
  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg, minHeight: 220 },
  wordmark: { width: 220, height: 220 / WORDMARK_RATIO },
  tagline: { ...typography.callout, textAlign: "center", maxWidth: 300, lineHeight: 22 },
  actions: { gap: spacing.md, width: "100%", maxWidth: 440, alignSelf: "center" },
  message: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, alignItems: "flex-start" },
  messageText: { ...typography.subhead, flex: 1, lineHeight: 20 },
  primary: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  primaryText: { ...typography.headline },
  serverCaption: { ...typography.footnote, textAlign: "center" },
  serverCard: { padding: spacing.md, gap: spacing.sm },
  label: { ...typography.footnote, fontWeight: "600" },
  input: { ...typography.body, paddingHorizontal: spacing.md, paddingVertical: spacing.md - 2 },
  serverError: { ...typography.footnote },
  serverButtons: { flexDirection: "row", justifyContent: "space-between" },
  linkButton: { alignSelf: "center", paddingVertical: spacing.xs },
  link: { ...typography.subhead },
  bold: { fontWeight: "600" },
  footnote: { ...typography.caption, textAlign: "center", lineHeight: 17, marginTop: spacing.sm },
});

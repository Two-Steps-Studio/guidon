import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useI18n } from "@/i18n";
import { radius, rounded, spacing, typography, useTheme } from "@/theme";

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} accessible accessibilityLabel={message ? `${title}. ${message}` : title}>
      <Ionicons name={icon} size={40} color={colors.textFaint} />
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.wrap}>
      <Ionicons name="warning-outline" size={40} color={colors.textFaint} />
      <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          rounded(radius.control),
          { backgroundColor: pressed ? colors.surfacePressed : colors.surfaceMuted },
        ]}
      >
        <Text style={[styles.buttonText, { color: colors.primary }]}>{t("common.retry")}</Text>
      </Pressable>
    </View>
  );
}

export function LoadingState() {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={colors.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: 64, paddingHorizontal: spacing.xxl, gap: spacing.md },
  title: { ...typography.headline, textAlign: "center" },
  message: { ...typography.subhead, textAlign: "center", lineHeight: 21 },
  button: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, marginTop: spacing.sm },
  buttonText: { ...typography.headline },
});

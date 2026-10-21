import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, rounded, spacing, typography, useTheme } from "@/theme";

/** Grouped "inset" section, the native settings-list look on both platforms. */
export function Section({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      {title ? (
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={[styles.group, rounded(radius.card), { backgroundColor: colors.surface }]}>{children}</View>
      {footer ? <Text style={[styles.footer, { color: colors.textMuted }]}>{footer}</Text> : null}
    </View>
  );
}

type RowProps = {
  label: string;
  value?: string;
  valueColor?: string;
  dotColor?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityHint?: string;
  destructive?: boolean;
  right?: ReactNode;
  last?: boolean;
};

export function Row({
  label,
  value,
  valueColor,
  dotColor,
  icon,
  onPress,
  accessibilityHint,
  destructive,
  right,
  last,
}: RowProps) {
  const { colors } = useTheme();
  const content = (
    <>
      {icon ? <Ionicons name={icon} size={20} color={destructive ? colors.danger : colors.textMuted} /> : null}
      <Text style={[styles.label, { color: destructive ? colors.danger : colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.valueWrap}>
        {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
        {value ? (
          <Text style={[styles.value, { color: valueColor ?? colors.textMuted }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {right}
        {onPress && !destructive ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null}
      </View>
    </>
  );
  const border = last ? null : { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border };

  if (!onPress) {
    return (
      <View style={[styles.row, border]} accessible accessibilityLabel={value ? `${label}, ${value}` : label}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.row, border, pressed && { backgroundColor: colors.surfacePressed }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionTitle: {
    ...typography.footnote,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginLeft: spacing.lg,
  },
  group: { overflow: "hidden" },
  footer: { ...typography.footnote, marginTop: spacing.sm, marginHorizontal: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  label: { ...typography.body, flexShrink: 0 },
  valueWrap: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing.sm },
  value: { ...typography.body, flexShrink: 1, textAlign: "right" },
  dot: { width: 10, height: 10, borderRadius: 5 },
});

import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/i18n";
import { ConcentricSurface } from "./ConcentricSurface";
import { haptics } from "@/lib/haptics";
import { concentricRadius, radius, rounded, spacing, typography, useTheme } from "@/theme";

export type SheetOption = { key: string; label: string; color?: string; selected?: boolean };

type Props = {
  visible: boolean;
  title: string;
  options: readonly SheetOption[];
  onSelect: (key: string) => void;
  onClose: () => void;
};

const SHEET_PADDING = spacing.sm;

/** Bottom sheet with a list of choices (columns, priorities). Same look on iOS and Android. */
export function OptionSheet({ visible, title, options, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useI18n();
  const rowRadius = concentricRadius(radius.sheet, SHEET_PADDING);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
      />
      <ConcentricSurface
        color={colors.surface}
        radius={radius.sheet}
        style={[styles.sheet, { padding: SHEET_PADDING, bottom: Math.max(insets.bottom, spacing.sm) }]}
        accessibilityViewIsModal
      >
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        <Text style={[styles.title, { color: colors.textMuted }]} accessibilityRole="header">
          {title}
        </Text>
        <ScrollView bounces={false} style={styles.list}>
          {options.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => {
                haptics.selection();
                onSelect(option.key);
              }}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: !!option.selected }}
              style={({ pressed }) => [
                styles.row,
                rounded(rowRadius),
                { backgroundColor: pressed ? colors.surfacePressed : option.selected ? colors.surfaceMuted : "transparent" },
              ]}
            >
              {option.color ? <View style={[styles.dot, { backgroundColor: option.color }]} /> : null}
              <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
                {option.label}
              </Text>
              {option.selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </ConcentricSurface>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill },
  sheet: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    maxHeight: "70%",
  },
  grabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, marginTop: 2, marginBottom: spacing.sm },
  title: { ...typography.footnote, fontWeight: "600", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  list: { flexGrow: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { ...typography.body, flex: 1 },
});

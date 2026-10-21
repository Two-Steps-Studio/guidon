import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/i18n";
import { dueDateToLocal, dueState, formatDueDate, localDayToApi } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { radius, spacing, typography, useTheme } from "@/theme";
import { ConcentricSurface } from "./ConcentricSurface";
import { Row } from "./Rows";

type Props = {
  /** The task's due_date (ISO, UTC midnight) or null. */
  value: string | null;
  done?: boolean;
  /** "YYYY-MM-DD" or null to remove. */
  onChange: (day: string | null) => void;
  last?: boolean;
};

/** A due-date row: the native date picker (dialog on Android, inline calendar sheet on iOS). */
export function DueDateField({ value, done = false, onChange, last }: Props) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => dueDateToLocal(value));

  const state = value ? dueState(value, done) : "none";
  const label = value ? formatDueDate(value) : t("common.none");

  const open = () => {
    const initial = dueDateToLocal(value);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initial,
        mode: "date",
        onChange: (event, date) => {
          if (event.type === "set" && date) {
            haptics.selection();
            onChange(localDayToApi(date));
          }
        },
      });
    } else {
      setDraft(initial);
      setIosOpen(true);
    }
  };

  return (
    <>
      <Row
        label={t("task.dueDate")}
        value={label}
        valueColor={state === "overdue" ? colors.danger : undefined}
        onPress={open}
        accessibilityHint={t("task.setDate")}
        last={last && !value}
      />
      {value ? (
        <Row label={t("task.clearDate")} onPress={() => onChange(null)} destructive icon="close-circle-outline" last={last} />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal visible={iosOpen} transparent animationType="fade" onRequestClose={() => setIosOpen(false)}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
            onPress={() => setIosOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
          />
          <ConcentricSurface
            color={colors.surface}
            radius={radius.sheet}
            style={[styles.sheet, { bottom: Math.max(insets.bottom, spacing.sm) }]}
            accessibilityViewIsModal
          >
            <View style={styles.header}>
              <Pressable onPress={() => setIosOpen(false)} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.headerButton, { color: colors.textMuted }]}>{t("common.cancel")}</Text>
              </Pressable>
              <Text style={[styles.headerTitle, { color: colors.text }]} accessibilityRole="header">
                {t("task.pickDate")}
              </Text>
              <Pressable
                onPress={() => {
                  setIosOpen(false);
                  haptics.selection();
                  onChange(localDayToApi(draft));
                }}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={[styles.headerButton, styles.bold, { color: colors.primary }]}>{t("common.done")}</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={draft}
              mode="date"
              display="inline"
              accentColor={colors.primary}
              onChange={(_event, date) => {
                if (date) setDraft(date);
              }}
            />
          </ConcentricSurface>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { position: "absolute", left: spacing.sm, right: spacing.sm, padding: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: spacing.sm },
  headerTitle: { ...typography.headline },
  headerButton: { ...typography.body },
  bold: { fontWeight: "600" },
});

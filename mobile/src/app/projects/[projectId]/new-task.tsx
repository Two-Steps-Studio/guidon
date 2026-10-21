import * as Crypto from "expo-crypto";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { DueDateField } from "@/components/DueDateField";
import { OptionSheet } from "@/components/OptionSheet";
import { Row, Section } from "@/components/Rows";
import { useI18n } from "@/i18n";
import { columnColor, columnLabel, priorityColor, priorityLabel, TEMP_ID_PREFIX } from "@/lib/board";
import { apiDayToIso } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { useColumns, useCreateTask, usePriorities } from "@/query/hooks";
import { radius, rounded, spacing, typography, useTheme } from "@/theme";

export default function NewTaskScreen() {
  const { projectId, status: initialStatus } = useLocalSearchParams<{ projectId: string; status?: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { colors } = useTheme();
  const columns = useColumns(projectId).data ?? [];
  const priorities = usePriorities(projectId).data;
  const { mutate: createTask } = useCreateTask();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string>(
    initialStatus && columns.some((c) => c.status === initialStatus) ? initialStatus : (columns[0]?.status ?? "backlog")
  );
  const [priority, setPriority] = useState<string>("medium");
  const [dueDay, setDueDay] = useState<string | null>(null);
  const [picker, setPicker] = useState<"status" | "priority" | null>(null);
  const [titleError, setTitleError] = useState(false);

  const column = columns.find((c) => c.status === status);
  const priorityKeys = useMemo(
    () => (priorities && priorities.length > 0 ? priorities.map((p) => p.key) : ["critical", "high", "medium", "low"]),
    [priorities]
  );

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      haptics.error();
      setTitleError(true);
      return;
    }
    createTask({
      projectId,
      tempId: `${TEMP_ID_PREFIX}${Crypto.randomUUID()}`,
      input: {
        title: trimmed,
        description: description.trim() || null,
        status,
        priority,
        due_date: dueDay,
      },
      isDone: column?.is_done ?? status === "done",
      createdAt: new Date().toISOString(),
    });
    router.back();
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10}>
              <Text style={[styles.headerButton, { color: colors.primary }]}>{t("common.cancel")}</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={submit} accessibilityRole="button" accessibilityLabel={t("newTask.create")} hitSlop={10}>
              <Text style={[styles.headerButton, styles.bold, { color: colors.primary }]}>{t("newTask.create")}</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextInput
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              if (titleError) setTitleError(false);
            }}
            placeholder={t("newTask.titlePlaceholder")}
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={t("task.title")}
            autoFocus
            multiline
            returnKeyType="next"
            submitBehavior="blurAndSubmit"
            style={[
              styles.title,
              rounded(radius.card),
              { color: colors.text, backgroundColor: colors.surface, borderColor: titleError ? colors.danger : "transparent" },
            ]}
          />
          {titleError ? (
            <Text style={[styles.error, { color: colors.danger }]} accessibilityRole="alert">
              {t("task.titleRequired")}
            </Text>
          ) : null}
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t("newTask.descriptionPlaceholder")}
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={t("task.description")}
            multiline
            textAlignVertical="top"
            style={[styles.description, rounded(radius.card), { color: colors.text, backgroundColor: colors.surface }]}
          />

          <Section>
            <Row
              label={t("newTask.column")}
              value={column ? columnLabel(column) : status}
              dotColor={column ? columnColor(column, colors) : undefined}
              onPress={() => setPicker("status")}
            />
            <Row
              label={t("task.priority")}
              value={priorityLabel(priority, priorities)}
              dotColor={priorityColor(priority, priorities, colors)}
              onPress={() => setPicker("priority")}
            />
            <DueDateField value={dueDay ? apiDayToIso(dueDay) : null} onChange={setDueDay} last />
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={picker === "status"}
        title={t("task.pickStatus")}
        options={columns.map((c) => ({
          key: c.status,
          label: columnLabel(c),
          color: columnColor(c, colors),
          selected: c.status === status,
        }))}
        onClose={() => setPicker(null)}
        onSelect={(key) => {
          setStatus(key);
          setPicker(null);
        }}
      />
      <OptionSheet
        visible={picker === "priority"}
        title={t("task.pickPriority")}
        options={priorityKeys.map((key) => ({
          key,
          label: priorityLabel(key, priorities),
          color: priorityColor(key, priorities, colors),
          selected: key === priority,
        }))}
        onClose={() => setPicker(null)}
        onSelect={(key) => {
          setPriority(key);
          setPicker(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  headerButton: { ...typography.body },
  bold: { fontWeight: "600" },
  title: {
    ...typography.headline,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
    borderWidth: 1,
  },
  error: { ...typography.footnote, marginHorizontal: spacing.xl, marginTop: spacing.xs },
  description: {
    ...typography.body,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 110,
  },
});

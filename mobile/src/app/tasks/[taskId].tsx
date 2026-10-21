import Ionicons from "@expo/vector-icons/Ionicons";
import * as Crypto from "expo-crypto";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { isApiError, type Comment } from "@/api";
import { useSession } from "@/auth/session";
import { DueDateField } from "@/components/DueDateField";
import { OptionSheet } from "@/components/OptionSheet";
import { RichText } from "@/components/RichText";
import { Row, Section } from "@/components/Rows";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useI18n } from "@/i18n";
import {
  columnColor,
  columnLabel,
  isTaskDone,
  isTempId,
  normalizeStatus,
  priorityColor,
  priorityLabel,
  statusLabel,
  TEMP_ID_PREFIX,
} from "@/lib/board";
import { formatDateTime } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import {
  useAddComment,
  useColumns,
  useComments,
  usePriorities,
  useSetStatus,
  useTask,
  useTasks,
  useUpdateTask,
} from "@/query/hooks";
import { concentricRadius, radius, rounded, spacing, typography, useTheme } from "@/theme";

const CARD_PADDING = spacing.lg;

export default function TaskScreen() {
  const params = useLocalSearchParams<{ taskId: string; projectId?: string }>();
  const taskId = params.taskId;
  const router = useRouter();
  const { t } = useI18n();
  const { colors } = useTheme();
  const session = useSession();

  const taskQuery = useTask(taskId, params.projectId);
  const task = taskQuery.data;
  const projectId = params.projectId ?? task?.project_id ?? "";
  const columns = useColumns(projectId).data;
  const priorities = usePriorities(projectId).data;
  const projectTasks = useTasks(projectId).data;
  const comments = useComments(taskId, !isTempId(taskId));

  const { mutate: setStatus } = useSetStatus();
  const { mutate: updateTask } = useUpdateTask();
  const { mutate: addComment } = useAddComment();

  // null while not editing: the field then shows the cached (server) title.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [picker, setPicker] = useState<"status" | "priority" | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const subtasks = useMemo(
    () => (projectTasks ?? []).filter((item) => item.parent_task_id === taskId),
    [projectTasks, taskId]
  );

  if (!task) {
    if (taskQuery.isPending) return <LoadingState />;
    if (isApiError(taskQuery.error) && taskQuery.error.status === 404) {
      return <EmptyState icon="document-outline" title={t("task.notFound")} />;
    }
    return (
      <ErrorState
        message={t("errors.loadFailed", { message: taskQuery.error?.message ?? "" })}
        onRetry={() => void taskQuery.refetch()}
      />
    );
  }

  const status = normalizeStatus(task.status);
  const column = columns?.find((c) => c.status === status);
  const done = isTaskDone(task, columns);
  const priorityKeys =
    priorities && priorities.length > 0 ? priorities.map((p) => p.key) : ["critical", "high", "medium", "low"];

  const commitTitle = () => {
    const trimmed = (titleDraft ?? task.title).trim();
    setTitleDraft(null);
    if (!trimmed) {
      haptics.error();
      return;
    }
    if (trimmed !== task.title) updateTask({ projectId: task.project_id, taskId, patch: { title: trimmed } });
  };

  const saveDescription = () => {
    const next = descriptionDraft.trim();
    setEditingDescription(false);
    if (next !== (task.description ?? "")) {
      updateTask({ projectId: task.project_id, taskId, patch: { description: next || null } });
    }
  };

  const sendComment = () => {
    const content = commentDraft.trim();
    if (!content) return;
    addComment({
      taskId,
      tempId: `${TEMP_ID_PREFIX}${Crypto.randomUUID()}`,
      content,
      createdAt: new Date().toISOString(),
    });
    setCommentDraft("");
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([taskQuery.refetch(), comments.refetch()]);
    setRefreshing(false);
  };

  const authorName = (comment: Comment) => {
    if (comment.actor_label) return comment.actor_label;
    if (session.selfUserId && comment.author_id === session.selfUserId) return t("task.you");
    if (isTempId(comment.id)) return t("task.you");
    return t("task.teammate");
  };

  const pending = isTempId(task.id);

  return (
    <>
      <Stack.Screen options={{ title: statusLabel(task.status, columns) }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
        >
          {pending ? (
            <Text style={[styles.pendingHint, { color: colors.textMuted }]}>{t("task.pendingHint")}</Text>
          ) : null}

          <TextInput
            value={titleDraft ?? task.title}
            onChangeText={setTitleDraft}
            onFocus={() => setTitleDraft(task.title)}
            onBlur={commitTitle}
            editable={!pending}
            multiline
            submitBehavior="blurAndSubmit"
            returnKeyType="done"
            accessibilityLabel={t("task.title")}
            style={[styles.title, { color: colors.text }, done && { color: colors.textMuted }]}
          />

          <Section>
            <Row
              label={t("task.status")}
              value={column ? columnLabel(column) : statusLabel(task.status, columns)}
              dotColor={column ? columnColor(column, colors) : undefined}
              onPress={pending ? undefined : () => setPicker("status")}
              accessibilityHint={t("task.pickStatus")}
            />
            <Row
              label={t("task.priority")}
              value={priorityLabel(task.priority, priorities)}
              dotColor={priorityColor(task.priority, priorities, colors)}
              onPress={pending ? undefined : () => setPicker("priority")}
              accessibilityHint={t("task.pickPriority")}
            />
            <DueDateField
              value={task.due_date}
              done={done}
              onChange={(day) => updateTask({ projectId: task.project_id, taskId, patch: { due_date: day } })}
              last
            />
          </Section>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]} accessibilityRole="header">
              {t("task.description")}
            </Text>
            {!editingDescription && !pending ? (
              <Pressable
                onPress={() => {
                  setDescriptionDraft(task.description ?? "");
                  setEditingDescription(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${t("common.edit")} ${t("task.description")}`}
                hitSlop={10}
              >
                <Text style={[styles.link, { color: colors.primary }]}>{t("common.edit")}</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={[styles.card, rounded(radius.card), { backgroundColor: colors.surface }]}>
            {editingDescription ? (
              <>
                <TextInput
                  value={descriptionDraft}
                  onChangeText={setDescriptionDraft}
                  multiline
                  autoFocus
                  textAlignVertical="top"
                  accessibilityLabel={t("task.description")}
                  style={[
                    styles.descriptionInput,
                    rounded(concentricRadius(radius.card, CARD_PADDING, 8)),
                    { color: colors.text, backgroundColor: colors.surfaceMuted },
                  ]}
                />
                <View style={styles.editActions}>
                  <Pressable onPress={() => setEditingDescription(false)} accessibilityRole="button" hitSlop={8}>
                    <Text style={[styles.link, { color: colors.textMuted }]}>{t("common.cancel")}</Text>
                  </Pressable>
                  <Pressable onPress={saveDescription} accessibilityRole="button" hitSlop={8}>
                    <Text style={[styles.link, styles.bold, { color: colors.primary }]}>{t("common.save")}</Text>
                  </Pressable>
                </View>
              </>
            ) : task.description ? (
              <RichText text={task.description} />
            ) : (
              <Text style={[styles.placeholder, { color: colors.textFaint }]}>{t("task.addDescription")}</Text>
            )}
          </View>

          {subtasks.length > 0 ? (
            <Section title={t("task.subtasks")}>
              {subtasks.map((subtask, index) => {
                const subDone = isTaskDone(subtask, columns);
                return (
                  <Row
                    key={subtask.id}
                    icon={subDone ? "checkmark-circle" : "ellipse-outline"}
                    label={subtask.title}
                    value={statusLabel(subtask.status, columns)}
                    onPress={
                      isTempId(subtask.id)
                        ? undefined
                        : () =>
                            router.push({
                              pathname: "/tasks/[taskId]",
                              params: { taskId: subtask.id, projectId: task.project_id },
                            })
                    }
                    last={index === subtasks.length - 1}
                  />
                );
              })}
            </Section>
          ) : null}

          <Text style={[styles.sectionTitle, styles.commentsTitle, { color: colors.textMuted }]} accessibilityRole="header">
            {t("task.comments")}
          </Text>
          <View style={[styles.card, rounded(radius.card), { backgroundColor: colors.surface }]}>
            {comments.isPending && !pending ? (
              <ActivityIndicator color={colors.textMuted} />
            ) : (comments.data ?? []).length === 0 ? (
              <Text style={[styles.placeholder, { color: colors.textFaint }]}>{t("task.noComments")}</Text>
            ) : (
              (comments.data ?? []).map((comment, index) => (
                <View
                  key={comment.id}
                  style={[
                    styles.comment,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                    isTempId(comment.id) && styles.pendingComment,
                  ]}
                >
                  <View style={styles.commentHeader}>
                    <Text style={[styles.commentAuthor, { color: colors.text }]}>{authorName(comment)}</Text>
                    <Text style={[styles.commentTime, { color: colors.textMuted }]}>
                      {isTempId(comment.id) ? t("board.waiting") : formatDateTime(comment.created_at)}
                    </Text>
                  </View>
                  <RichText text={comment.content} />
                </View>
              ))
            )}
          </View>

          {!pending ? (
            <View style={[styles.composer, rounded(radius.card), { backgroundColor: colors.surface }]}>
              <TextInput
                value={commentDraft}
                onChangeText={setCommentDraft}
                placeholder={t("task.addComment")}
                placeholderTextColor={colors.textFaint}
                multiline
                accessibilityLabel={t("task.addComment")}
                style={[
                  styles.composerInput,
                  rounded(concentricRadius(radius.card, spacing.sm, 8)),
                  { color: colors.text, backgroundColor: colors.surfaceMuted },
                ]}
              />
              <Pressable
                onPress={sendComment}
                disabled={!commentDraft.trim()}
                accessibilityRole="button"
                accessibilityLabel={t("task.send")}
                accessibilityState={{ disabled: !commentDraft.trim() }}
                style={[
                  styles.send,
                  { backgroundColor: commentDraft.trim() ? colors.primary : colors.surfaceMuted },
                ]}
              >
                <Ionicons name="arrow-up" size={20} color={commentDraft.trim() ? colors.onPrimary : colors.textFaint} />
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={picker === "status"}
        title={t("task.pickStatus")}
        options={(columns ?? []).map((c) => ({
          key: c.status,
          label: columnLabel(c),
          color: columnColor(c, colors),
          selected: c.status === status,
        }))}
        onClose={() => setPicker(null)}
        onSelect={(key) => {
          setPicker(null);
          const target = columns?.find((c) => c.status === key);
          if (target && key !== status) {
            setStatus({ projectId: task.project_id, taskId, status: key, isDone: target.is_done });
          }
        }}
      />
      <OptionSheet
        visible={picker === "priority"}
        title={t("task.pickPriority")}
        options={priorityKeys.map((key) => ({
          key,
          label: priorityLabel(key, priorities),
          color: priorityColor(key, priorities, colors),
          selected: key === task.priority,
        }))}
        onClose={() => setPicker(null)}
        onSelect={(key) => {
          setPicker(null);
          if (key !== task.priority) updateTask({ projectId: task.project_id, taskId, patch: { priority: key } });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xxl + spacing.xl },
  pendingHint: { ...typography.footnote, marginHorizontal: spacing.xl, marginTop: spacing.md },
  title: {
    ...typography.title,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: spacing.xl + spacing.xs,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...typography.footnote, fontWeight: "600", textTransform: "uppercase" },
  commentsTitle: { marginHorizontal: spacing.xl + spacing.xs, marginTop: spacing.xl, marginBottom: spacing.sm },
  link: { ...typography.subhead },
  bold: { fontWeight: "600" },
  card: { marginHorizontal: spacing.lg, padding: CARD_PADDING, gap: spacing.sm },
  placeholder: { ...typography.callout },
  descriptionInput: { ...typography.callout, minHeight: 140, padding: spacing.md },
  editActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.xl, paddingTop: spacing.xs },
  comment: { paddingVertical: spacing.sm, gap: spacing.xs },
  pendingComment: { opacity: 0.6 },
  commentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: spacing.sm },
  commentAuthor: { ...typography.subhead, fontWeight: "600" },
  commentTime: { ...typography.caption },
  composer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.sm,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  composerInput: { ...typography.callout, flex: 1, minHeight: 40, maxHeight: 140, paddingHorizontal: spacing.md, paddingVertical: 9 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});

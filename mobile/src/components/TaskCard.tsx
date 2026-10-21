import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useCallback, useRef } from "react";
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from "react-native";
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import type { Task } from "@/api";
import { useI18n } from "@/i18n";
import { isTempId, type SubtaskProgress } from "@/lib/board";
import { dueState, formatDueDate } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { concentricRadius, onColor, radius, rounded, spacing, typography, useTheme } from "@/theme";

export type ColumnRef = { status: string; label: string; color: string; isDone: boolean };

type Props = {
  task: Task;
  done: boolean;
  priorityColor: string;
  priorityLabel: string;
  progress: SubtaskProgress | undefined;
  /** Set when the task is assigned to the signed-in person. */
  selfInitials: string | null;
  isAssignedToSelf: boolean;
  prevColumn: ColumnRef | null;
  nextColumn: ColumnRef | null;
  onOpen: (task: Task) => void;
  onLongPress: (task: Task) => void;
  onMove: (task: Task, column: ColumnRef) => void;
};

const CARD_PADDING = spacing.md;
const INNER_RADIUS = concentricRadius(radius.card, CARD_PADDING, 6);
const ACTION_WIDTH = 140;

function SwipeAction({ column, align }: { column: ColumnRef; align: "left" | "right" }) {
  const { t } = useI18n();
  const foreground = onColor(column.color);
  return (
    <View
      style={[
        styles.action,
        rounded(radius.card),
        { backgroundColor: column.color, alignItems: align === "left" ? "flex-start" : "flex-end" },
      ]}
    >
      <Ionicons
        name={align === "left" ? "arrow-back" : "arrow-forward"}
        size={18}
        color={foreground}
      />
      <Text style={[styles.actionText, { color: foreground }]} numberOfLines={2}>
        {t("board.moveToColumn", { column: column.label })}
      </Text>
    </View>
  );
}

export const TaskCard = memo(function TaskCard({
  task,
  done,
  priorityColor,
  priorityLabel,
  progress,
  selfInitials,
  isAssignedToSelf,
  prevColumn,
  nextColumn,
  onOpen,
  onLongPress,
  onMove,
}: Props) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const swipeable = useRef<SwipeableMethods>(null);
  const pending = isTempId(task.id);

  const due = task.due_date ? dueState(task.due_date, done) : "none";
  const dueText = task.due_date ? formatDueDate(task.due_date) : null;
  const dueColor = due === "overdue" ? colors.danger : due === "soon" ? colors.warning : colors.textMuted;

  const handleOpen = useCallback((direction: SwipeDirection) => {
    // RIGHT = the card moved right, revealing the left-hand (previous column) action.
    const target = direction === SwipeDirection.RIGHT ? prevColumn : nextColumn;
    swipeable.current?.close();
    if (target) onMove(task, target);
  }, [nextColumn, onMove, prevColumn, task]);

  const a11yParts = [task.title, priorityLabel];
  if (dueText) a11yParts.push(due === "overdue" ? t("board.overdue", { date: dueText }) : t("board.due", { date: dueText }));
  if (progress) a11yParts.push(t("board.subtasks", { done: progress.done, total: progress.total }));
  if (task.assignee_id) a11yParts.push(isAssignedToSelf ? t("board.assignedToYou") : t("board.assigned"));
  if (pending) a11yParts.push(t("board.waiting"));

  const a11yActions = [
    ...(prevColumn ? [{ name: "movePrev", label: t("board.moveToColumn", { column: prevColumn.label }) }] : []),
    ...(nextColumn ? [{ name: "moveNext", label: t("board.moveToColumn", { column: nextColumn.label }) }] : []),
    { name: "longpress", label: t("board.moveTo") },
  ];
  const onA11yAction = (event: AccessibilityActionEvent) => {
    if (pending) return;
    if (event.nativeEvent.actionName === "movePrev" && prevColumn) onMove(task, prevColumn);
    else if (event.nativeEvent.actionName === "moveNext" && nextColumn) onMove(task, nextColumn);
    else if (event.nativeEvent.actionName === "longpress") onLongPress(task);
  };

  const card = (
    <Pressable
      onPress={pending ? undefined : () => onOpen(task)}
      onLongPress={pending ? undefined : () => onLongPress(task)}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={a11yParts.join(", ")}
      accessibilityHint={pending ? undefined : t("board.cardHint")}
      accessibilityState={{ disabled: pending }}
      accessibilityActions={pending ? undefined : a11yActions}
      onAccessibilityAction={onA11yAction}
      style={({ pressed }) => [
        styles.card,
        rounded(radius.card),
        {
          backgroundColor: pressed ? colors.surfacePressed : colors.surface,
          borderColor: colors.border,
          opacity: pending ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.titleRow}>
        <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
        <Text
          style={[styles.title, { color: colors.text }, done && { color: colors.textMuted, textDecorationLine: "line-through" }]}
          numberOfLines={3}
        >
          {task.title}
        </Text>
      </View>

      <View style={styles.metaRow}>
        {dueText ? (
          <View style={[styles.chip, rounded(INNER_RADIUS), { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name={due === "overdue" ? "alert-circle" : "calendar-outline"} size={13} color={dueColor} />
            <Text style={[styles.chipText, { color: dueColor }, due === "overdue" && styles.bold]}>{dueText}</Text>
          </View>
        ) : null}
        {progress ? (
          <View style={[styles.chip, rounded(INNER_RADIUS), { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons
              name={progress.done === progress.total ? "checkmark-circle" : "git-branch-outline"}
              size={13}
              color={progress.done === progress.total ? colors.success : colors.textMuted}
            />
            <Text style={[styles.chipText, { color: colors.textMuted }]}>
              {progress.done}/{progress.total}
            </Text>
          </View>
        ) : null}
        {pending ? (
          <View style={[styles.chip, rounded(INNER_RADIUS), { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name="cloud-upload-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.chipText, { color: colors.textMuted }]}>{t("board.waiting")}</Text>
          </View>
        ) : null}
        <View style={styles.spacer} />
        {task.assignee_id ? (
          <View style={[styles.avatar, { backgroundColor: isAssignedToSelf ? colors.primary : colors.surfaceMuted }]}>
            {isAssignedToSelf && selfInitials ? (
              <Text style={[styles.avatarText, { color: colors.onPrimary }]}>{selfInitials}</Text>
            ) : (
              <Ionicons name="person" size={13} color={colors.textMuted} />
            )}
          </View>
        ) : null}
      </View>
    </Pressable>
  );

  if (pending || (!prevColumn && !nextColumn)) return <View style={styles.wrap}>{card}</View>;

  return (
    <View style={styles.wrap}>
      <ReanimatedSwipeable
        ref={swipeable}
        friction={1.6}
        leftThreshold={ACTION_WIDTH * 0.6}
        rightThreshold={ACTION_WIDTH * 0.6}
        overshootLeft={false}
        overshootRight={false}
        onSwipeableWillOpen={() => haptics.selection()}
        onSwipeableOpen={handleOpen}
        renderLeftActions={prevColumn ? () => <SwipeAction column={prevColumn} align="left" /> : undefined}
        renderRightActions={nextColumn ? () => <SwipeAction column={nextColumn} align="right" /> : undefined}
      >
        {card}
      </ReanimatedSwipeable>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs + 1 },
  card: {
    padding: CARD_PADDING,
    gap: spacing.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm + 2 },
  priorityDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  title: { ...typography.callout, fontWeight: "500", flex: 1, lineHeight: 21 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2, minHeight: 24 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3 },
  chipText: { ...typography.caption },
  bold: { fontWeight: "600" },
  spacer: { flex: 1 },
  avatar: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 10, fontWeight: "700" },
  action: {
    width: ACTION_WIDTH,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    gap: 4,
  },
  actionText: { ...typography.footnote, fontWeight: "600" },
});

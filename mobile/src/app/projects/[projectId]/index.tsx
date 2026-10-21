import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, I18nManager, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { ReduceMotion, SlideInLeft, SlideInRight } from "react-native-reanimated";
import type { Task } from "@/api";
import { useSession } from "@/auth/session";
import { Fab } from "@/components/Fab";
import { OptionSheet } from "@/components/OptionSheet";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { SyncBanner } from "@/components/SyncBanner";
import { TaskCard, type ColumnRef } from "@/components/TaskCard";
import { useI18n } from "@/i18n";
import { buildBoard, columnColor, columnLabel, initials, normalizeStatus, priorityColor, priorityLabel } from "@/lib/board";
import { haptics } from "@/lib/haptics";
import { useColumns, usePriorities, useProjects, useSetStatus, useTasks } from "@/query/hooks";
import { onColor, radius, rounded, spacing, typography, useTheme } from "@/theme";

export default function BoardScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { colors } = useTheme();
  const session = useSession();

  const projects = useProjects();
  const columnsQuery = useColumns(projectId);
  const prioritiesQuery = usePriorities(projectId);
  const tasksQuery = useTasks(projectId);
  const { mutate: setStatus } = useSetStatus();

  const project = projects.data?.find((p) => p.id === projectId);
  const priorities = prioritiesQuery.data;

  const columns = useMemo<ColumnRef[]>(
    () =>
      (columnsQuery.data ?? []).map((column) => ({
        status: column.status,
        label: columnLabel(column),
        color: columnColor(column, colors),
        isDone: column.is_done,
      })),
    [columnsQuery.data, colors]
  );

  const board = useMemo(
    () => buildBoard(tasksQuery.data ?? [], columnsQuery.data ?? [], priorities),
    [tasksQuery.data, columnsQuery.data, priorities]
  );

  const [selected, setSelected] = useState<string | null>(null);
  const activeIndex = Math.max(0, columns.findIndex((c) => c.status === selected));
  const active = columns[activeIndex] ?? null;
  const prevColumn = columns[activeIndex - 1] ?? null;
  const nextColumn = columns[activeIndex + 1] ?? null;

  // An unknown/removed selection simply falls back to the first column (activeIndex 0).

  // Oriented transition: the next column slides in from the side it sits on
  // (mirrored in right-to-left layouts), so switching reads as moving along
  // the board rather than as a jump.
  const [direction, setDirection] = useState<1 | -1>(1);
  const selectColumn = useCallback(
    (status: string) => {
      const target = columns.findIndex((c) => c.status === status);
      setDirection(target >= activeIndex ? 1 : -1);
      setSelected(status);
    },
    [activeIndex, columns]
  );
  const forward = (direction === 1) !== I18nManager.isRTL;
  const entering = (forward ? SlideInRight : SlideInLeft).duration(240).reduceMotion(ReduceMotion.System);

  const [moving, setMoving] = useState<Task | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<FlatList<Task>>(null);

  const selfInitials = initials(session.account?.name || session.account?.email);
  const selfUserId = session.selfUserId;

  const moveTask = useCallback(
    (task: Task, column: ColumnRef) => {
      if (normalizeStatus(task.status) === column.status) return;
      setStatus({ projectId, taskId: task.id, status: column.status, isDone: column.isDone });
    },
    [projectId, setStatus]
  );

  const openTask = useCallback(
    (task: Task) => router.push({ pathname: "/tasks/[taskId]", params: { taskId: task.id, projectId } }),
    [projectId, router]
  );

  const startMove = useCallback((task: Task) => {
    haptics.press();
    setMoving(task);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([tasksQuery.refetch(), columnsQuery.refetch(), prioritiesQuery.refetch()]);
    setRefreshing(false);
  }, [tasksQuery, columnsQuery, prioritiesQuery]);

  const renderItem = useCallback(
    ({ item }: { item: Task }) => (
      <TaskCard
        task={item}
        done={active?.isDone ?? false}
        priorityColor={priorityColor(item.priority, priorities, colors)}
        priorityLabel={priorityLabel(item.priority, priorities)}
        progress={board.progress.get(item.id)}
        selfInitials={selfInitials}
        isAssignedToSelf={!!selfUserId && item.assignee_id === selfUserId}
        prevColumn={prevColumn}
        nextColumn={nextColumn}
        onOpen={openTask}
        onLongPress={startMove}
        onMove={moveTask}
      />
    ),
    [active, board.progress, colors, moveTask, nextColumn, openTask, prevColumn, priorities, selfInitials, selfUserId, startMove]
  );

  const tasks = active ? (board.byColumn[active.status] ?? []) : [];
  const hasBoard = columnsQuery.data !== undefined;
  const firstError = columnsQuery.error ?? tasksQuery.error;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: project?.name ?? "" }} />

      <SyncBanner updatedAt={tasksQuery.dataUpdatedAt || undefined} />

      {hasBoard ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipBar}
          accessibilityRole="tablist"
        >
          {columns.map((column) => {
            const isActive = column.status === active?.status;
            const count = board.byColumn[column.status]?.length ?? 0;
            return (
              <Pressable
                key={column.status}
                onPress={() => {
                  if (isActive) return;
                  haptics.selection();
                  selectColumn(column.status);
                  listRef.current?.scrollToOffset({ offset: 0, animated: false });
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={t("board.columnTab", { column: column.label, count })}
                style={({ pressed }) => [
                  styles.chip,
                  rounded(radius.pill),
                  {
                    backgroundColor: isActive ? column.color : pressed ? colors.surfacePressed : colors.surface,
                    borderColor: isActive ? column.color : colors.border,
                  },
                ]}
              >
                {!isActive ? <View style={[styles.chipDot, { backgroundColor: column.color }]} /> : null}
                <Text
                  style={[styles.chipText, { color: isActive ? onColor(column.color) : colors.text }]}
                  numberOfLines={1}
                >
                  {column.label}
                </Text>
                <Text style={[styles.chipCount, { color: isActive ? onColor(column.color) : colors.textMuted }]}>
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <Animated.View key={active?.status ?? "none"} entering={entering} style={styles.screen}>
      <FlatList
        ref={listRef}
        data={tasks}
        keyExtractor={(task) => task.id}
        renderItem={renderItem}
        // Card heights depend on title length, so no getItemLayout here;
        // memoized cards + a modest window keep long columns smooth.
        initialNumToRender={12}
        windowSize={7}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
        ListEmptyComponent={
          !hasBoard && (columnsQuery.isPending || tasksQuery.isPending) ? (
            <LoadingState />
          ) : !hasBoard && firstError ? (
            <ErrorState message={t("board.loadError")} onRetry={onRefresh} />
          ) : active ? (
            <EmptyState
              icon="checkmark-done-outline"
              title={t("board.emptyColumn", { column: active.label })}
              message={t("board.emptyHint")}
            />
          ) : undefined
        }
      />
      </Animated.View>

      {hasBoard ? (
        <Fab
          accessibilityLabel={t("board.newTask")}
          onPress={() =>
            router.push({
              pathname: "/projects/[projectId]/new-task",
              params: { projectId, status: active?.status ?? "" },
            })
          }
        />
      ) : null}

      <OptionSheet
        visible={moving !== null}
        title={moving ? `${t("board.moveTo")} ${moving.title}` : ""}
        options={columns.map((column) => ({
          key: column.status,
          label: column.label,
          color: column.color,
          selected: moving ? normalizeStatus(moving.status) === column.status : false,
        }))}
        onClose={() => setMoving(null)}
        onSelect={(status) => {
          const column = columns.find((c) => c.status === status);
          if (moving && column) moveTask(moving, column);
          setMoving(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  chipBar: { flexGrow: 0 },
  chips: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md + 2,
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { ...typography.subhead, fontWeight: "600", maxWidth: 180 },
  chipCount: { ...typography.footnote, fontVariant: ["tabular-nums"] },
  list: { paddingTop: spacing.xs, paddingBottom: 120 },
});

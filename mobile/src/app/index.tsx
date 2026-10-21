import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useRouter } from "expo-router";
import { memo, useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { Project } from "@/api";
import { useSession } from "@/auth/session";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { SyncBanner } from "@/components/SyncBanner";
import { useI18n } from "@/i18n";
import { useProjects } from "@/query/hooks";
import { concentricRadius, radius, rounded, spacing, typography, useTheme, type Colors } from "@/theme";

const ROW_HEIGHT = 68;
const ROW_GAP = spacing.sm;
const ROW_PADDING = spacing.md;

/** A stable colour per project, so its badge looks the same everywhere. */
const BADGE_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#ca8a04", "#4f46e5"];
function badgeColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return BADGE_COLORS[Math.abs(hash) % BADGE_COLORS.length] ?? "#2563eb";
}

const ProjectRow = memo(function ProjectRow({
  project,
  colors,
  label,
  onOpen,
}: {
  project: Project;
  colors: Colors;
  label: string;
  onOpen: (project: Project) => void;
}) {
  return (
    <Pressable
      onPress={() => onOpen(project)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        rounded(radius.card),
        { backgroundColor: pressed ? colors.surfacePressed : colors.surface },
      ]}
    >
      <View
        style={[
          styles.badge,
          rounded(concentricRadius(radius.card, ROW_PADDING, 8)),
          { backgroundColor: badgeColor(project.id) },
        ]}
      >
        <Text style={styles.badgeText}>{project.name.trim().charAt(0).toUpperCase() || "#"}</Text>
      </View>
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
        {project.name}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
});

export default function ProjectsScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { colors } = useTheme();
  const session = useSession();
  const projects = useProjects();
  const [refreshing, setRefreshing] = useState(false);
  // getItemLayout offsets must include the header (sync banner) above the rows.
  const [headerHeight, setHeaderHeight] = useState(0);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await projects.refetch().catch(() => {});
    setRefreshing(false);
  }, [projects]);

  const openProject = useCallback(
    (project: Project) => router.push({ pathname: "/projects/[projectId]", params: { projectId: project.id } }),
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: Project }) => (
      <ProjectRow
        project={item}
        colors={colors}
        label={t("projects.openProject", { name: item.name })}
        onOpen={openProject}
      />
    ),
    [colors, openProject, t]
  );

  const data = projects.data ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push("/settings")}
              accessibilityRole="button"
              accessibilityLabel={t("projects.openSettings")}
              hitSlop={10}
            >
              <Ionicons name="settings-outline" size={22} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        getItemLayout={(_data, index) => ({
          length: ROW_HEIGHT + ROW_GAP,
          offset: headerHeight + (ROW_HEIGHT + ROW_GAP) * index,
          index,
        })}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
            <SyncBanner updatedAt={projects.dataUpdatedAt || undefined} />
          </View>
        }
        ListEmptyComponent={
          projects.isPending ? (
            <LoadingState />
          ) : projects.isError && !projects.data ? (
            <ErrorState message={t("errors.loadFailed", { message: projects.error.message })} onRetry={onRefresh} />
          ) : (
            <EmptyState
              icon="folder-open-outline"
              title={t("projects.emptyTitle")}
              message={t("projects.emptyHint", { server: session.server.replace(/^https?:\/\//, "") })}
            />
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  row: {
    height: ROW_HEIGHT,
    marginBottom: ROW_GAP,
    marginHorizontal: spacing.lg,
    paddingHorizontal: ROW_PADDING,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  badge: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#ffffff", ...typography.headline },
  name: { ...typography.headline, flex: 1 },
});

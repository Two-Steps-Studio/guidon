import Ionicons from "@expo/vector-icons/Ionicons";
import { useIsMutating } from "@tanstack/react-query";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useI18n } from "@/i18n";
import { formatTime } from "@/lib/dates";
import { useIsOnline } from "@/query/hooks";
import { concentricRadius, radius, rounded, spacing, typography, useTheme } from "@/theme";

/**
 * Offline banner + "updated at" line shown above lists. Offline is not an
 * error here: the phone keeps showing (and editing) what it already has.
 */
export const SyncBanner = memo(function SyncBanner({ updatedAt }: { updatedAt: number | undefined }) {
  const online = useIsOnline();
  const pending = useIsMutating();
  const { t } = useI18n();
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      {!online ? (
        <View
          style={[styles.banner, rounded(concentricRadius(radius.card, 4)), { backgroundColor: colors.bannerOffline }]}
          accessibilityRole="summary"
          accessibilityLiveRegion="polite"
        >
          <Ionicons name="cloud-offline-outline" size={18} color={colors.onBannerOffline} />
          <View style={styles.bannerText}>
            <Text style={[styles.bannerTitle, { color: colors.onBannerOffline }]}>{t("sync.offline")}</Text>
            {pending > 0 ? (
              <Text style={[styles.bannerSub, { color: colors.onBannerOffline }]}>
                {t("sync.pending", { count: pending })}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
      <Text style={[styles.updated, { color: colors.textMuted }]}>
        {updatedAt ? t("sync.lastSynced", { time: formatTime(updatedAt) }) : t("sync.notSynced")}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs, gap: spacing.sm },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bannerText: { flex: 1 },
  bannerTitle: { ...typography.footnote, fontWeight: "600" },
  bannerSub: { ...typography.caption, marginTop: 2 },
  updated: { ...typography.caption },
});

import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet } from "react-native";
import { MotionPressable } from "./MotionPressable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptics } from "@/lib/haptics";
import { spacing, useTheme } from "@/theme";

const SIZE = 58;

/** Floating "+" button, above the home indicator. */
export function Fab({ onPress, accessibilityLabel }: { onPress: () => void; accessibilityLabel: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <MotionPressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.fab,
        {
          backgroundColor: colors.primary,
          bottom: Math.max(insets.bottom, spacing.lg) + spacing.sm,
        },
      ]}
    >
      <Ionicons name="add" size={30} color={colors.onPrimary} />
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: spacing.xl,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});

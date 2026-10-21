import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, rounded, spacing, typography, useTheme } from "@/theme";

/**
 * A minimal toast: one message at a time, at the top, auto-dismissed. Fired
 * from anywhere (including mutation callbacks) through `showToast`.
 */

export type ToastKind = "error" | "info";
type Toast = { id: number; message: string; kind: ToastKind };
type Listener = (toast: Toast) => void;

let nextId = 1;
const listeners = new Set<Listener>();

export function showToast(message: string, kind: ToastKind = "error"): void {
  const toast = { id: nextId++, message, kind };
  listeners.forEach((listener) => listener(toast));
}

export function ToastHost() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  useEffect(() => {
    const listener: Listener = (next) => {
      setToast(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 4000);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!toast) return null;
  const background = toast.kind === "error" ? colors.danger : colors.text;
  const foreground = toast.kind === "error" ? "#ffffff" : colors.background;

  return (
    <Animated.View
      key={toast.id}
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(180)}
      style={[styles.wrap, { top: insets.top + spacing.sm }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => setToast(null)}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityHint="Dismisses the message"
        style={[styles.toast, rounded(radius.control + 4), { backgroundColor: background }]}
      >
        <Text style={[styles.text, { color: foreground }]}>{toast.message}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.lg, right: spacing.lg, zIndex: 1000 },
  toast: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { ...typography.subhead, fontWeight: "500" },
});

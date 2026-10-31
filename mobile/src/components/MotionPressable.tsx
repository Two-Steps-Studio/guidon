import { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, type PressableProps } from "react-native";
import Animated, { cubicBezier, useReducedMotion } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const easeOut = cubicBezier(0.23, 1, 0.32, 1);

/** Small action buttons only. Navigation rows keep their platform feedback. */
export function MotionPressable({ style, onPressIn, onPressOut, disabled, ...props }: PressableProps) {
  const initialReduced = useReducedMotion();
  const [reduced, setReduced] = useState(initialReduced);
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => subscription.remove();
  }, []);
  const active = pressed && !disabled;
  const resolvedStyle = typeof style === "function" ? style({ pressed: active }) : style;
  const opacity = StyleSheet.flatten(resolvedStyle)?.opacity ?? 1;
  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      pressRetentionOffset={props.pressRetentionOffset ?? 12}
      onPressIn={event => { setPressed(true); onPressIn?.(event); }}
      onPressOut={event => { setPressed(false); onPressOut?.(event); }}
      style={[
        resolvedStyle,
        {
          transform: [{ scale: reduced || !active ? 1 : .97 }],
          opacity: active ? opacity * .85 : opacity,
          transitionProperty: reduced ? ["opacity"] : ["transform", "opacity"],
          transitionDuration: 120,
          transitionTimingFunction: easeOut,
        },
      ]}
    />
  );
}

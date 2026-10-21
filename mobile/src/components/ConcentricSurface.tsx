import type { ReactNode } from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { rounded } from "@/theme";

export type ConcentricSurfaceProps = {
  color: string;
  /** Corner radius when the platform can't derive a concentric one (and the minimum on iOS 26). */
  radius: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
} & Pick<ViewProps, "accessibilityViewIsModal">;

/**
 * Android (and any non-iOS) fallback: a plain rounded surface. The iOS file
 * (ConcentricSurface.ios.tsx) draws SwiftUI's ConcentricRectangle on iOS 26+.
 */
export function ConcentricSurface({ color, radius, style, children, ...rest }: ConcentricSurfaceProps) {
  return (
    <View style={[style, rounded(radius), { backgroundColor: color }]} {...rest}>
      {children}
    </View>
  );
}

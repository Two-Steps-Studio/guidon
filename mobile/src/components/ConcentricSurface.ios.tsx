import { ConcentricRectangle, EdgeCornerStyle, Host } from "@expo/ui/swift-ui";
import { foregroundStyle } from "@expo/ui/swift-ui/modifiers";
import { Platform, StyleSheet, View } from "react-native";
import { rounded } from "@/theme";
import type { ConcentricSurfaceProps } from "./ConcentricSurface";

/** ConcentricRectangle exists from iOS 26; before that the native view renders nothing. */
const SUPPORTS_CONCENTRIC = parseInt(String(Platform.Version), 10) >= 26;

/**
 * A surface whose corners follow the shape it sits in (the device's display
 * corners for a floating sheet), via SwiftUI's ConcentricRectangle. `radius`
 * is the minimum, and the full fallback on older iOS.
 */
export function ConcentricSurface({ color, radius, style, children, ...rest }: ConcentricSurfaceProps) {
  if (!SUPPORTS_CONCENTRIC) {
    return (
      <View style={[style, rounded(radius), { backgroundColor: color }]} {...rest}>
        {children}
      </View>
    );
  }
  const corner = EdgeCornerStyle.concentric(radius);
  return (
    <View style={style} {...rest}>
      <Host style={StyleSheet.absoluteFill} pointerEvents="none">
        <ConcentricRectangle
          corners={{
            topLeadingCorner: corner,
            topTrailingCorner: corner,
            bottomLeadingCorner: corner,
            bottomTrailingCorner: corner,
          }}
          modifiers={[foregroundStyle(color)]}
        />
      </Host>
      {children}
    </View>
  );
}

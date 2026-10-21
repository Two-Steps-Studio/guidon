import * as Haptics from "expo-haptics";

/**
 * All haptic feedback goes through here so the Settings toggle applies
 * everywhere, including feedback fired from mutation callbacks outside React.
 */

let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

function run(effect: () => Promise<void>): void {
  if (!enabled) return;
  effect().catch(() => {
    // Devices without a haptic engine (or a simulator) reject; feedback is optional.
  });
}

export const haptics = {
  /** A tap that changes data. */
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A long press that opens something (e.g. the move sheet). */
  press: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Picking a value in a picker, a swipe crossing its threshold. */
  selection: () => run(() => Haptics.selectionAsync()),
  /** A task was completed. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Something failed. */
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

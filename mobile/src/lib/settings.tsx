import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { haptics, setHapticsEnabled } from "./haptics";
import { STORAGE_KEYS } from "./storage-keys";

/** Per-device preferences. Language isn't one: it follows the system. */

type SettingsValue = { hapticsEnabled: boolean; setHaptics: (enabled: boolean) => void };

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [hapticsEnabled, setHapticsState] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.haptics)
      .then((value) => {
        const enabled = value !== "0";
        setHapticsEnabled(enabled);
        setHapticsState(enabled);
      })
      .catch(() => {});
  }, []);

  const setHaptics = useCallback((enabled: boolean) => {
    setHapticsEnabled(enabled);
    setHapticsState(enabled);
    if (enabled) haptics.selection();
    AsyncStorage.setItem(STORAGE_KEYS.haptics, enabled ? "1" : "0").catch(() => {});
  }, []);

  const value = useMemo(() => ({ hapticsEnabled, setHaptics }), [hapticsEnabled, setHaptics]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}

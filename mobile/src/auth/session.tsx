import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, DEFAULT_SERVER, isApiError, normalizeServerUrl, setApiCredentials } from "@/api";
import { t } from "@/i18n";
import { haptics } from "@/lib/haptics";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { wipeCache } from "@/query/client";
import { onSelfUserId, onUnauthorized, setKnownSelfUserId } from "./events";
import { createPkcePair, randomUrlSafe } from "./pkce";

/**
 * Sign-in with the server's mobile PKCE flow (src/lib/auth/mobile-login.ts):
 * the system browser opens /auth/mobile-login, the person signs in on the
 * real Guidon site and approves, the site redirects to guidon://auth with a
 * one-time code, and POST /api/v1/auth/mobile/token trades code + verifier
 * for an API key. The key lives in the Keychain/Keystore (SecureStore); the
 * server origin and email in AsyncStorage.
 */

/** Fixed on the server (MOBILE_REDIRECT_URI) - the only place a code is ever sent. */
export const REDIRECT_URI = "guidon://auth";

export type Account = { apiKey: string; email: string; name: string | null };

type SessionState = {
  ready: boolean;
  server: string;
  account: Account | null;
  selfUserId: string | null;
  /** Why the last sign-out happened without the person asking (shown on the sign-in screen). */
  notice: string | null;
};

export type SignInResult = { ok: true } | { ok: false; cancelled: true } | { ok: false; cancelled: false; error: string };

type SessionValue = SessionState & {
  signIn: () => Promise<SignInResult>;
  signOut: (notice?: string) => Promise<void>;
  setServer: (server: string) => Promise<void>;
  clearNotice: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    ready: false,
    server: DEFAULT_SERVER,
    account: null,
    selfUserId: null,
    notice: null,
  });
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const signingOut = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let apiKey: string | null = null;
      try {
        apiKey = await SecureStore.getItemAsync(STORAGE_KEYS.apiKey);
      } catch {
        apiKey = null;
      }
      const entries = await AsyncStorage.multiGet([
        STORAGE_KEYS.server,
        STORAGE_KEYS.email,
        STORAGE_KEYS.name,
        STORAGE_KEYS.selfUserId,
      ]).catch(() => [] as [string, string | null][]);
      const stored = Object.fromEntries(entries) as Record<string, string | null>;
      const server = normalizeServerUrl(stored[STORAGE_KEYS.server] ?? "") ?? DEFAULT_SERVER;
      const account = apiKey ? { apiKey, email: stored[STORAGE_KEYS.email] ?? "", name: stored[STORAGE_KEYS.name] ?? null } : null;
      const selfUserId = account ? (stored[STORAGE_KEYS.selfUserId] ?? null) : null;
      setApiCredentials({ server, apiKey: account?.apiKey ?? null });
      setKnownSelfUserId(selfUserId);
      if (!cancelled) setState({ ready: true, server, account, selfUserId, notice: null });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(async (notice?: string) => {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      setApiCredentials({ server: stateRef.current.server, apiKey: null });
      setKnownSelfUserId(null);
      await Promise.allSettled([
        SecureStore.deleteItemAsync(STORAGE_KEYS.apiKey),
        AsyncStorage.multiRemove([STORAGE_KEYS.email, STORAGE_KEYS.name, STORAGE_KEYS.selfUserId]),
        wipeCache(),
      ]);
      setState((prev) => ({ ...prev, account: null, selfUserId: null, notice: notice ?? null }));
    } finally {
      signingOut.current = false;
    }
  }, []);

  // 401 from any request: the key was revoked (or replaced by a sign-in on another phone).
  useEffect(
    () =>
      onUnauthorized(() => {
        if (stateRef.current.account) {
          haptics.error();
          void signOut(t("signIn.revoked"));
        }
      }),
    [signOut]
  );

  useEffect(
    () =>
      onSelfUserId((userId) => {
        if (!stateRef.current.account || stateRef.current.selfUserId === userId) return;
        setState((prev) => ({ ...prev, selfUserId: userId }));
        AsyncStorage.setItem(STORAGE_KEYS.selfUserId, userId).catch(() => {});
      }),
    []
  );

  const setServer = useCallback(async (server: string) => {
    setApiCredentials({ server, apiKey: stateRef.current.account?.apiKey ?? null });
    setState((prev) => ({ ...prev, server }));
    await AsyncStorage.setItem(STORAGE_KEYS.server, server).catch(() => {});
  }, []);

  const signIn = useCallback(async (): Promise<SignInResult> => {
    const server = stateRef.current.server;
    try {
      const { verifier, challenge } = await createPkcePair();
      const expectedState = randomUrlSafe(32);
      const url =
        `${server}/auth/mobile-login?code_challenge=${encodeURIComponent(challenge)}` +
        `&code_challenge_method=S256&state=${encodeURIComponent(expectedState)}`;

      const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_URI);
      if (result.type !== "success") return { ok: false, cancelled: true };

      const { queryParams } = Linking.parse(result.url);
      const code = typeof queryParams?.code === "string" ? queryParams.code : null;
      const returnedState = typeof queryParams?.state === "string" ? queryParams.state : null;
      if (returnedState !== expectedState) return { ok: false, cancelled: false, error: t("signIn.errorState") };
      if (!code) return { ok: false, cancelled: false, error: t("signIn.errorIncomplete") };

      const token = await api.exchangeMobileCode(server, code, verifier);
      await SecureStore.setItemAsync(STORAGE_KEYS.apiKey, token.api_key);
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.server, server],
        [STORAGE_KEYS.email, token.email],
        [STORAGE_KEYS.name, token.name ?? ""],
      ]);
      // A fresh account: never show another account's cached rows.
      await wipeCache();
      setApiCredentials({ server, apiKey: token.api_key });
      setKnownSelfUserId(null);
      setState((prev) => ({
        ...prev,
        account: { apiKey: token.api_key, email: token.email, name: token.name || null },
        selfUserId: null,
        notice: null,
      }));
      haptics.success();
      return { ok: true };
    } catch (error) {
      haptics.error();
      if (isApiError(error) && error.isNetwork) {
        return { ok: false, cancelled: false, error: t("signIn.errorNetwork", { server: server.replace(/^https?:\/\//, "") }) };
      }
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, cancelled: false, error: t("signIn.errorGeneric", { message }) };
    }
  }, []);

  const clearNotice = useCallback(() => setState((prev) => ({ ...prev, notice: null })), []);

  const value = useMemo<SessionValue>(
    () => ({ ...state, signIn, signOut, setServer, clearNotice }),
    [state, signIn, signOut, setServer, clearNotice]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

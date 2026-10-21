import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { focusManager, MutationCache, onlineManager, QueryCache, QueryClient } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";
import { isApiError } from "@/api";
import { emitUnauthorized } from "@/auth/events";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { registerMutationDefaults } from "./mutations";

/**
 * Offline-first data layer:
 * - Queries use networkMode "offlineFirst": cached data (persisted to
 *   AsyncStorage) renders immediately, a refetch runs in the background, and
 *   with no network the query simply waits instead of erroring.
 * - Mutations are optimistic (mutations.ts) and pause while offline; paused
 *   ones are persisted with the cache and resumed on the next launch.
 */

const DAY = 24 * 60 * 60 * 1000;
export const CACHE_MAX_AGE = 7 * DAY;

function shouldRetry(failureCount: number, error: unknown, max: number): boolean {
  if (!isApiError(error)) return failureCount < 1;
  if (error.isRateLimited) return failureCount < 4;
  if (error.isNetwork) return failureCount < max;
  // 5xx can be transient; 4xx won't change by asking again.
  if (error.status >= 500) return failureCount < 2;
  return false;
}

/** 429: the server's window is a minute per key, so back off in seconds, not milliseconds. */
function retryDelay(attempt: number, error: unknown): number {
  const base = isApiError(error) && error.isRateLimited ? 4000 : 1000;
  return Math.min(base * 2 ** attempt, 30_000);
}

function handleGlobalError(error: unknown): void {
  if (isApiError(error) && error.isUnauthorized) emitUnauthorized();
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleGlobalError }),
  mutationCache: new MutationCache({ onError: handleGlobalError }),
  defaultOptions: {
    queries: {
      networkMode: "offlineFirst",
      gcTime: CACHE_MAX_AGE,
      staleTime: 30_000,
      retry: (count, error) => shouldRetry(count, error, 2),
      retryDelay,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
    mutations: {
      // "online": while offline a mutation isn't even attempted - it pauses
      // (optimistic update already applied) and resumes on reconnect.
      networkMode: "online",
      gcTime: CACHE_MAX_AGE,
      retry: (count, error) => shouldRetry(count, error, 5),
      retryDelay,
    },
  },
});

registerMutationDefaults(queryClient);

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: STORAGE_KEYS.queryCache,
  throttleTime: 1000,
});

/** Bump when a cached shape changes incompatibly; old caches are then dropped. */
export const CACHE_BUSTER = "guidon-mobile-1";

let wired = false;

/** NetInfo drives React Query's online state; AppState drives "window focus". */
export function wireNativeManagers(): void {
  if (wired) return;
  wired = true;

  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    })
  );

  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (Platform.OS !== "web") handleFocus(status === "active");
    });
    return () => subscription.remove();
  });
}

/** Sign-out: forget every cached row and every queued change, on disk too. */
export async function wipeCache(): Promise<void> {
  queryClient.getMutationCache().clear();
  queryClient.clear();
  await persister.removeClient();
}

/** AsyncStorage / SecureStore keys in one place. */
export const STORAGE_KEYS = {
  /** SecureStore: the API key ("guidon_..."). */
  apiKey: "guidon.apiKey",
  /** AsyncStorage: the server origin, account email and display name. */
  server: "guidon.server",
  email: "guidon.email",
  name: "guidon.name",
  /** AsyncStorage: the signed-in user's id, learned from rows the API returns (created_by / author_id). */
  selfUserId: "guidon.selfUserId",
  /** AsyncStorage: "0" when the person turned haptics off. */
  haptics: "guidon.haptics",
  /** AsyncStorage: the persisted React Query cache. */
  queryCache: "guidon.queryCache.v1",
} as const;

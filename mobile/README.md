# Guidon mobile (iOS + Android)

The Guidon app for phones: your projects, each project's board, and task
details with comments. It's built with Expo (SDK 58), React Native 0.88 and
expo-router. It talks **only** to the public REST API (`/api/v1`) using an
API key that the app gets at sign-in. It never touches the database or the web
app's Server Actions.

## Run it

```bash
cd mobile
npm install
npx expo start            # Metro dev server
```

Several native modules (SecureStore, haptics, the date picker, `@expo/ui`) and
the `guidon://` URL scheme need a **development build**. Expo Go won't do a full
sign-in on Android, because the `guidon://auth` redirect has to come back to
this app:

```bash
npx expo run:ios          # local dev build (macOS + Xcode)
npx expo run:android      # local dev build (Android Studio / SDK)
# or in the cloud:
npx eas-cli@latest build --profile development --platform ios|android
```

Checks:

```bash
npx tsc --noEmit          # type-check (strict)
npm run lint              # expo lint (eslint-config-expo)
npx expo-doctor           # dependency / config health
npx expo export --platform ios      # make sure the JS bundle builds
npx expo export --platform android
```

## Sign-in

This is PKCE (S256) against the server's mobile flow. See
`src/lib/auth/mobile-login-core.ts`, `src/app/auth/mobile-login/page.tsx` and
`src/app/api/v1/auth/mobile/token/route.ts` in the main repo.

1. The app makes a `code_verifier` (64 random bytes, base64url, 86 chars), its
   `code_challenge = base64url(SHA-256(verifier))` and a random `state`
   (`src/auth/pkce.ts`, expo-crypto).
2. `WebBrowser.openAuthSessionAsync(<server>/auth/mobile-login?code_challenge=…&code_challenge_method=S256&state=…, "guidon://auth")`
   opens the real Guidon sign-in (password, OAuth and password reset all work)
   in a secure system browser. The person taps **Allow**.
3. The site redirects to `guidon://auth?code=…&state=…`. The app checks `state`,
   then sends `POST <server>/api/v1/auth/mobile/token { code, code_verifier }`,
   which returns `{ api_key, email, name }`.
4. The key goes into the Keychain/Keystore (expo-secure-store). The server URL
   and email go into AsyncStorage. Signing in again replaces the old "Mobile
   App" key on the server.

The default server is `https://useguidon.com`. For a self-hosted instance, tap
"Self-hosted? Change server" on the sign-in screen.

If any request gets a 401, the key was revoked (for example from Profile → API
keys, or by signing in on another phone), so the app signs out and says why.
Signing out deletes the key and the whole local cache, including changes that
haven't synced yet. The person is warned about those first.

## Architecture

```
src/
  app/                 expo-router routes (typed routes on)
    _layout.tsx        providers, Stack with Stack.Protected (signed in / out)
    sign-in.tsx        wordmark, "Sign in with Guidon", server switch
    index.tsx          projects (large title, pull to refresh, sync banner)
    projects/[projectId]/index.tsx     board: column switcher + task cards
    projects/[projectId]/new-task.tsx  create-task modal
    tasks/[taskId].tsx task detail: status, priority, due date, description, subtasks, comments
    settings.tsx       account, haptics, language, legal (privacy/terms/EULA), sign out, version
    +native-intent.tsx keeps the guidon://auth redirect away from the router
  api/                 the typed API module: types mirrored from the server, fetch client, endpoints
  auth/                PKCE, session provider (SecureStore), 401 → sign-out events
  query/               React Query client, persistence, mutation defaults, hooks
  components/          TaskCard, OptionSheet, DueDateField, ConcentricSurface, rows, states
  lib/                 board logic (ported from the web), dates, haptics, toast, settings
  i18n/                en / pl / de / es, follows the system language
  theme/               colour tokens (light/dark), spacing, radii, concentricRadius()
```

### Offline-first ("trust the data already on the phone")

- The React Query cache is saved to AsyncStorage
  (`@tanstack/react-query-persist-client`, kept for up to 7 days). On launch,
  whatever is cached shows up straight away, and a refetch runs in the
  background (`networkMode: "offlineFirst"`).
- NetInfo feeds React Query's `onlineManager`, and AppState feeds `focusManager`.
  When the phone is offline, a banner says so. Every list also shows when it
  was last updated.
- A 429 (60 requests/min per key) is retried with a backoff of several seconds.
  Network errors and 5xx responses are retried a few times.

### Optimistic updates

Every write (status change, task edit, new task, comment) is a mutation
**default** registered in `src/query/mutations.ts`, keyed by a mutation key:

- `onMutate` updates the board list and the task-detail cache right away. A new
  task or comment gets a `local-…` id and is labelled "Waiting to sync".
- On error the change is rolled back, and the person gets an error haptic and a
  toast with the server's message.
- While offline a mutation **pauses** (`networkMode: "online"`). Paused
  mutations are saved with the cache and resumed on reconnect or on the next
  launch. That works because their `mutationFn` lives in the defaults, not in
  a component.
- All writes share one mutation `scope`, so they reach the server in the order
  they were made. Server responses and refetches are applied only once no other
  write is queued, so a stale answer never briefly undoes a newer change.

### Haptics

`src/lib/haptics.ts` provides these:

- a light impact for taps that change data;
- a success notification when a task moves into a column marked "done";
- selection feedback in pickers and swipe thresholds;
- a medium impact on long-press;
- an error notification on failures.

The "Haptics" switch in Settings (stored in AsyncStorage) turns all of them off.

### Board interactions

- The columns come from `GET /projects/{id}/columns` (custom labels/colours,
  `is_done`; hidden columns are left out). They appear as a horizontal chip
  switcher with a count on each chip.
- Switching columns uses an oriented transition: the list slides in from the
  side the new column is on, mirrored for right-to-left layouts, and Reduce
  Motion is respected.
- Swipe a card left to move it to the next column, or right to move it to the
  previous one. Long-press a card for a "Move to…" sheet with every column.
  The same actions are available to VoiceOver and TalkBack as accessibility
  actions.
- Cards show the title, a priority colour dot, the due date (red when
  overdue), subtask progress and an assignee badge.

### Design

- Platform fonts.
- iOS large titles (`headerLargeTitleEnabled`).
- Safe areas.
- Light and dark mode from `useColorScheme` and `src/theme`.
- Continuous corners (`borderCurve: "continuous"`).
- Concentric radii: `concentricRadius(outer, padding)` for nested surfaces.
- The floating sheets use SwiftUI's `ConcentricRectangle` (via `@expo/ui`) on
  iOS 26+, so their corners follow the device's display corners. Older iOS
  and Android fall back to a rounded view (`ConcentricSurface.ios.tsx` /
  `ConcentricSurface.tsx`).

## Known API limits (by design of `/api/v1`)

- The API has no members endpoint, so the app can't show other people's names.
  - The app works out the signed-in person's own user id from rows it creates
    (`created_by` / `author_id`).
  - A task assigned to you shows your initials. A task assigned to someone else
    shows a generic person badge.
  - Comments are labelled "You", the agent's label, or "Teammate".
- `GET /projects/{id}/tasks` returns up to 1000 tasks (no pagination).
- Labels for built-in columns and priorities are translated on the phone,
  unless the project renamed them.

## Release (EAS)

1. Run `npx eas-cli@latest init` once to link the Expo project. It writes
   `extra.eas.projectId` into `app.json`.
2. Bump `version` in `app.json` for a new store version. Build numbers are
   incremented remotely (`appVersionSource: "remote"`, `autoIncrement`).
3. Build:
   `npx eas-cli@latest build --profile production --platform all`
4. Submit:
   `npx eas-cli@latest submit --profile production --platform ios` (App Store
   Connect / TestFlight) and `--platform android` (Google Play; needs a
   service-account key the first time).
5. Store listing checklist:
   - App Privacy: email and account identifiers, linked to the user, used for
     app functionality; no tracking.
   - Privacy policy URL `https://useguidon.com/legal/privacy`. The EULA is at
     `https://useguidon.com/legal/eula`, and both are linked in Settings → About.
   - A review account with a seeded project, because the reviewer has to sign
     in through the web flow.
   - iPhone-only for now (`supportsTablet: false`).
   - Export compliance is pre-answered (`usesNonExemptEncryption: false`).

# Guidon motion

The daily workspace uses the existing shared surface tokens in globals.css:
menus 180 ms, dialogs 200 ms, drawers 240 ms, tooltips 125 ms, exits 120 ms.
Keyboard command surfaces remain instant. Do not add route entrances, task-list
staggering or moving data to the workspace.

## Marketing: explanation

The homepage laptop is a real screenshot, visible in SSR and throughout the
entrance. Its frame straightens over 1200 ms using the shared ease-out curve;
a separate decorative light pass uses transform/opacity for 1800 ms.
The contextual workflow illustration coordinates a task, decision, knowledge
and optional agent result over 3600 ms. It is explicitly an example, not a live
claim about an agent operating on a visitor's project.

IntersectionObserver starts each scene once, at 15% intersection. Leaving the
viewport or hiding the document pauses playback. There are no replay controls.
No infinite loops,
autoplay video, extra motion dependency or delayed call to action.

Mobile replaces the laptop perspective and task rotation with a gentle fade.
Reduced motion removes spatial changes and decorative sweeps, retaining a
120 ms opacity change. Without JS, all illustrative content is visible.

## Product tour and native action feedback

Homepage step cards and integration cards arrive
once on intersection (600 ms, ease-out, up to 180 ms of 60 ms staggering).
Only transform and opacity change. SSR is fully visible; keyboard activity and
focus settle active animations and keyboard activity suppresses later reveals.
Reduced motion retains a 120 ms opacity change with no delay. Hiding the document
settles playback.

Product screenshots have their own scroll-linked entrance: they straighten from
8 degrees of perspective and scale .94 to 1 as their static wrapper crosses
95% to 35% of the viewport height. Text stays stationary. Scrolling back reverses
the same continuous progress; there is no timer, replay button, pinned page or
scroll interception. Phones use at most 12px of vertical movement and scale .98
to 1 without perspective. Reduced motion and keyboard navigation settle the image
immediately. SSR/no-JS retains the complete screenshot.

IntersectionObserver gates work to visible previews. Passive scroll/resize
listeners coalesce updates with requestAnimationFrame, read wrapper geometry
before writing the inner transform, and never update React state per frame.
Hidden documents cancel queued work; unmount removes listeners. This keeps
layout measurements independent from the transformed screenshot. It is a
scroll-handler implementation, not a claim of compositor-only scheduling.

Expo action buttons (sign-in, retry, floating create) share a 120 ms Reanimated
CSS transition: scale .97 and opacity on press-in, retargeting on release.
Reduced motion replaces scale with opacity and responds to system setting changes.
Busy/disabled styles, callbacks, safe-area positioning and existing haptics remain
owned by the original controls. No per-frame React work, animated shadows, list
entrances or custom navigation transitions. Native release-device performance
and tactile feel still require an actual iOS/Android device.

API reference: [Reanimated CSS transitions](https://docs.swmansion.com/react-native-reanimated/docs/css-transitions/transition-timing-function/),
with the project's [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/) dependencies.

## Occasional application state: feedback (web)

`useStateMotion` bridges pointer-driven onboarding steps and an import-result
icon with a 180 ms opacity/transform animation. It uses WAAPI and the existing
ease-out token. A new state cancels the old animation; unmount cleans it up.
Keyboard activity cancels playback, and reduced motion uses opacity only for
120 ms. Form nodes are not remounted, so values and focus remain owned by the
existing forms. The result count and Undo action are not animated or delayed.

Native FAQ details retain their keyboard semantics and no-JS behavior. Only
the answer fades for 125 ms after pointer activation; no height animation.

## Verification

`node tests/e2e/run.mjs --task-queue` exercises the marketing sequences and
onboarding in Chromium, Firefox and WebKit using an isolated production build.
It checks compositor-only properties, bounded single iterations, offscreen
pause, reduced motion, mobile layout and keyboard wizard
navigation. Screenshots are written with the other disposable E2E artifacts.
The full `npm run test:e2e` retains real signup, onboarding, task import and
workspace checks. Production deployment remains a separate approved action.

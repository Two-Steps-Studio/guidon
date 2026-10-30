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
viewport or hiding the document pauses playback. Pointer activation can replay
it. Keyboard activation settles the scene immediately. No infinite loops,
autoplay video, extra motion dependency or delayed call to action.

Mobile replaces the laptop perspective and task rotation with a gentle fade.
Reduced motion removes spatial changes and decorative sweeps, retaining a
120 ms opacity change. Without JS, all illustrative content is visible and the
nonfunctional replay control stays hidden.

## Occasional application state: feedback

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
pause, keyboard replay, reduced motion, mobile layout and keyboard wizard
navigation. Screenshots are written with the other disposable E2E artifacts.
The full `npm run test:e2e` retains real signup, onboarding, task import and
workspace checks. Production deployment remains a separate approved action.

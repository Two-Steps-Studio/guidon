# Hyperframes Composition Brief: Guidon

## Objective
Create a short launch film for Guidon that shows how project work stays connected to the reasoning and knowledge behind it.

## Output
- Composition directory: `brag-output/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20.4 seconds

## Source Material
- Project root: `C:/guidon`
- Primary files read: `README.md`, `docs/brand-kit.md`, `src/app/page.tsx`, `src/app/globals.css`, `public/landing/hero-dashboard-light.webp`, `public/landing/decisions-light.webp`, `public/landing/memoryContext-light.webp`, and `public/brand/guidon-wordmark-white.png`.
- Product name: Guidon
- Tagline / strongest claim: “Keep the why with the work.”
- Key UI moments: task dashboard; approved decision with rationale and alternatives; reviewable project-memory insight.
- Copy that must appear verbatim:
  - Keep the why with the work.
  - useguidon.com
  - REST + MCP for agents.

Sample data is from the repository's product screenshots. The dashboard crop omits the profile area and activity feed. Screenshots are retained as provided; the decision and memory cards contain fictional development-project examples.

## Creative Direction
- Tone preset: app-store
- Creative direction: quiet, confident developer-tool launch film
- Interpretation: feature-forward, polished, and restrained, with actual UI carrying the proof.
- Angle: lead with Guidon's actual positioning, then show a task board, a decision's rationale, and project memory before closing on the logo and site.
- Hook: “Keep the why with the work.”
- Outro: Guidon wordmark, same tagline, `useguidon.com`.
- Avoid: generic SaaS claims, fabricated metrics, abstract filler, and unrelated redesign.

## Visual Identity
- Background: `#0b0d10`
- Text: `#e8eaed`
- Accent: `#4d8dff`; brand blue `#1d4fd8`
- Display/body font: Montserrat (video-safe companion to the app's Geist sans)
- Technical labels: JetBrains Mono
- Visual references: `assets/images/dashboard-focus.webp`, `assets/images/decisions-focus.webp`, `assets/images/memory-focus.webp`, `assets/images/guidon-wordmark-white.png`.

## Storyboard
See `brag-plan.md` for the storyboard. Scene beats land at 0s, 3.27s, 8.74s, 13.11s, and 17.47s.

## Audio
- Audio role: warm, restrained bed with sparse motion-matched accents.
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`
- Music treatment: 0.32 volume, fade up over 0.6s, fade out by 20.4s.
- Music cue guidance: bundled JSON at `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`; strong cues at 8.74s, 13.11s, and 17.47s; first UI reveal aligns to beat grid at 3.27s.
- Audio-reactive treatment: precomputed bass energy subtly controls the blue light around the real Guidon logo.
- SFX analysis guidance: `C:/Users/Marcin/.codex/plugins/cache/brag/brag/0.4.0/skills/brag/assets/sfx/sfx-analysis.md`; select low-risk sounds only.
- SFX choices: local soft impacts on UI reveals; exact starts and volumes are in `index.html`.
- No voiceover: it was not requested.

## HyperFrames Instructions
Use the installed HyperFrames core, animation, creative, keyframes, audio, and CLI conventions. This is the `/brag` flow; do not route into the generic HyperFrames promo workflow. Keep creation and render local.

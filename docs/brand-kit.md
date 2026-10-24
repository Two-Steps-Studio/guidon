# Guidon brand kit

This is the working source for Guidon's product messaging and the logo files
prepared for web and campaign use. The language describes capabilities that
exist today; do not advertise planned custom modules or a module marketplace
until those features ship.

## Positioning

**Audience:** development teams, including game-development teams, that need
to coordinate work across tools and preserve the reasoning behind decisions.

**Category:** context-first project management for development teams.

**Recommended slogan:** **Keep the why with the work.**

**Alternative slogan:** **Your guide through every project.**

Use this broader positioning line when introducing Guidon as a project
companion. Keep “Keep the why with the work” for messages focused on context
and the reasoning behind decisions.

**Polish version:** **Nie gub kontekstu pracy.**

**One-line description:** Guidon brings tasks, decisions, knowledge, and
project context together so teams can keep moving without losing the reasons
behind the work.

**Value proposition:** For development teams whose decisions and project
knowledge are scattered across tools, Guidon keeps work and its context
together. Teams can manage tasks, capture decisions, organize project
knowledge, and connect AI agents through REST and MCP access.

## Message pillars

| Message | What it means | Product proof |
| --- | --- | --- |
| Context stays with the work | A task can be read alongside the context that explains it. | Project context, decisions, references, knowledge, and task relationships. |
| One workspace for the project | Teams can keep everyday execution and project knowledge together. | Task board, calendar, roadmap, files, and project modules. |
| Humans and agents can work together | Teams can hand structured work to supported AI tools. | REST API, OpenAPI specification, MCP server, and project AI permissions. |
| Choose where it runs | Teams can use the hosted product or operate a self-hosted instance. | Guidon Cloud and documented self-hosted deployment. |

## Voice

- **Clear:** name the workflow and outcome in familiar language.
- **Grounded:** describe features that are available today; label planned work
  as planned.
- **Capable:** speak to development teams without assuming they want hype.
- **Practical:** explain the next action and link to the relevant guide.

Use “project context” when referring to the product idea. Avoid claims such as
“all-in-one,” “fully autonomous,” “unlimited,” or “secure by default” unless a
specific, verifiable scope is stated.

## Ready-to-use copy

### Website or directory short description

Context-first project management for development teams. Keep tasks,
decisions, and project knowledge together—and give AI agents a structured way
to help.

### 30-second introduction

Guidon helps development teams manage the work and the context behind it in
one place. Plan and review tasks, capture decisions, organize project
knowledge, and connect AI agents through REST and MCP. Use Guidon Cloud or
self-host the application on infrastructure you control.

### LinkedIn post

Tasks explain what needs to happen. They rarely explain why.

Guidon keeps project work alongside decisions, references, knowledge, and
the context teams need to keep moving. It is context-first project
management for development teams, with REST and MCP access for AI agents.

Explore Guidon: https://useguidon.com

### X post

Keep the why with the work. Guidon brings tasks, decisions, and project
context together for development teams—with REST and MCP access for AI agents.

https://useguidon.com

### GitHub repository description

Context-first project management for development teams: tasks, decisions,
project knowledge, REST and MCP access, plugins, and self-hosting.

### Launch-directory tagline

Project management that keeps context attached to the work.

### Launch-directory description

Guidon gives development teams a shared place for tasks and the context
behind them. Organize work on a project board, record decisions, connect
knowledge and references, and let authorized AI agents work through REST or
MCP. Choose the hosted product or self-host your instance.

## Logo files and usage

Use the canonical transparent files in `public/brand/`. “Symbol” means the
shield-shaped G alone; “wordmark” means the symbol and GUIDON lettering
together. The files previously named `guidon-mark-*.png` were full wordmarks,
not symbol-only marks, and have been removed to avoid choosing the wrong logo.

| File | Use |
| --- | --- |
| [guidon-symbol-blue.svg](../public/brand/guidon-symbol-blue.svg) | Blue symbol on light backgrounds; app icon, favicon, or compact placement. |
| [guidon-symbol-black.svg](../public/brand/guidon-symbol-black.svg) | Dark symbol on light backgrounds when blue is not suitable. |
| [guidon-symbol-white.svg](../public/brand/guidon-symbol-white.svg) | White symbol on dark backgrounds. |
| [guidon-wordmark-blue.png](../public/brand/guidon-wordmark-blue.png) | Default full logo on white or light backgrounds. |
| [guidon-wordmark-black.png](../public/brand/guidon-wordmark-black.png) | Full logo for neutral, monochrome uses on light backgrounds. |
| [guidon-wordmark-white.png](../public/brand/guidon-wordmark-white.png) | Full logo on Guidon Blue, Midnight Navy, or another dark background. |
| [profile-avatar.png](../public/brand/social/profile-avatar.png) | Ready-to-upload social profile image: white symbol on Guidon Blue. |

### Which logo to use

- **In the app:** use the symbol alone where space is tight, such as a collapsed
  navigation rail. Use the full wordmark for sign-in or public-facing brand
  placement. Keep the existing app asset at `public/assets/guidon-wordmark.png`
  where the application already references it.
- **Marketing and social profiles:** use the symbol-only `profile-avatar.png`
  for square profile pictures. It stays legible at small sizes; the wordmark is
  too small to read inside a circular crop.
- **Marketing banners, website headers, launch pages, and partner materials:**
  use the full wordmark. Choose blue on light backgrounds and white on dark or
  brand-colored backgrounds. Use the prepared files in `public/brand/social/`
  for the existing X, LinkedIn, and YouTube banner dimensions.
- Keep clear space around the full logo, preserve its proportions, and do not
  add effects, recolor it, or put the white version on a light background.

The older `public/assets/Guidon*.png` files have mixed background treatments;
prefer the canonical transparent exports above for new campaign layouts.

Web, PWA, mobile, VS Code, and Unity app icons are generated from the official
symbol with `npm run brand:icons`. Use the blue mark on transparent or white
surfaces; use a white mark over Guidon Blue for adaptive and maskable icons.

For browser favicons only, run `node scripts/generate-brand-icons.mjs --favicon-only`.
The browser symbol uses 94% of its canvas with transparent surroundings; the ICO
contains 16, 32, 48, 64 and 256px frames. Installed app and social profile icons
keep their separate safe areas for rounded and circular crops.

## Visual reference

The current interface is the source of truth for the product's visual
language. The official brand palette below is the source of truth for product
screens, social profiles, banners, and future marketing material.

### Official brand palette

| Color | Hex | Role and use |
| --- | --- | --- |
| Guidon Blue | `#1D4FD8` | Primary brand color. Use for the mark, light-mode primary actions, links, and small emphasis on light backgrounds. |
| Electric Blue | `#4D8DFF` | Supporting brand color. Use for highlights, fine details, and dark-mode primary actions where the deeper blue would not have enough contrast. |
| Midnight Navy | `#07142D` | Marketing background for dark banners and campaign graphics. Blue glows and gradients may vary around this base. |
| White | `#FFFFFF` | Wordmark and foreground color on dark brand backgrounds. |
| Ink | `#0F172A` | Body text on light backgrounds; this is a product neutral, not a logo color. |

Keep these roles consistent: Guidon Blue leads, Electric Blue supports, and
Midnight Navy is a background. Do not add another brand blue or recolor the
logo. On dark product surfaces, use the Electric Blue variant for interactive
elements to preserve readability. Use semantic interface tokens for states
such as success, warning, and destructive actions; those colors are not part
of the brand palette. Project accent colors and task-label colors may be
customized by teams and remain user-controlled.

The interface tokens in `src/app/globals.css` map to this palette:
`--color-brand` is Guidon Blue, `--color-brand-accent` is Electric Blue, and
`--color-primary` switches between them for light and dark themes. The primary
font is Geist. Use these tokens rather than adding one-off UI colors.

## Links

- Website: https://useguidon.com
- Product overview: https://useguidon.com/about
- Developers: https://useguidon.com/developers
- Plugins: https://useguidon.com/plugins
- Self-hosting guide: `docs/self-hosting.md`
- User guide: `docs/user-guide.md`

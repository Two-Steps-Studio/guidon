# Third-party skills

Copied as-is: instructions, plus `poteto-mode`'s and `reverse-engineer-marketing`'s own helper scripts, which run only when that skill is invoked. The licenses are in `LICENSES/`. To update one, copy the skill folder again from its source and change the commit below.

| Skills | Source | Commit | License |
|---|---|---|---|
| `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help` | https://github.com/DietrichGebert/ponytail (`skills/`) | 96608e0 | MIT, `LICENSES/ponytail.LICENSE` |
| pstack: `architect`, `arena`, `automate-me`, `benchmark-checklist`, `blast-radius`, `bro`, `correct`, `create-verification-skill`, `figure-it-out`, `how`, `in-your-own-words`, `interrogate`, `ketchup`, `maintain-verification-skill`, `no-comments`, `poteto-mode`, every `principle-*`, `recall`, `reflect`, `sharpen`, `show-me-your-work`, `swarm`, `tdd`, `teach`, `technical-writing`, `typescript-best-practices`, `unslop`, `why`; agent `.claude/agents/comment-sicko.md` | https://github.com/backnotprop/pstack (mirror of cursor/plugins `pstack`) | 25abb38 | MIT, `LICENSES/pstack.LICENSE` |
| `thermo-nuclear-code-quality-review` | https://github.com/cursor/plugins/tree/main/cursor-team-kit/skills/thermo-nuclear-code-quality-review | ae5650f | MIT, `LICENSES/cursor-team-kit.LICENSE` |
| marketingskills: `ab-testing`, `ad-creative`, `ads`, `ai-seo`, `analytics`, `aso`, `attribution`, `churn-prevention`, `co-marketing`, `cold-email`, `community-marketing`, `competitor-profiling`, `competitors`, `content-strategy`, `conversion-tracking`, `copy-editing`, `copywriting`, `cro`, `customer-research`, `directory-submissions`, `emails`, `events`, `free-tools`, `image`, `influencer-marketing`, `launch`, `lead-magnets`, `link-building`, `marketing-council`, `marketing-ideas`, `marketing-loops`, `marketing-plan`, `marketing-psychology`, `offers`, `onboarding`, `paywalls`, `popups`, `pricing`, `product-marketing`, `programmatic-seo`, `prospecting`, `public-relations`, `referrals`, `reverse-engineer-marketing`, `revops`, `sales-enablement`, `schema`, `seo-audit`, `signup`, `site-architecture`, `sms`, `social`, `video` | https://github.com/coreyhaines31/marketingskills (`skills/`) | e690ca8 | MIT, `LICENSES/marketingskills.LICENSE` |

Left out on purpose:

- **ponytail's hooks:** these are scripts that run on every tool call.
- **pstack's `make-bot-ui`, `setup-pstack` and `poteto-help`:** Cursor routines and setup, including `curl … | sudo sh`.
- **pstack's `ketchup-video`:** it needs video tooling.
- **pstack's `statechart`, `create-formal-verification-skill` and `maintain-formal-verification-skill`:** about 4 MB of TLA+ tooling that needs Java.
- **pstack's `poteto-agent`:** it looks for Cursor's plugin folder.
- **marketingskills' `evals/` folders:** the author's test prompts, not needed to use the skills. `reverse-engineer-marketing/scripts/teardown.mjs` is kept: it fetches public pages (and optional APIs with your own keys) only when that skill runs it.

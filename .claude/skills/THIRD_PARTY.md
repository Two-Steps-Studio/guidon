# Third-party skills

Copied as-is: instructions, plus `poteto-mode`'s own helper scripts, which run only when `/poteto-mode` is invoked. The licenses are in `LICENSES/`. To update one, copy the skill folder again from its source and change the commit below.

| Skills | Source | Commit | License |
|---|---|---|---|
| `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help` | https://github.com/DietrichGebert/ponytail (`skills/`) | 96608e0 | MIT, `LICENSES/ponytail.LICENSE` |
| pstack: `architect`, `arena`, `automate-me`, `benchmark-checklist`, `blast-radius`, `bro`, `correct`, `create-verification-skill`, `figure-it-out`, `how`, `in-your-own-words`, `interrogate`, `ketchup`, `maintain-verification-skill`, `no-comments`, `poteto-mode`, every `principle-*`, `recall`, `reflect`, `sharpen`, `show-me-your-work`, `swarm`, `tdd`, `teach`, `technical-writing`, `typescript-best-practices`, `unslop`, `why`; agent `.claude/agents/comment-sicko.md` | https://github.com/backnotprop/pstack (mirror of cursor/plugins `pstack`) | 25abb38 | MIT, `LICENSES/pstack.LICENSE` |
| `thermo-nuclear-code-quality-review` | https://github.com/cursor/plugins/tree/main/cursor-team-kit/skills/thermo-nuclear-code-quality-review | ae5650f | MIT, `LICENSES/cursor-team-kit.LICENSE` |

Left out on purpose:

- **ponytail's hooks:** these are scripts that run on every tool call.
- **pstack's `make-bot-ui`, `setup-pstack` and `poteto-help`:** Cursor routines and setup, including `curl … | sudo sh`.
- **pstack's `ketchup-video`:** it needs video tooling.
- **pstack's `statechart`, `create-formal-verification-skill` and `maintain-formal-verification-skill`:** about 4 MB of TLA+ tooling that needs Java.
- **pstack's `poteto-agent`:** it looks for Cursor's plugin folder.

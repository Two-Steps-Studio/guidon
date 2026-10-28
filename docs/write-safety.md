# Write safety: nothing typed is lost, nothing fails silently

Guidon task `2c58ba34`. What the board and task dialogs guarantee, and which
test checks each guarantee.

| Scenario | What happens | Test |
|---|---|---|
| Two people save the same task | The second save is refused (`revision`). The form, "Download my edits" and "Reload latest task" stay available | `tests/e2e/task-editing.mjs` |
| Closing a dialog, navigating away or reloading with unsaved changes | Guidon asks first (`useGuardedClose`, `beforeunload`) | `task-editing.mjs` |
| A card is moved and the request never reaches the server | The card goes back to its column. The toast says so and offers **Retry** | `tests/e2e/write-safety.mjs` |
| A bulk action never reaches the server | Nothing changes on the board. An error is shown | (same code path as a move) |
| Save, create or delete without a network | The form stays open with the text. The message says nothing was saved. Saving again works | `write-safety.mjs` |
| Browser crash, killed mobile tab, accidental reload | Unsaved task edits and a half-written new task are kept in this browser and restored on reopening, with a notice and "Discard them" | `write-safety.mjs` |
| A restored edit when someone else changed the task meanwhile | It saves against the revision it started from, so it gets the normal conflict screen and never overwrites the newer change | `revision` check, `task-editing.mjs` |
| A create whose response was lost after the insert committed | The retry returns the same task (the form picks the id once); no duplicate | `write-safety.mjs` |
| Comment or subtask that fails | The text goes back into the input with the error | `task-comments-section.tsx`, `task-subtasks-section.tsx` |
| Sign-out on a shared computer | All drafts on the device are removed | `write-safety.mjs` |

The E2E tests run on every PR in Chromium, Firefox and WebKit
(`.github/workflows/release-e2e.yml`).

## Drafts

`src/lib/work/task-drafts.ts`, in `localStorage`:

- **Key:** `guidon:task-draft:v1:<user>:<task id | new:<project>>`.
- **Lifetime:** removed after a successful save, a delete or "Discard"; expires after 7 days.
- **Privacy:** only restored for the same user; cleared at sign-out.
- **What's not kept:** attachments picked for a new task. A browser can't put files back into a file input.

## Not covered yet

- **Offline queue.** A change made without a network is never sent later on its own. The person retries. This is deliberate for the beta: a queue that replays old edits is a new way to overwrite someone's newer work.
- **Retry after an edit that committed but whose response was lost.** The retry gets a conflict, because the revision has moved on. "Reload latest task" shows that the change is there. Nothing is lost, but the message is more alarming than it needs to be.
- **Automatic rollback of a bad release.** That needs production access (Vercel Instant Rollback plus an alert). It belongs to the owner's launch task `f141afb1`, not to this code. The E2E gate on every PR is what stops a regression before it ships.

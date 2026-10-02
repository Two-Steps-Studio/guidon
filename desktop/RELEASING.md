# Releasing Guidon Desktop

Releases are built by GitHub Actions (`.github/workflows/desktop-release.yml`)
on a Windows runner: signed NSIS/MSI installers, their `.sig` files and the
updater's `latest.json`, attached to a **draft** GitHub Release. You review
the draft and publish it; from that moment "Check for Updates" (and the
startup check) in every installed copy offers the new version.

The manual process further down still works and is kept as the fallback.

## One-time setup: the signing key

The updater (`tauri-plugin-updater`) requires every release artifact to be
signed, and the running app only trusts artifacts signed with the private
key matching the public key baked into `src-tauri/tauri.conf.json`
(`plugins.updater.pubkey`).

A keypair already exists for this project, generated with:

```bash
npm run tauri -- signer generate -w ~/.tauri/guidon-desktop.key
```

This produced two files, both **outside** this repository:

- `~/.tauri/guidon-desktop.key` - the **private** key. Keep it secret;
  anyone with this file (and its password) can produce updates your users'
  installs will trust. Do not commit it, attach it to an issue/PR, or put
  it anywhere under `desktop/`. Back it up somewhere durable and
  access-controlled (a password manager's file storage, a secrets vault,
  etc.) - losing it means you can never ship a trusted update again
  without asking every existing install to reinstall from scratch with a
  new key.
- `~/.tauri/guidon-desktop.key.pub` - the **public** key, already copied
  into `src-tauri/tauri.conf.json`'s `plugins.updater.pubkey`. This one is
  fine to have in the repo; it's only useful for verifying signatures, not
  producing them.

The key was generated with a password (stored alongside it by whoever
generated it, not in this repo). You'll need both the key file and its
password for every release below, supplied via environment variables, not
command-line flags (so they don't end up in shell history or process
listings):

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/guidon-desktop.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<the key's password>"
```

(`TAURI_SIGNING_PRIVATE_KEY` also accepts a path to the key file instead
of its contents - see `TAURI_SIGNING_PRIVATE_KEY_PATH` in `tauri signer
generate`'s own output if you'd rather not read the file into an env var.)

If this key is ever lost or compromised, generate a new one the same way,
update `pubkey` in `tauri.conf.json`, and understand that every existing
install will stop being able to verify (and thus install) further updates
signed with the old key - they'd need to download a fresh installer
manually.

## One-time setup: repository secrets

The workflow signs with the same key as above, from two repository secrets
(GitHub → repository Settings → Secrets and variables → Actions → New
repository secret):

- `TAURI_SIGNING_PRIVATE_KEY` - the **contents** of `~/.tauri/guidon-desktop.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - its password

Without them the workflow stops at its first step with an error saying so.

## Cutting a release (GitHub Actions)

1. **Bump the version** in `src-tauri/tauri.conf.json`, `package.json`
   (and `package-lock.json`'s two top entries) and `src-tauri/Cargo.toml` -
   all must match; the workflow checks. `tauri.conf.json`'s `version` is what
   the updater compares against `latest.json`.
2. **Add a `## <version>` section to `CHANGELOG.md`.** It becomes the GitHub
   Release text and the notes in `latest.json`; the workflow fails without it.
3. **Merge to `main`, then tag that commit:**

   ```bash
   git tag desktop-v1.0.0
   git push origin desktop-v1.0.0
   ```

   (Or run "Desktop release" by hand from the Actions tab - it creates the
   tag itself from `tauri.conf.json`'s version.)
4. **Wait for the run** (~15 minutes) and open the draft release it created
   ("Guidon Desktop <version>"). It should carry the `.exe` and `.msi`
   installers, a `.sig` for each, and `latest.json`.
5. **Publish** the draft, leaving "Set as the latest release" checked. The
   updater reads `releases/latest/download/latest.json`, so **only desktop
   releases may be marked latest** in this repository - mark any other kind
   of release (if one ever exists) as not-latest, or every installed app
   stops seeing updates.
6. **Verify** with an older install: start it (the startup check should
   offer the update) or use "Check for Updates...".

Tags are `desktop-v*` rather than `v*` because this repository also holds
the web app and the editor plugins.

## Manual fallback

Only if Actions is unavailable.

1. **Bump the version** in `src-tauri/tauri.conf.json` (`"version"`) and
   `package.json` (`"version"`) - keep them in sync. `tauri.conf.json`'s
   `version` is what the updater compares against the manifest's
   `version` field to decide whether an update is "newer."

2. **Build and sign the installers.** The default `npm run tauri build`
   (verified during Task 5) deliberately does *not* produce signed update
   artifacts - `bundle.createUpdaterArtifacts` is left unset in
   `tauri.conf.json` so a plain build (e.g. in CI, or a contributor without
   the signing key) still succeeds. Turn it on for a release build only,
   via a config override, with the signing env vars from above set:

   ```bash
   npm run tauri build -- --config '{"bundle":{"createUpdaterArtifacts":true}}'
   ```

   This produces, under `src-tauri/target/release/bundle/`:
   - `msi/Guidon Desktop_<version>_x64_en-US.msi` and a `.msi.sig` next to it
   - `nsis/Guidon Desktop_<version>_x64-setup.exe` and a `.exe.sig` next to it

   Each `.sig` file is the signature the updater checks against `pubkey`
   before installing - both the installer and its `.sig` need to be
   uploaded together.

3. **Generate `latest.json`.** The updater's `endpoints` config
   (`tauri.conf.json`) points at
   `https://github.com/Two-Steps-Studio/guidon/releases/latest/download/latest.json`
   - a static manifest naming the current version, its release notes, and
   a per-platform download URL + signature. Tauri's bundler doesn't
   currently write this file for you from a plain CLI build; hand-assemble
   it (or use the `tauri-apps/tauri-action` GitHub Action if/when this
   becomes an Actions workflow, which generates it automatically) in this
   shape:

   ```json
   {
     "version": "<version>",
     "notes": "<release notes>",
     "pub_date": "<ISO 8601 timestamp>",
     "platforms": {
       "windows-x86_64": {
         "signature": "<contents of the .exe.sig or .msi.sig file>",
         "url": "https://github.com/Two-Steps-Studio/guidon/releases/download/desktop-v<version>/Guidon Desktop_<version>_x64-setup.exe"
       }
     }
   }
   ```

   Prefer the NSIS (`.exe`) artifact over the MSI for the `windows-x86_64`
   entry unless there's a specific reason to standardize on MSI - either
   works, but only publish one as the update target to avoid ambiguity.

4. **Create the GitHub Release** for this repo
   (`Two-Steps-Studio/guidon`), tagged `desktop-v<version>`, and upload:
   - the installer(s) from step 2
   - their `.sig` file(s)
   - `latest.json` from step 3

   The manifest URL configured in `tauri.conf.json` only resolves once a
   release exists at `.../releases/latest` with a `latest.json` asset
   attached - that's why "Check for Updates" reports "up to date" or a
   fetch error today (Task 5 was verified with no release published yet;
   see `README.md`'s "Auto-update" section).

5. **Verify** by installing the *previous* version, running it, and using
   "Check for Updates" - it should report the new version, offer to
   install, and succeed.

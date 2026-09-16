# Releasing Guidon Desktop

This is a manual process for now - there's no GitHub Actions release
workflow yet (a reasonable future addition, out of scope for the
auto-update wiring this doc accompanies). It covers cutting a new version,
producing signed installers, and publishing them so existing installs'
"Check for Updates" menu item (see `README.md`'s "Auto-update" section)
can find them.

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

## Cutting a release

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
         "url": "https://github.com/Two-Steps-Studio/guidon/releases/download/v<version>/Guidon Desktop_<version>_x64-setup.exe"
       }
     }
   }
   ```

   Prefer the NSIS (`.exe`) artifact over the MSI for the `windows-x86_64`
   entry unless there's a specific reason to standardize on MSI - either
   works, but only publish one as the update target to avoid ambiguity.

4. **Create the GitHub Release** for this repo
   (`Two-Steps-Studio/guidon`), tagged `v<version>`, and upload:
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

## Future improvement

A GitHub Actions workflow (e.g. built around
[`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action))
could automate steps 2-4, including `latest.json` generation, triggered by
a version tag push, with the signing key stored as a repo secret. Not
built as part of this task; the manual process above is the documented
baseline it would replace.

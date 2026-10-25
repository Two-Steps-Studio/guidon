# Publish packages from GitHub on an iPhone

These workflows require no local checkout or terminal. Use Safari (GitHub's app
may open web pages for Actions and settings). If a control is hidden, tap the
Safari page menu → **Request Desktop Website**. You need repository admin access,
npm publishing rights for `@guidon/sdk` and `guidon-cli` (including membership in
or ownership of the npm `guidon` organization), and ownership of the PyPI project.
GitHub and npm organizations are separate; repository access does not grant npm rights.

## Current audit and licensing prerequisite

| Directory | Registry name | Current version | License metadata |
| --- | --- | --- | --- |
| `packages/sdk-js` | npm `@guidon/sdk` | `0.1.0` | MIT |
| `packages/cli` | npm `guidon-cli` | `0.1.0` | MIT |
| `sdk/python` | PyPI `guidon-sdk` (import `guidon`) | `0.1.0` | MIT |

The owner selected MIT for SDKs and CLI. Each package above includes its own
MIT licence text and metadata. This decision applies to those standalone
packages; it does not license the hosted service, app, brand or the rest of the
repository. The root README distinguishes this scope from the unresolved app
licence.

Publishing still requires package-name ownership and registry authentication.
Validation-only runs build and inspect the actual archives. The publication
guard continues to reject missing metadata, `UNLICENSED`, and archives without
a LICENSE file; do not remove it to force a release.

## 1. GitHub setup (Safari)

1. Review and merge the workflow PR at
   <https://github.com/Two-Steps-Studio/guidon/pulls>. Merging does **not** publish.
2. Open <https://github.com/Two-Steps-Studio/guidon/settings/actions> → General.
   Allow Actions and the actions used here (`actions/*` and
   `pypa/gh-action-pypi-publish`). Keep default workflow permissions read-only;
   publishing jobs request `id-token: write` themselves. No write-enabled
   `GITHUB_TOKEN` is needed and no registry token is used by OIDC.
3. Open <https://github.com/Two-Steps-Studio/guidon/settings/environments>.
   Create environments with the exact names **npm** and **pypi**.
   Set **Deployment branches and tags** → **Selected branches and tags** → add
   branch **main**, with no tags. Add required reviewers if your GitHub plan
   supports them; ensure an eligible reviewer can approve runs. Keep these names
   identical in GitHub and the registry publisher forms.
4. Do not add `NPM_TOKEN`, `PYPI_API_TOKEN`, or Guidon API credentials. Tests use
   mock HTTP servers and do not need the production Guidon service.

Both workflows accept only manual `workflow_dispatch` events. The `publish`
checkbox defaults to false. Publishing additionally requires this repository and
`refs/heads/main`; selecting another branch can only validate. There are no push,
tag, release, schedule, or workflow-completion publishing triggers. All package
runs share one non-cancelling concurrency group to avoid simultaneous publication.

## 2. npm trusted publisher setup

For **each existing npm package**, sign in at <https://www.npmjs.com> with an
account that can administer its publishing settings:

1. Open <https://www.npmjs.com/package/@guidon/sdk/access> and then
   <https://www.npmjs.com/package/guidon-cli/access> (or the package page →
   **Settings** → **Trusted publishing**).
2. Add a trusted publisher and select **GitHub Actions**. Enter exactly:

   | Field | Value for both packages |
   | --- | --- |
   | Organization or user | `Two-Steps-Studio` |
   | Repository | `guidon` |
   | Workflow filename | `publish-npm.yml` |
   | Environment | `npm` |

   The workflow filename is the basename, not its display name or full path.
3. If the form shows **Allowed actions**, enable direct **npm publish**;
   this workflow uses `npm publish`, not staged publishing. Save. Use GitHub-hosted runners as configured here. npm trusted publishing
   requires Node 22.14+ and npm 11.5.1+; these workflows use Node 24 and npm 11.9.0.
   The public repository and `--provenance` attach provenance to npm releases.
4. A newly configured npm publisher must complete its first successful publish
   within **2 days**. Configure it shortly before an intentional release; if it
   expires, delete and recreate it before publishing. Do not publish just to test
   setup.
5. After bootstrap, remove temporary publishing tokens and use your package's
   publishing-access settings to restrict token-based publication as appropriate.
   Trusted publishing authenticates directly with GitHub OIDC; no npm secret is
   needed for normal releases.

### If a package does not exist on npm yet

npm trusted publishing cannot bootstrap a nonexistent package. PyPI supports
pending publishers, but npm needs a first publication before package settings
exist. The manual npm workflow includes a temporary **bootstrap-token** mode so
that even the first publication can happen from your iPhone:

1. On npm, confirm `@guidon/sdk` and `guidon-cli` are available or controlled by
   your account. If somebody else owns a name, stop and resolve ownership; do not
   silently rename packages. Create/join the `guidon` npm organization if needed.
2. npm account menu → **Access Tokens** → **Generate New Token** → granular token.
   Give it the shortest practical expiry and only the package/scope permissions
   required to create/publish the missing packages. Enable **Bypass 2FA** for
   noninteractive publishing if offered/required by your npm account policy.
   First publication requires creation rights; a token restricted only to an
   unrelated existing package will fail. If your organization forbids this mode,
   an npm administrator must arrange the initial publication/ownership.
3. GitHub repository → **Settings** → **Environments** → **npm** →
   **Environment secrets** → **Add secret**. Name it **NPM_BOOTSTRAP_TOKEN** and
   paste the token as its value. Never paste it into a file, workflow input, issue,
   PR, or chat. The workflow writes an environment-variable placeholder to a
   temporary npmrc, removes it afterwards, and never prints the token.
4. Only when you intentionally want the first publication, follow the release
   procedure below with authentication **bootstrap-token** and the appropriate
   target. **both** publishes SDK first and then CLI. This is a real publication.
5. Configure both trusted publishers using the table above after their first
   publication. Revoke the token on npm and delete the GitHub environment secret.
   Future runs must use **oidc** (the default).

If the SDK already exists but the CLI does not, bootstrap with target **cli**;
first ensure the exact SDK version in this checkout is published. Do not republish
an immutable existing version to bootstrap another package.

## 3. PyPI trusted publisher setup

1. Sign in at <https://pypi.org>, verify your email, and configure account 2FA.
2. If `guidon-sdk` already exists and you own it, open
   <https://pypi.org/manage/project/guidon-sdk/settings/publishing/> and add a
   **GitHub** trusted publisher. If it does not exist, open
   <https://pypi.org/manage/account/publishing/> → **Add a new pending publisher**.
3. Enter:

   | Field | Value |
   | --- | --- |
   | PyPI project name (pending publisher only) | `guidon-sdk` |
   | Owner | `Two-Steps-Studio` |
   | Repository name | `guidon` |
   | Workflow name / filename | `publish-pypi.yml` |
   | Environment name | `pypi` |

4. Save. A pending publisher creates the project on the first successful upload
   if the name is available. It does not guarantee reservation/ownership of a name.
   No PyPI password or API token belongs in GitHub. This workflow targets real
   PyPI, not TestPyPI; TestPyPI requires its own separate publisher configuration.

## 4. Validate without publishing

1. Open <https://github.com/Two-Steps-Studio/guidon/actions>.
2. Select **Publish npm packages (manual)** or **Publish Python SDK (manual)**.
3. Tap **Run workflow**, select **main**, leave **publish unchecked**, and run.
   npm's target/authentication inputs affect publication only; validation checks
   both npm packages regardless of target and does not use publishing credentials.
4. Open the run to read build/test/validation logs. The run's **Artifacts** section
   contains `npm-packages` or `python-packages` for inspection/download.

npm validation uses the existing SDK and CLI mock-server test suites, builds
TypeScript, packs both packages, validates metadata/entrypoints/dependencies, and
installs both tarballs outside the workspace to check imports and CLI startup.
Python validation runs the existing unittest suite, builds wheel and sdist,
runs `twine check --strict`, checks metadata and `py.typed`, and installs each
artifact in a fresh virtual environment outside the checkout. Publication uses
these exact archived artifacts; it does not rebuild them in publishing jobs.

## 5. Intentionally publish later

**Nothing in this PR runs this step for you.** Resolve licensing, configure the
registry publishers, and inspect a successful validation-only run first.

1. Check the version is unused on each registry's **Versions / Release history**.
   npm and PyPI releases cannot be overwritten. Every package starts at `0.1.0`;
   this PR does not bump versions or create GitHub tags/releases.
2. For a new version, use GitHub's web editor and a reviewed PR. Synchronize
   `packages/sdk-js/package.json` with `packages/sdk-js/src/version.ts`, and
   `sdk/python/pyproject.toml` with `sdk/python/src/guidon/_version.py`.
   Bump `packages/cli/package.json` when releasing CLI changes. Its SDK dependency
   must be the checkout SDK version, `^<version>`, or `~<version>`.
   Update and commit the root `package-lock.json` with corresponding workspace
   metadata too (GitHub Codespaces in Safari can run npm to update it if needed).
   Workflow installation uses `npm ci` and will reject a stale lockfile.
3. Actions → desired workflow → **Run workflow** → branch **main** → deliberately
   check **publish**. For npm choose **oidc** and normally **both**. Approve the
   environment deployment if required. A run uses the commit selected when it
   started; later commits require a new validation run.
4. The npm SDK publishing job must succeed before the CLI publishing job starts.
   CLI-only runs also require the exact checkout SDK version to exist on npm;
   the check retries briefly for registry propagation. Python publishes separately.
5. Confirm the new versions on npm/PyPI and inspect npm provenance / PyPI
   attestations. No GitHub release is created.

If SDK publication succeeds but CLI fails, fix the problem and run target **cli**
with an unused CLI version; do not rerun **both** for the already-published SDK
version. For Python, resolve errors before rerunning; never enable skip-existing
to disguise a partially published release. For OIDC failures, compare owner,
repository, filename and environment character-for-character; confirm this is a
main-branch run in the original repository and the npm package already exists.

Registry references: [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/),
[PyPI trusted publisher setup](https://docs.pypi.org/trusted-publishers/adding-a-publisher/),
and [PyPI pending publishers](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/).

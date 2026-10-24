# Custom project modules

Open **Project → Custom modules**. Project owners and admins can install a
preset from the catalog, edit its JSON, and save it to the project. All people
with project access can read the saved modules. Existing built-in sections
remain configurable in Project settings.

The catalog provides a release checklist and a research hub. Choose a preset,
edit its content, select **Apply module**, then **Save to project**. Checkbox
changes and removals also need **Save to project**. An unsaved-changes message
stays visible until the save succeeds. Changes in another session produce a
conflict instead of silently overwriting that session: export the local draft,
reload, then merge and import the changes.

Use **Copy AI prompt** to ask an AI to generate a module for your workflow.
Paste the returned JSON into the editor and apply it. **Import JSON** accepts
either one module or an array; export downloads an array you can share with
another project. Imported IDs must be unique within the project. Imports append
to the current draft; they do not replace existing modules.

## Format

```json
{
  "version": 1,
  "id": "release-notes",
  "title": "Release notes",
  "description": "Our release workflow",
  "blocks": [
    { "type": "text", "title": "Scope", "text": "Describe this release." },
    { "type": "checklist", "title": "Review", "items": [{ "label": "Tests pass", "done": false }] },
    { "type": "links", "title": "Resources", "items": [{ "label": "Docs", "url": "https://useguidon.com/developers" }] }
  ]
}
```

Limits: 20 modules per project, 20 blocks per module, 30 entries per list,
100 characters per title/label, 500 per description and 4,000 per text block.
Module IDs start with a lowercase letter and contain at most 64 lowercase
letters, digits or hyphens. A project stores at most 64,000 JSON characters;
import files are capped at 100,000 bytes. Links accept HTTP(S) only. Text is
rendered as text, and modules cannot execute scripts, HTML or embedded frames.

## Renderer and access boundaries

The current renderer supports exactly three block types: `text` (plain React
text), `checklist` (bounded labels and boolean state), and `links` (labels plus
validated HTTP(S) URLs). It does not parse Markdown or HTML, create elements
from user-provided tag names, load remote frames, or run module-supplied code.
React escapes titles, descriptions, block text and labels during rendering.
External links open with `noopener noreferrer`.

The project page checks membership before loading module data. Project RLS
limits reads to users with project access, and the save action separately
requires an owner/admin role; checklist edits are disabled for read-only roles.
Migration 079 adds only bounded JSON storage to `projects`, so it inherits the
existing project tenant boundary instead of introducing a cross-project module
table. The database compatibility suite covers a different tenant being unable
to overwrite modules, a developer being able to read but not edit, and
optimistic revision conflicts.

Content blocks remain separate from installable data modules. The latter use
the five declarative views described in [the runtime guide](module-runtime.md).

This first version has a curated preset catalog and portable JSON sharing.
It does not provide public user publishing, payments, third-party executable
plugins or marketplace moderation. Those need a separate product and runtime
design before a public marketplace launch.

## Deployment

Apply migration `079_custom_modules.sql` before deploying. The existing
project RLS policy protects the new fields. There is no backfill: projects
start with an empty array and revision zero. Verify creating, reading, editing,
exporting and importing a module with two project admins in separate sessions.
Check that another tenant cannot access the project, and that read-only members
see saved content but cannot change it.

## Installable module packages

The JSON format on this page is the existing project-content module format.
Its integer `version: 1` is not SemVer. Installable package manifests use a
separate proposed format documented in
[`RFC 0001`](rfcs/0001-module-manifest-v1.md), with its own JSON Schema and
validator. They are not accepted by this editor and do not execute code.
Use the **Data modules** section below the content editor to install a manifest.

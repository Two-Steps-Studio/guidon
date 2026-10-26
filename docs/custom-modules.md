# Project modules

Open **Project → Modules**. A module is a project section of its own: it gets
a tab in the project sidebar (grouped under its category, or under *Custom
modules*), and the Modules page lists every module with **Open** and
**Configuration**. Project owners and admins add modules; everyone with
project access reads them.

There is one kind of module, a package described by a
[Manifest v1](rfcs/0001-module-manifest-v1.md):

- **Pages** (`page` view): notes, checklists and lists of links. Checking an
  item saves immediately; **Add item**, **Edit** and **Remove** change one
  entry in place.
- **Data**: entities with typed fields shown as tables, forms, boards, charts
  and calendars ([runtime guide](module-runtime.md)).

One module can combine both. Whatever the project writes is module data
(records), never part of the manifest, so updating a module to a new version
keeps it.

## Adding a module

On the Modules page:

- **Templates**: *Release checklist*, *Research hub* (pages) and *Release
  planning* (data, with two example entries). A template is a fresh copy
  each time.
- **Import JSON file** or paste a module: a manifest, or a module in the
  pre-092 content format (`{"version":1,"id":...,"blocks":[...]}`, also what
  older exports and **Copy AI prompt** produce) - converted to a page module
  with its checklist state and texts as entries.
- **Browse Marketplace** for published modules, or describe what you need in
  the **AI Module Builder** below the list.

Review the requested permissions, approve them and install. A module that
can show data opens in its new tab. A project holds at most 20 installed
modules; uninstalled ones keep their data (`module-lifecycle.md`).

Rendering is fixed React elements only: titles, texts and labels are text
children, links accept absolute `http:`/`https:` addresses and open with
`noopener noreferrer`. Modules cannot run scripts, HTML or frames.

## Content modules before migration 092

Until 092, content modules (text/checklist/links blocks) were a JSON array on
the project (`projects.custom_modules`, migration 079) with their own editor.
092 converts each into a package under the same id (`<id>-page` if the id was
taken): a `page` view, one entity per block (`notes-<n>`, `checklist-<n>`,
`links-<n>`), the texts, items and checked state as records, and the category
in settings. The old column stays untouched as a rollback copy and is no
longer read; old `/extensions/content/<id>` links redirect to the module's
tab. `convertContentModule` (`src/lib/work/module-legacy.ts`) is the same
conversion for imported files; `test:db` section 76 checks that the SQL and
TypeScript conversions agree.

## Deployment

Apply migration `092_content_modules_as_packages.sql` after 091, then deploy.
Running it twice is safe (already converted modules are skipped). A project
whose content modules and packages together exceed 20 keeps all of them and
can install another once it is under the cap again.

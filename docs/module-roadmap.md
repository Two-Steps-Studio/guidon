# Custom Modules 2.0 execution order

Source: Guidon project `6661ef0a-81d9-490e-bdf7-f954ed4accd4`.
The parent card is `[Feature] Custom Modules 2.0`; the older generic “Moduły”
cards must not be treated as proof that the entire system is complete.

1. Manifest, versions and permission contract — PR #48.
2. Declarative runtime, project data isolation and five view types — PR #50;
   PR #49 covers the previous content renderer only.
3. Marketplace navigation, real catalog and search — PR #51.
4. Module details, demo, compatibility and visible permissions — PR #51.
5. Installation wizard with project choice, roles, limits and atomic writes — PR #52.
6. My Modules: configuration, enable/disable, permission-aware updates,
   compatible rollback and retention/export on uninstall — PR #53.
7. AI Builder: prompt → approved plan → validated declarative manifest;
   see `module-ai-builder.md` for the initial planner and its boundaries.
8. AI Builder: three-pane editor/mobile tabs, draft history and conflicts.
9. Fixture-only live preview and pre-publication validation.
10. Visual inspector for fields/views/forms and return to AI without lost edits.
11. Private/org/public registry, immutable releases, moderation and audit.
12. Author dashboard and release history using real aggregates.
13. Marketplace QA: installation/version/tenant/E2E security gates.
14. Project module QA: CRUD/import/export/permissions/conflicts/files.
15. SDK + Monaco + isolated executable sandbox, after its security review.
16. Declarative automation and scoped API/MCP integration.
17. Paid modules: billing/entitlements/tax/refunds/payout design and sandbox tests;
    production payments or author payouts require the user's separate approval.

Each task is moved to Review with a PR and validation evidence when its actual
acceptance criteria are met. Unimplemented functionality remains open. Production
deployment is a separate approval step.

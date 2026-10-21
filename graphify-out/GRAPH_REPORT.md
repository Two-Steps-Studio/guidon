# Graph Report - guidon  (2026-10-21)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1212 nodes · 1653 edges · 172 communities (101 shown, 71 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `67ccdb35`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- context-tabs.tsx
- profile/page.tsx
- create-project-dialog.tsx
- memory/actions.ts
- mini-tasks.tsx
- knowledge/actions.ts
- webhooks-section.tsx
- stripe/webhook/route.ts
- billing/page.tsx
- organizations/[id]/members/page.tsx
- member-list.tsx
- phase-card-menu.tsx
- dashboard/page.tsx
- batch/route.ts
- pricing-section.tsx
- references/actions.ts
- projects/[id]/settings/page.tsx
- work/actions.ts
- files-browser.tsx
- github-actions.ts
- board-columns-form.tsx
- ai-accounts-manager.tsx
- technology-list.tsx
- start-wizard.tsx
- search/route.ts
- loopback.ts
- promo-code-forms.tsx
- ask/route.ts
- my-tasks-list.tsx
- createTask
- [provider]/callback/route.ts
- create-organization-dialog.tsx
- mcp/route.ts
- authorize/page.tsx
- plugins/page.tsx
- edit-project-dialog.tsx
- work-board.tsx
- [taskId]/route.ts
- ai-task-chat.tsx
- work/page.tsx
- reports/route.ts
- tasks/route.ts
- forgot-password-form.tsx
- auth/login/login-form.tsx
- signup/page.tsx
- link-form.tsx
- docs/route.ts
- attempts/route.ts
- logout-client.tsx
- discord/login/login-form.tsx
- finish-onboarding.tsx
- account/route.ts
- sandbox/route.ts
- api-catalog/route.ts
- layout.tsx
- [[...path]]/route.ts
- comment/route.ts
- mobile-login/page.tsx
- reset-password/page.tsx
- oauth-authorization-server/route.ts
- .well-known/mcp.json/route.ts
- opengraph-image.tsx
- sandbox/start/page.tsx
- admin/page.tsx
- a2a/route.ts
- mobile/token/route.ts
- references/route.ts
- report-keys/route.ts
- oauth/token/route.ts
- revoke/route.ts
- register/route.ts
- comments-actions.ts
- import-tasks-dialog.tsx
- upgrade/page.tsx
- about.md/route.ts
- about/page.tsx
- pinned-projects.ts
- pinned-tasks.ts
- admin/layout.tsx
- chat/route.ts
- health/route.ts
- docs/server-card/route.ts
- mcp/server-card/route.ts
- [jobId]/route.ts
- me/route.ts
- projects/route.ts
- v1/route.ts
- complete/route.ts
- context/route.ts
- start/route.ts
- status/route.ts
- auth/llms.txt/route.ts
- login.md/route.ts
- auth.md/route.ts
- signup.md/route.ts
- contact.md/route.ts
- contact/page.tsx
- developers/llms.txt/route.ts
- developers.md/route.ts
- developers/page.tsx
- feedback/actions.ts
- site.jsonl/route.ts
- index.md/route.ts
- eula/page.tsx
- privacy/page.tsx
- terms/page.tsx
- pricing.md/route.ts
- robots.txt/route.ts
- sandbox.md/route.ts
- sandbox/page.tsx
- schemamap.xml/route.ts
- agent-card.json/route.ts
- SKILL.md/route.ts
- index.json/route.ts
- ai-catalog.json/route.ts
- ard.json/route.ts
- http-message-signatures-directory/route.ts
- server-card.json/route.ts
- api/[...path]/route.ts
- decisions/[itemId]/route.ts
- decisions/route.ts
- knowledge/[itemId]/route.ts
- knowledge/route.ts
- memory/[itemId]/route.ts
- memory/route.ts
- roadmap/[itemId]/route.ts
- roadmap/route.ts
- technologies/[itemId]/route.ts
- technologies/route.ts

## God Nodes (most connected - your core abstractions)
1. `createTask()` - 11 edges
2. `importGuidonFile()` - 9 edges
3. `configFor()` - 8 edges
4. `apiErrorMessage()` - 7 edges
5. `moveTask()` - 7 edges
6. `MiniTasks()` - 7 edges
7. `updateReference()` - 6 edges
8. `updateTask()` - 6 edges
9. `FileCard()` - 6 edges
10. `MyTasksList()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `AdminLogsPage()` --calls--> `configFor()`  [EXTRACTED]
  admin/logs/page.tsx → projects/[id]/activity/action-config.ts
- `MiniTasks()` --calls--> `moveTask()`  [EXTRACTED]
  mini/mini-tasks.tsx → projects/[id]/work/actions.ts
- `MiniTasks()` --calls--> `createTask()`  [EXTRACTED]
  mini/mini-tasks.tsx → projects/[id]/work/actions.ts
- `ReportWidgetCard()` --calls--> `createReportWidgetKey()`  [EXTRACTED]
  projects/[id]/settings/report-widget-card.tsx → profile/api-keys-actions.ts
- `ReportWidgetCard()` --calls--> `revokeApiKey()`  [EXTRACTED]
  projects/[id]/settings/report-widget-card.tsx → profile/api-keys-actions.ts

## Import Cycles
- None detected.

## Communities (172 total, 71 thin omitted)

### Community 0 - "context-tabs.tsx"
Cohesion: 0.07
Nodes (34): createRelation(), deleteRelation(), ENTITY_TYPES, RELATION_TYPES, RelationFormState, RelationMutationResult, ContextTabs(), TabType (+26 more)

### Community 1 - "profile/page.tsx"
Cohesion: 0.08
Nodes (32): ProfileFormState, updateProfile(), ApiKeyRow, createApiKey(), CreateApiKeyState, createMcpConnectionKey(), createReportWidgetKey(), listApiKeys() (+24 more)

### Community 2 - "create-project-dialog.tsx"
Cohesion: 0.08
Nodes (30): createProject(), CreateProjectState, OrgAvatarState, updateOrganizationAvatar(), VALID_METHODOLOGIES, VALID_PROJECT_TYPES, CreateProjectDialog(), ImportFromFileForm() (+22 more)

### Community 3 - "memory/actions.ts"
Cohesion: 0.11
Nodes (27): acceptInsight(), correctAndAcceptInsight(), createMemory(), DecisionSummaryRow, deleteMemory(), deleteMemoryRow(), gatherInsightContext(), generateInsight() (+19 more)

### Community 4 - "mini-tasks.tsx"
Cohesion: 0.10
Nodes (20): MINI_FILTER_COOKIE, MINI_PROJECT_COOKIE, endOfColumnSortOrder(), MiniFilter, MiniProject, MiniTasks(), rememberInCookie(), metadata (+12 more)

### Community 5 - "knowledge/actions.ts"
Cohesion: 0.13
Nodes (17): createSource(), deleteSource(), DeleteSourceResult, parseSourceForm(), revalidateKnowledgeViews(), SourceFormState, updateSource(), VALID_TYPES (+9 more)

### Community 6 - "webhooks-section.tsx"
Cohesion: 0.15
Nodes (18): AiSettingsState, isOrgAiProviderName(), removeOrgAiSettings(), saveOrgAiSettings(), AiSettingsForm(), initialState, isRecommendedModel(), PROVIDER_LABELS (+10 more)

### Community 7 - "stripe/webhook/route.ts"
Cohesion: 0.17
Nodes (15): updateOrganizationPlan(), updateOrganizationProjectLimit(), UpdatePlanState, UpdateProjectLimitState, ORG_PROJECT_LIMIT_UNLIMITED_SENTINEL, PlanEditor(), ProjectLimitEditor(), handleEvent() (+7 more)

### Community 8 - "billing/page.tsx"
Cohesion: 0.15
Nodes (17): BillingGuard, createCheckoutSession(), createPortalSession(), requireBillingManager(), ManageBillingButton(), UpgradeButton(), BillingPage(), BillingTranslator (+9 more)

### Community 9 - "organizations/[id]/members/page.tsx"
Cohesion: 0.16
Nodes (14): addMember(), MemberActionState, removeMember(), removeUserFromOrgProjects(), updateMemberRole(), AddMemberDialog(), initialState, MemberActionsMenu() (+6 more)

### Community 10 - "member-list.tsx"
Cohesion: 0.16
Nodes (17): addMember(), AddMemberResult, assertManager(), ASSIGNABLE_BY, changeMemberRole(), MemberMutationResult, MemberRow, removeMember() (+9 more)

### Community 11 - "phase-card-menu.tsx"
Cohesion: 0.19
Nodes (12): createPhase(), deletePhase(), parsePhaseForm(), PhaseFormState, updatePhase(), VALID_STATUSES, CreatePhaseDialog(), initialState (+4 more)

### Community 12 - "dashboard/page.tsx"
Cohesion: 0.16
Nodes (14): AdminLogsPage(), ActivityRow, DashboardPage(), loadDashboard(), lowerFirst(), ProjectRow, startOfTodayUtc(), ACTION_CONFIG (+6 more)

### Community 13 - "batch/route.ts"
Cohesion: 0.14
Nodes (12): handlePOST(), handlerFor(), MethodTable, POST, readBody(), RESOURCE_COLLECTIONS, RESOURCE_ITEMS, RouteHandler (+4 more)

### Community 14 - "pricing-section.tsx"
Cohesion: 0.15
Nodes (15): displayFont, FEATURE_SECTIONS, FeatureSection, metadata, revalidate, CURRENCIES, Currency, displayFont (+7 more)

### Community 15 - "references/actions.ts"
Cohesion: 0.25
Nodes (13): deleteReference(), loadReferences(), normalizeTags(), normalizeUrl(), ProjectReference, Row, updateReference(), uploadReference() (+5 more)

### Community 16 - "projects/[id]/settings/page.tsx"
Cohesion: 0.05
Nodes (51): listReportWidgetKeys(), deleteProject(), SettingsFormState, syncTechnologies(), syncTechnologiesLocal(), updateProjectSettings(), VALID_METHODOLOGIES, VALID_PROJECT_TYPES (+43 more)

### Community 17 - "work/actions.ts"
Cohesion: 0.17
Nodes (9): POST(), deleteTask(), notifyTaskAssignment(), pickTaskPatch(), TASK_PATCH_COLUMNS, TaskActionResult, TaskMutationResult, TaskPatch (+1 more)

### Community 18 - "files-browser.tsx"
Cohesion: 0.21
Nodes (12): deleteFile(), FileActionState, getDownloadUrl(), uploadFile(), FILE_TYPE_COLORS, FILE_TYPE_ICONS, FileCard(), FilesBrowser() (+4 more)

### Community 19 - "github-actions.ts"
Cohesion: 0.26
Nodes (10): RepoPicker(), apiErrorMessage(), commitRepoFile(), CommitRepoFileOptions, CommitRepoFileResult, connectRepo(), getRepoFile(), installationsForPicker() (+2 more)

### Community 20 - "board-columns-form.tsx"
Cohesion: 0.21
Nodes (13): BoardColumnInput, BoardColumnsState, PriorityInput, updateBoardColumns(), updatePriorities(), validateList(), WorkflowSaveState, BoardColumnsForm() (+5 more)

### Community 21 - "ai-accounts-manager.tsx"
Cohesion: 0.29
Nodes (9): createAiAccountAction(), createAiAccountKeyAction(), disableAiAccountAction(), refresh(), revokeAiAccountKeyAction(), AiAccountsManager(), CreateAiAccountDialog(), ROLES (+1 more)

### Community 22 - "technology-list.tsx"
Cohesion: 0.20
Nodes (10): deleteTechnology(), saveTechnology(), TechnologyMutationResult, TechnologyResult, CATEGORY_ACCENT, CATEGORY_ICONS, EMPTY_FORM, TechForm (+2 more)

### Community 23 - "start-wizard.tsx"
Cohesion: 0.16
Nodes (8): dynamic, isSignedIn(), StartPage(), StartWizard(), STEPS, TEAM_ICONS, TEMPLATES, TYPE_ICONS

### Community 24 - "search/route.ts"
Cohesion: 0.19
Nodes (12): DecisionSearchRow, dedupeAndCap(), FileSearchRow, GET, handleGET(), MemorySearchRow, ProjectSearchRow, searchLocal() (+4 more)

### Community 25 - "loopback.ts"
Cohesion: 0.35
Nodes (10): authorizePluginLogin(), PLUGIN_KEY_SCOPES, isSafeLoopbackRedirect(), PLUGIN_CLIENTS, PluginClient, pluginClientLabel(), pluginKeyName(), resolvePluginClient() (+2 more)

### Community 26 - "promo-code-forms.tsx"
Cohesion: 0.29
Nodes (9): createPromoCode(), PromoCodeInput, setPromoCodeActive(), AdminPromoCodesPage(), codeStatus(), PromoCodeRow, CreatePromoCodeForm(), PromoCodeToggle() (+1 more)

### Community 27 - "ask/route.ts"
Cohesion: 0.26
Nodes (10): answer(), AskInput, CORS, failure(), GET, handle(), item(), POST (+2 more)

### Community 28 - "my-tasks-list.tsx"
Cohesion: 0.27
Nodes (9): dueDay(), Group, GROUP_ORDER, groupOf(), localDay(), MyTasksList(), MyTasksProject, metadata (+1 more)

### Community 30 - "createTask"
Cohesion: 0.23
Nodes (6): createTask(), TaskAttachment, uploadTaskAttachment(), CreateTaskDialog(), PendingFile, splitTags()

### Community 31 - "[provider]/callback/route.ts"
Cohesion: 0.55
Nodes (8): GET(), appOrigin(), callbackUrl(), findProvider(), loginErrorUrl(), OAUTH_COOKIE_PATH, OAUTH_STATE_COOKIE, GET()

### Community 32 - "create-organization-dialog.tsx"
Cohesion: 0.25
Nodes (7): createOrganization(), CreateOrganizationState, CreateOrganizationDialog(), initialState, OrgForm(), OrganizationRow, SupabaseMembershipRow

### Community 33 - "mcp/route.ts"
Cohesion: 0.31
Nodes (8): DELETE, GET, handle(), isToolCall(), jsonRpcError(), peekMessages(), POST(), RFC-9728

### Community 34 - "authorize/page.tsx"
Cohesion: 0.29
Nodes (8): decideAuthorization(), FIELDS, paramsFrom(), AuthorizePage(), hostOf(), isSignedIn(), metadata, ScopeKey

### Community 35 - "plugins/page.tsx"
Cohesion: 0.20
Nodes (8): CatalogPlugin, CATEGORIES, Category, DownloadKind, INSTALL_STEPS, KIND_KEYS, PluginId, PLUGINS

### Community 37 - "edit-project-dialog.tsx"
Cohesion: 0.27
Nodes (5): updateProject(), UpdateProjectState, EditableProject, EditProjectDialog(), initialState

### Community 38 - "work-board.tsx"
Cohesion: 0.33
Nodes (7): BulkOperation, BulkResult, bulkUpdateTasks(), BulkBar(), TaskDetailDialog, WorkBoard(), WorkState

### Community 39 - "[taskId]/route.ts"
Cohesion: 0.25
Nodes (6): DELETE, GET, handlePATCH(), isValidTaskPriority(), PATCH, PatchableColumn

### Community 42 - "ai-task-chat.tsx"
Cohesion: 0.33
Nodes (7): buildSystemPrompt(), ChatMessage, ChatResult, sendTaskChatMessage(), AiTaskChat(), DisplayMessage, ProposalRow

### Community 43 - "work/page.tsx"
Cohesion: 0.39
Nodes (8): loadCommentCounts(), loadCommentCountsLocal(), loadCoverImages(), loadCoverImagesLocal(), MemberRow, ProfileRow, ProjectWorkPage(), signCoverImagePaths()

### Community 44 - "reports/route.ts"
Cohesion: 0.36
Nodes (6): CORS_HEADERS, handlePOST(), handleReport(), isRlsRejection(), POST, withCors()

### Community 45 - "tasks/route.ts"
Cohesion: 0.32
Nodes (4): handlePOST(), POST, GET, POST

### Community 46 - "forgot-password-form.tsx"
Cohesion: 0.36
Nodes (4): requestPasswordReset(), RequestPasswordResetResult, ForgotPasswordForm(), dynamic

### Community 47 - "auth/login/login-form.tsx"
Cohesion: 0.36
Nodes (4): LoginActionResult, loginLocalAction(), LoginForm(), dynamic

### Community 48 - "signup/page.tsx"
Cohesion: 0.36
Nodes (4): SignupActionResult, signupLocalAction(), dynamic, SignupForm()

### Community 49 - "link-form.tsx"
Cohesion: 0.36
Nodes (4): AttachGuildState, attachGuildToProject(), DiscordLinkForm(), LinkableProject

### Community 50 - "docs/route.ts"
Cohesion: 0.33
Nodes (5): buildServer(), DELETE, GET, POST(), READ_ONLY

### Community 51 - "attempts/route.ts"
Cohesion: 0.29
Nodes (4): AttemptOutcome, GET, OUTCOMES, POST

### Community 52 - "logout-client.tsx"
Cohesion: 0.43
Nodes (3): logoutLocalAction(), LogoutClient(), dynamic

### Community 53 - "discord/login/login-form.tsx"
Cohesion: 0.43
Nodes (3): confirmDiscordLogin(), DiscordLoginState, DiscordLoginForm()

### Community 54 - "finish-onboarding.tsx"
Cohesion: 0.43
Nodes (3): completeOnboarding(), FinishOnboarding(), dynamic

### Community 55 - "account/route.ts"
Cohesion: 0.47
Nodes (5): DELETE, GET, handleDELETE(), handleGET(), personalIdentity()

### Community 56 - "sandbox/route.ts"
Cohesion: 0.47
Nodes (5): describe(), GET, handleGET(), handlePOST(), POST

### Community 57 - "api-catalog/route.ts"
Cohesion: 0.40
Nodes (4): RFC-9727, catalog(), GET(), headers

### Community 58 - "layout.tsx"
Cohesion: 0.33
Nodes (4): geistMono, geistSans, metadata, viewport

### Community 61 - "[[...path]]/route.ts"
Cohesion: 0.33
Nodes (3): headers, RESOURCES, RFC-9728

### Community 63 - "mobile-login/page.tsx"
Cohesion: 0.60
Nodes (3): authorizeMobileLogin(), isSignedIn(), MobileLoginPage()

### Community 67 - "opengraph-image.tsx"
Cohesion: 0.40
Nodes (3): alt, contentType, size

## Knowledge Gaps
- **314 isolated node(s):** `RelationMutationResult`, `TabType`, `McpClient`, `StepHint`, `AddMemberResult` (+309 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **71 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createTask()` connect `createTask` to `mini-tasks.tsx`, `work-board.tsx`, `ai-task-chat.tsx`, `batch/route.ts`, `work/actions.ts`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `MiniTasks()` connect `mini-tasks.tsx` to `my-tasks-list.tsx`, `createTask`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **What connects `RelationMutationResult`, `TabType`, `McpClient` to the rest of the system?**
  _314 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `context-tabs.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06857142857142857 - nodes in this community are weakly interconnected._
- **Should `profile/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08484848484848485 - nodes in this community are weakly interconnected._
- **Should `create-project-dialog.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07564102564102564 - nodes in this community are weakly interconnected._
- **Should `memory/actions.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10960960960960961 - nodes in this community are weakly interconnected._
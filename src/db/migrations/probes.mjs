/**
 * One read-only SQL check per migration: true once that migration has been
 * applied. Used by scripts/db-catch-up.mjs for databases whose migrations
 * were pasted by hand (no guidon_migrations registry), e.g. a Supabase
 * project kept up to date through the SQL editor.
 *
 * Each probe names something the migration creates and nothing before it
 * does - verified by applying the chain to an empty database one file at a
 * time (scripts/db-catch-up.mjs --verify). A new migration needs a probe
 * here; the generator refuses to run without one.
 *
 * 038 and 052 only re-assert state (status CHECK, Free subscriptions) and
 * are safe to run again, so their probes may say "applied" early.
 */
export const MIGRATION_PROBES = {
  "000_baseline_schema.sql":
    "(to_regclass('public.profiles') IS NOT NULL) AND (to_regclass('public.organizations') IS NOT NULL)",
  "001_initial_schema.sql":
    "(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='is_org_member')) AND (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='org_role'))",
  "002_task_status_and_project_slug.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='slug')) AND (EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_tasks_project_status_sort'))",
  "003_profile_visibility.sql":
    "(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='shares_workspace_with')) AND (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_select_team'))",
  "004_project_slug_autofill.sql":
    "(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='slugify')) AND (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='next_project_slug'))",
  "005_project_creator_and_drift.sql":
    "(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='set_organization_creator')) AND (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='set_project_creator'))",
  "006_fix_service_role_detection.sql":
    "(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='is_service_role'))",
  "007_allow_parent_delete.sql":
    "EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='protect_org_owner' AND pg_get_functiondef(p.oid) LIKE '%FROM public.organizations o%')",
  "008_technology_game_engine.sql":
    "(EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_technologies_project_category'))",
  "009_creator_visibility.sql":
    "EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='projects' AND policyname='projects_select' AND qual LIKE '%created_by%')",
  "010_task_subtasks.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='parent_task_id')) AND (EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_tasks_parent_task'))",
  "011_context_relations_project_id.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='context_relations' AND column_name='project_id')) AND (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='set_context_relation_project_id'))",
  "012_context_relations_cleanup_triggers.sql":
    "(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='cleanup_context_relations_on_delete')) AND (EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='cleanup_context_relations_on_task_delete'))",
  "013_task_attempts.sql":
    "(to_regclass('public.task_attempts') IS NOT NULL) AND (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='task_attempts' AND policyname='task_attempts_select'))",
  "014_organization_project_limit.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='project_limit'))",
  "015_subscriptions.sql":
    "(to_regclass('public.plans') IS NOT NULL) AND (to_regclass('public.subscriptions') IS NOT NULL)",
  "016_ai_task_api.sql":
    "(to_regclass('public.project_ai_permissions') IS NOT NULL) AND (to_regclass('public.api_keys') IS NOT NULL)",
  "017_rls_column_grant_audit.sql":
    "has_table_privilege('authenticated','public.projects','SELECT') AND NOT has_table_privilege('authenticated','public.projects','UPDATE')",
  "018_organization_project_avatars.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='avatar_url')) AND (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='avatar_url'))",
  "019_plan_pln_pricing.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='price_pln_cents'))",
  "020_project_board_columns.sql":
    "(to_regclass('public.project_board_columns') IS NOT NULL) AND (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='project_board_columns' AND policyname='project_board_columns_select'))",
  "021_github_integration.sql":
    "(to_regclass('public.github_connections') IS NOT NULL) AND (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='github_connections' AND policyname='github_connections_select'))",
  "022_github_app_migration.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='github_connections' AND column_name='installation_id')) AND (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='github_connections' AND column_name='refresh_token_encrypted'))",
  "023_project_type.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='project_type'))",
  "024_organization_ai_settings.sql":
    "(to_regclass('public.organization_ai_settings') IS NOT NULL) AND (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='organization_ai_settings' AND policyname='organization_ai_settings_select'))",
  "025_restrict_secret_column_selects.sql":
    "(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='get_github_connection_secrets')) AND (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='get_org_ai_settings_with_key'))",
  "026_unique_membership.sql":
    "(EXISTS (SELECT 1 FROM pg_constraint WHERE conname='project_members_project_user_unique')) OR ((EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_api_keys_user')) AND (EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_activity_project_created')))",
  "027_index_cleanup.sql":
    "(EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_api_keys_user')) AND (EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_activity_project_created'))",
  "028_task_hours_upper_bound.sql":
    "(EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_estimated_hours_upper_bound')) AND (EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_actual_hours_upper_bound'))",
  "029_project_methodology.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='methodology'))",
  "030_public_secret_rpc_wrappers.sql":
    "(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_github_connection_secrets')) AND (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_org_ai_settings_with_key'))",
  "031_profile_locale.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='locale'))",
  "032_missing_fk_indexes.sql":
    "(EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_context_decisions_made_by')) AND (EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_context_sources_author'))",
  "033_renumber_task_sort_orders.sql":
    "(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='renumber_task_sort_orders'))",
  "034_enterprise_plan.sql":
    "EXISTS (SELECT 1 FROM public.plans WHERE id='enterprise')",
  "035_discord_integration.sql":
    "(to_regclass('public.discord_integrations') IS NOT NULL) AND (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_discord_webhook_url'))",
  "036_bot_action_labels.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='api_keys' AND column_name='bot_label')) AND (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='task_comments' AND column_name='actor_label'))",
  "037_performance_indexes.sql":
    "(EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_tasks_project_created_at')) AND (EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_tasks_project_sort_order'))",
  "038_fix_task_status_check.sql":
    "EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_status_check' AND pg_get_constraintdef(oid) LIKE '%ai_working%') AND NOT EXISTS (SELECT 1 FROM public.tasks WHERE status IN ('testing','completed'))",
  "039_human_client_keys.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='api_keys' AND column_name='human_client'))",
  "040_task_sort_order_float.sql":
    "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='sort_order' AND data_type='double precision')",
  "041_task_attachments.sql":
    "(to_regclass('public.task_attachments') IS NOT NULL) AND (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='task_attachments' AND policyname='task_attachments_select'))",
  "042_github_task_events.sql":
    "(to_regclass('public.github_task_events') IS NOT NULL) AND (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='github_task_events' AND policyname='github_task_events_select'))",
  "043_stripe_webhook_events.sql":
    "(to_regclass('public.stripe_webhook_events') IS NOT NULL)",
  "044_feedback.sql":
    "(to_regclass('public.feedback') IS NOT NULL) AND (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='feedback' AND policyname='feedback_select'))",
  "045_notifications.sql":
    "(to_regclass('public.notifications') IS NOT NULL) AND (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_select'))",
  "046_project_ai_enabled.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='ai_enabled'))",
  "047_find_user_by_email.sql":
    "(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='find_user_id_by_email'))",
  "048_project_references.sql":
    "(to_regclass('public.project_references') IS NOT NULL) AND (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='project_references' AND policyname='project_references_select'))",
  "049_plan_member_limit.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='member_limit_per_project'))",
  "050_organization_webhooks.sql":
    "(to_regclass('public.organization_webhooks') IS NOT NULL) AND (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='organization_webhooks' AND policyname='organization_webhooks_select'))",
  "051_plan_member_limit.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='member_limit'))",
  "052_backfill_subscriptions.sql":
    "NOT EXISTS (SELECT 1 FROM public.organizations o WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.organization_id=o.id))",
  "053_project_label_presets.sql":
    "(to_regclass('public.project_label_presets') IS NOT NULL) AND (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='project_label_presets' AND policyname='project_label_presets_select'))",
  "054_project_bound_api_keys.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='api_keys' AND column_name='project_id')) AND (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='api_keys' AND column_name='allowed_origins'))",
  "055_project_modules.sql":
    "(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='disabled_modules')) AND (EXISTS (SELECT 1 FROM pg_constraint WHERE conname='projects_disabled_modules_check'))",
};

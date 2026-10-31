# Agent monitoring: read-only project snapshot

Guidon task: `58781fa6-da1c-482a-9d91-eb76182afa22`.
Open a project's Activity page and choose Agent activity. Direct URL:
`/projects/<id>/activity?view=agents`. The link and report respect project AI
visibility and the person's Hide AI setting.

The report reads existing tasks, current leases, attempts, approvals and memory
under the signed-in user's RLS identity through the shared DataClient. No service
role, new tables, migrations, polling, writes or task completion actions.

It shows task status counts, recorded distinct tasks/outcomes per agent label,
current lease ages/expiry, pending non-expired approvals and the latest memory
update with an unverified count. Human Review decisions and token costs are not
stored by these sources; the UI marks them unavailable instead of showing zero.
Attempt outcomes are self-reported. Multiple attempts do not prove an automatic
retry, and agent labels do not establish a verified identity.

Queries cap tasks/leases/approvals/memory at 200 records, requesting one extra to
detect truncation. Attempts are capped at 200 per 50 selected tasks, keeping
Supabase URLs and database work bounded. Rows use deterministic secondary order.
The report labels its scope and warns if a limit is reached; it is not an
all-time warehouse or an exact project-wide total when truncated. Timestamps
show data changes, not a claim that memory facts are current or correct.

Errors produce a load failure rather than fabricated empty metrics. Reloading
refreshes the snapshot. English, Polish, German and Spanish labels are included.

Verification: pure aggregation/expiry/custom-status tests via `test:app-changes`;
production `--task-queue` browser coverage exercises real records, two tenants,
read-only behavior, lease rendering, caps, Hide AI and a 375px viewport. Full
release E2E is also run separately to revisit the unresolved WebKit draft issue.

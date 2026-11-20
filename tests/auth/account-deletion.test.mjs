/**
 * Deleting an account (src/lib/account/account-deletion-core.ts): which
 * organizations go with it, which are left, which block it.
 */
import { confirmationMatches, planAccountDeletion } from "../../src/lib/account/account-deletion-core.ts";
import { isMobileAppKey, MOBILE_KEY_NAME, MOBILE_KEY_SCOPES } from "../../src/lib/auth/mobile-login-core.ts";

let pass = 0;
let fail = 0;
function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`    pass  ${label}`);
  } else {
    fail++;
    console.log(`    FAIL  ${label}${detail ? `  -> ${detail}` : ""}`);
  }
}

const m = (id, role, otherPeople, otherOwners = 0) => ({ organizationId: id, organizationName: id, role, otherPeople, otherOwners });

console.log("\n  account deletion plan");
const plan = planAccountDeletion([
  m("solo", "owner", 0),
  m("team-only-owner", "owner", 3, 0),
  m("team-co-owned", "owner", 2, 1),
  m("member-of", "member", 5, 1),
  m("admin-of", "admin", 4, 1),
]);
check("an organization with nobody else is deleted", plan.deleteOrganizations.map((o) => o.id).join() === "solo");
check("being its only owner with others there blocks deletion", plan.blockers.map((o) => o.id).join() === "team-only-owner");
check("co-owned, member and admin organizations are just left", plan.leaveOrganizations.map((o) => o.id).join() === "team-co-owned,member-of,admin-of");
check("a member alone in an organization (owner gone) still deletes it", planAccountDeletion([m("orphan", "member", 0)]).deleteOrganizations.length === 1);
check("no organizations -> nothing to do", JSON.stringify(planAccountDeletion([])) === JSON.stringify({ deleteOrganizations: [], leaveOrganizations: [], blockers: [] }));

console.log("\n  confirmation");
check("exact email confirms", confirmationMatches("ana@example.com", "ana@example.com"));
check("case and spaces don't matter", confirmationMatches("  Ana@Example.com ", "ana@example.com"));
check("another email doesn't", !confirmationMatches("bob@example.com", "ana@example.com"));
check("empty doesn't", !confirmationMatches("", "ana@example.com"));
check("non-string doesn't", !confirmationMatches(undefined, "ana@example.com") && !confirmationMatches(42, "ana@example.com"));
check("no email on the account never confirms", !confirmationMatches("", null));

console.log("\n  which key may delete the account");
const mobile = { humanClient: true, keyName: MOBILE_KEY_NAME, scopes: [...MOBILE_KEY_SCOPES] };
check("the mobile app's own key may", isMobileAppKey(mobile));
check("the Discord bot's task-only human_client key may not", !isMobileAppKey({ humanClient: true, keyName: "Discord bot", scopes: ["tasks:read", "tasks:status", "comments:write"] }));
check("an editor plugin's human_client key may not", !isMobileAppKey({ humanClient: true, keyName: "Godot plugin", scopes: ["tasks:read", "tasks:write", "tasks:status", "comments:write", "attempts:write"] }));
check("a narrow key named like the app may not", !isMobileAppKey({ ...mobile, scopes: ["tasks:read", "tasks:status", "comments:write"] }));
check("a personal key named like the app may not (human_client is server-set)", !isMobileAppKey({ ...mobile, humanClient: false }));

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);

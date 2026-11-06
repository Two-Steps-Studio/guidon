import assert from "node:assert/strict";
import { test } from "node:test";
import { adminPagesForRole, hasAdminPermission, resolveAdminRole } from "../src/lib/admin/permissions.ts";

test("grant mode denies absent, unknown and non-allowlisted grants", () => {
  assert.equal(resolveAdminRole("grants", true), null);
  assert.equal(resolveAdminRole("grants", true, "constructor"), null);
  assert.equal(resolveAdminRole("grants", false, "super_admin"), null);
  assert.equal(resolveAdminRole("grant", true, "super_admin"), null);
  assert.equal(resolveAdminRole("grants", true, "support"), "support");
  assert.equal(resolveAdminRole(undefined, true), "super_admin");
});

test("finance, support and engineering have distinct boundaries", () => {
  assert.equal(hasAdminPermission("finance", "organizations.plan.edit"), true);
  assert.equal(hasAdminPermission("finance", "organizations.limits.edit"), false);
  assert.equal(hasAdminPermission("finance", "users.read"), false);
  assert.equal(hasAdminPermission("support", "users.read"), true);
  assert.equal(hasAdminPermission("support", "billing.prices.sync"), false);
  assert.equal(hasAdminPermission("engineering", "modules.review"), true);
  assert.equal(hasAdminPermission("engineering", "promos.create"), false);
  assert.equal(hasAdminPermission("super_admin", "organizations.limits.edit"), true);
});

test("read-only users see only aggregate pages", () => {
  assert.deepEqual(adminPagesForRole("read_only"), ["/admin", "/admin/funnel"]);
  assert.equal(hasAdminPermission("read_only", "modules.withdraw"), false);
});

test("only super admins can operate on authentication accounts", () => {
  for (const permission of ["users.password.recovery", "users.signin.block", "users.signin.unblock"]) {
    assert.equal(hasAdminPermission("super_admin", permission), true);
    for (const role of ["support", "finance", "engineering", "read_only"]) {
      assert.equal(hasAdminPermission(role, permission), false);
    }
  }
});

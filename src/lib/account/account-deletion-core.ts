// No imports: loaded by tests/account-deletion.test.mjs with Node's type stripping.

/**
 * What deleting a person's account does to the organizations they're in.
 * People only - an organization's AI accounts (migration 059) are its own
 * tools, not members who would lose anything, and go with the organization.
 *
 * - Nobody else in it: the organization is deleted, projects and all.
 * - Others in it, and the person is its only owner: blocked until they make
 *   someone else owner (Organization -> Members) - deleting it would wipe
 *   the others' work, keeping it would leave nobody able to manage it.
 * - Otherwise: they simply leave it.
 */

export interface MembershipFacts {
  organizationId: string;
  organizationName: string;
  role: string;
  /** Other people in the organization (AI accounts not counted). */
  otherPeople: number;
  /** Other owners among those people. */
  otherOwners: number;
}

export interface OrgRef {
  id: string;
  name: string;
}

export interface DeletionPlan {
  deleteOrganizations: OrgRef[];
  leaveOrganizations: OrgRef[];
  /** Must be handed over first; while any are left, the account can't be deleted. */
  blockers: OrgRef[];
}

export function planAccountDeletion(memberships: MembershipFacts[]): DeletionPlan {
  const plan: DeletionPlan = { deleteOrganizations: [], leaveOrganizations: [], blockers: [] };
  for (const m of memberships) {
    const org = { id: m.organizationId, name: m.organizationName };
    if (m.otherPeople === 0) plan.deleteOrganizations.push(org);
    else if (m.role === "owner" && m.otherOwners === 0) plan.blockers.push(org);
    else plan.leaveOrganizations.push(org);
  }
  return plan;
}

/** The person types their email to confirm - case and surrounding spaces don't matter. */
export function confirmationMatches(typed: unknown, email: string | null | undefined): boolean {
  if (typeof typed !== "string" || !email) return false;
  return typed.trim().toLowerCase() === email.trim().toLowerCase();
}

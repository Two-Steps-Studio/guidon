"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertCircle, MoreVertical, Trash2 } from "lucide-react";
import { removeMember, updateMemberRole } from "./actions";
import type { OrganizationRole } from "@/types/project";

/**
 * Row-level menu: these mutations are not form submissions, so they call the
 * Server Actions directly rather than through useActionState. useTransition
 * gives the same pending/error handling without a <form>.
 */
export function MemberActionsMenu({
  orgId,
  memberId,
  isOwner,
}: {
  orgId: string;
  memberId: string;
  isOwner: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const runRoleChange = (role: OrganizationRole) => {
    startTransition(async () => {
      const result = await updateMemberRole(orgId, memberId, role);
      setError(result.error);
    });
  };

  const runRemove = () => {
    startTransition(async () => {
      const result = await removeMember(orgId, memberId);
      setError(result.error);
    });
  };

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={pending}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => runRoleChange("admin")}>Make Admin</DropdownMenuItem>
          <DropdownMenuItem onClick={() => runRoleChange("member")}>Make Member</DropdownMenuItem>
          {isOwner && (
            <DropdownMenuItem onClick={() => runRoleChange("owner")}>Make Owner</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={runRemove} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

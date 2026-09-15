"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { addMember, type MemberActionState } from "./actions";

const initialState: MemberActionState = { error: null };

export function AddMemberDialog({
  orgId,
  isOwner,
  trigger,
}: {
  orgId: string;
  isOwner: boolean;
  trigger?: React.ReactNode;
}) {
  const t = useTranslations("organizations.members");
  const tCommon = useTranslations("organizations.common");
  const [open, setOpen] = useState(false);
  const addMemberWithOrg = addMember.bind(null, orgId);
  const [state, formAction, pending] = useActionState(addMemberWithOrg, initialState);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current && !pending && state.error === null) {
      setOpen(false);
      submittedRef.current = false;
    }
  }, [pending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t("addMember")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>
        <form
          action={(formData) => {
            submittedRef.current = true;
            formAction(formData);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input id="email" name="email" type="email" placeholder="user@example.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">{t("roleLabel")}</Label>
            <select
              id="role"
              name="role"
              defaultValue="member"
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="member">{t("roleMemberOption")}</option>
              <option value="admin">{t("roleAdminOption")}</option>
              {isOwner && <option value="owner">{t("roleOwnerOption")}</option>}
            </select>
          </div>
          {state.error && (
            <div className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {state.error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("adding")}
                </>
              ) : (
                t("addMember")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

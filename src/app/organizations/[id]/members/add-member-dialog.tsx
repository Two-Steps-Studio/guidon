"use client";

import { useActionState, useState } from "react";
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
import { AlertCircle, Check, Copy, Loader2, MailCheck, Plus } from "lucide-react";
import { addMember, type MemberActionState } from "./actions";
import { Select } from "@/components/ui/select";

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
  // The state the current submission started from: a new successful
  // result after it closes the dialog - unless it is an invitation, which
  // keeps the dialog open to show its link (shown only once) until closed.
  const [submittedFrom, setSubmittedFrom] = useState<MemberActionState | null>(null);
  const [seenState, setSeenState] = useState<MemberActionState | null>(null);
  const [copied, setCopied] = useState(false);
  const succeeded = submittedFrom !== null && state !== submittedFrom && !pending && state.error === null;
  const invited = succeeded && state !== seenState ? state.invited : undefined;
  const isOpen = open && !(succeeded && !state.invited);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    setSubmittedFrom(null);
    if (!next) {
      setSeenState(state);
      setCopied(false);
    }
  };

  const copyLink = async () => {
    if (!invited) return;
    try {
      await navigator.clipboard.writeText(invited.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
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
        {invited ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success/5 p-3 text-sm">
              <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <p>
                {invited.emailSent
                  ? t("invitedEmailSent", { email: invited.email })
                  : t("invitedEmailNotSent", { email: invited.email })}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-link">{t("inviteLinkLabel")}</Label>
              <div className="flex gap-2">
                <Input id="invite-link" readOnly value={invited.link} onFocus={(event) => event.currentTarget.select()} />
                <Button type="button" variant="outline" onClick={copyLink} aria-label={t("copyInviteLink")}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("inviteLinkHint")}</p>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t("inviteDone")}
              </Button>
            </div>
          </div>
        ) : (
        <form
          action={(formData) => {
            setSubmittedFrom(state);
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
            <Select
              id="role"
              name="role"
              defaultValue="member"
            >
              <option value="member">{t("roleMemberOption")}</option>
              <option value="admin">{t("roleAdminOption")}</option>
              {isOwner && <option value="owner">{t("roleOwnerOption")}</option>}
            </Select>
          </div>
          {state.error && (
            <div className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {state.error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
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
        )}
      </DialogContent>
    </Dialog>
  );
}

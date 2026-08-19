"use client";

import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { updateProfile, type ProfileFormState } from "./actions";
import type { CurrentUser } from "@/lib/data/current-user";

const initialState: ProfileFormState = { error: null };

export function ProfileForm({ user }: { user: CurrentUser }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={user.avatar_url || undefined} />
            <AvatarFallback className="text-lg">
              {user.full_name?.[0] || user.email?.[0] || "U"}
            </AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>{user.full_name || "Unnamed"}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Name</Label>
            <Input
              id="full_name"
              name="full_name"
              defaultValue={user.full_name ?? ""}
              placeholder="Your name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatar_url">Avatar URL</Label>
            <Input
              id="avatar_url"
              name="avatar_url"
              type="url"
              defaultValue={user.avatar_url ?? ""}
              placeholder="https://..."
            />
            <p className="text-xs text-muted-foreground">
              A direct link to an image. Leave blank to use your initials instead.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user.email ?? ""} disabled />
            <p className="text-xs text-muted-foreground">
              Email can&apos;t be changed here.
            </p>
          </div>

          {state.error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {state.error}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Save changes
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Copy, KeyRound, Trash2 } from "lucide-react";
import { API_KEY_SCOPES } from "@/lib/api/scopes";
import { createApiKey, revokeApiKey, type ApiKeyRow, type CreateApiKeyState } from "./api-keys-actions";

const initialState: CreateApiKeyState = { error: null, fullKey: null };

export function ApiKeysSection({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [state, formAction, creating] = useActionState(createApiKey, initialState);
  const [revoking, startRevoke] = useTransition();

  const handleRevoke = (keyId: string) => {
    startRevoke(async () => {
      await revokeApiKey(keyId);
      setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, revoked_at: new Date().toISOString() } : k)));
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Keys</CardTitle>
        <CardDescription>For AI agents and scripts to access your projects via the API.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {state.fullKey && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="mb-2 font-medium">Copy this key now - it won&apos;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1 font-mono text-xs">
                {state.fullKey}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(state.fullKey!)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        <form action={formAction} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="key-name">Name</Label>
            <Input id="key-name" name="name" placeholder="e.g. Claude Code agent" required />
          </div>
          <div className="space-y-1">
            <Label>Scopes</Label>
            <div className="grid grid-cols-2 gap-2">
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={`scope:${scope}`} className="h-4 w-4" />
                  {scope}
                </label>
              ))}
            </div>
          </div>
          {state.error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {state.error}
            </div>
          )}
          <Button type="submit" disabled={creating}>
            <KeyRound className="h-4 w-4 mr-2" />
            {creating ? "Creating..." : "Create API Key"}
          </Button>
        </form>

        <div className="space-y-2">
          {keys.length === 0 && <p className="text-sm text-muted-foreground">No API keys yet.</p>}
          {keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{key.name}</span>
                  {key.revoked_at && <Badge variant="secondary">Revoked</Badge>}
                </div>
                <p className="font-mono text-xs text-muted-foreground">{key.key_prefix}...</p>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(key.created_at).toLocaleDateString()}
                  {key.last_used_at ? ` · Last used ${new Date(key.last_used_at).toLocaleDateString()}` : " · Never used"}
                </p>
              </div>
              {!key.revoked_at && (
                <Button size="sm" variant="outline" disabled={revoking} onClick={() => handleRevoke(key.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

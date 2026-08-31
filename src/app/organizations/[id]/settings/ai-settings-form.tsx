"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Bot, Trash2 } from "lucide-react";
import {
  removeOrgAiSettings,
  saveOrgAiSettings,
  type AiSettingsState,
} from "./ai-settings-actions";
import {
  ORG_AI_PROVIDER_NAMES,
  RECOMMENDED_MODELS,
  type OrgAiProviderName,
} from "@/lib/ai/org-ai-providers";

const PROVIDER_LABELS: Record<OrgAiProviderName, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  groq: "Groq",
};

const initialState: AiSettingsState = { error: null, saved: false };

/** Sentinel for "type a model id myself" in the model <select> below. */
const CUSTOM_MODEL = "__custom__";

function isRecommendedModel(provider: OrgAiProviderName, model: string): boolean {
  return RECOMMENDED_MODELS[provider].some((m) => m.value === model);
}

/**
 * Lets an organization plug in its own AI provider/model/key
 * (organization_ai_settings, migration 024) instead of relying on the
 * instance-wide AI_PROVIDER/AI_MODEL/*_API_KEY env vars - powers the
 * Memory page's "Generate Insight" button and the Work board's AI task
 * assistant for every project in this organization.
 *
 * The key is write-only, same discipline as the GitHub connection form:
 * once configured, this never receives the real key back from the server,
 * only "configured: provider / model".
 */
export function AiSettingsForm({
  organizationId,
  configured,
  canManage,
}: {
  organizationId: string;
  configured: { provider: OrgAiProviderName; model: string } | null;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(!configured);
  const [provider, setProvider] = useState<OrgAiProviderName | "">(configured?.provider ?? "");
  const [modelChoice, setModelChoice] = useState<string>(() => {
    if (!configured) return "";
    return isRecommendedModel(configured.provider, configured.model) ? configured.model : CUSTOM_MODEL;
  });
  const [customModel, setCustomModel] = useState(configured?.model ?? "");
  const saveWithId = saveOrgAiSettings.bind(null, organizationId);
  const [state, formAction, saving] = useActionState(saveWithId, initialState);
  const [removing, startRemove] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Collapse back to the summary view after a real successful submission.
  // Adjusted during render rather than in an effect (React's own
  // recommended pattern for "reset state when a prop/value changes") -
  // `state.saved` is false on first render, so this never fires on mount.
  const [reactedTo, setReactedTo] = useState(state);
  if (state !== reactedTo) {
    setReactedTo(state);
    if (state.saved) setEditing(false);
  }

  const handleRemove = () => {
    setRemoveError(null);
    startRemove(async () => {
      const result = await removeOrgAiSettings(organizationId);
      if (result.error) {
        setRemoveError(result.error);
        return;
      }
      setEditing(true);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Provider
        </CardTitle>
        <CardDescription>
          Powers the Memory page&apos;s Generate Insight button and the Work board&apos;s AI
          task assistant for every project in this organization. Without one configured here, the
          instance&apos;s own AI provider (if any) is used instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canManage && (
          <p className="text-sm text-muted-foreground">
            {configured
              ? `Configured via ${PROVIDER_LABELS[configured.provider]} (${configured.model}).`
              : "Not configured for this organization."}
          </p>
        )}

        {canManage && configured && !editing && (
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{PROVIDER_LABELS[configured.provider]}</Badge>
                <span className="text-sm text-muted-foreground">{configured.model}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">API key is set and hidden.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
                Change
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={removing}
                onClick={handleRemove}
                aria-label="Remove AI provider settings"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {removeError && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {removeError}
          </div>
        )}

        {canManage && editing && (
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="had_existing_key" value={configured ? "true" : "false"} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ai-provider">Provider</Label>
                <Select
                  id="ai-provider"
                  name="provider"
                  value={provider}
                  onChange={(event) => {
                    const next = event.target.value as OrgAiProviderName;
                    setProvider(next);
                    // Recommended models are provider-specific - the old
                    // choice almost never applies to the new provider.
                    setModelChoice(RECOMMENDED_MODELS[next][0].value);
                  }}
                  required
                >
                  <option value="" disabled>
                    Choose a provider
                  </option>
                  {ORG_AI_PROVIDER_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {PROVIDER_LABELS[name]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ai-model">Model</Label>
                <Select
                  id="ai-model"
                  name={modelChoice === CUSTOM_MODEL ? undefined : "model"}
                  value={modelChoice}
                  onChange={(event) => setModelChoice(event.target.value)}
                  disabled={!provider}
                  required
                >
                  {!provider && <option value="">Choose a provider first</option>}
                  {provider &&
                    RECOMMENDED_MODELS[provider].map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  <option value={CUSTOM_MODEL}>Other (type it myself)</option>
                </Select>
              </div>
            </div>
            {modelChoice === CUSTOM_MODEL && (
              <div className="space-y-1">
                <Label htmlFor="ai-model-custom">Model id</Label>
                <Input
                  id="ai-model-custom"
                  name="model"
                  placeholder="e.g. llama-3.1-8b-instant"
                  value={customModel}
                  onChange={(event) => setCustomModel(event.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="ai-api-key">API key</Label>
              <Input
                id="ai-api-key"
                name="api_key"
                type="password"
                autoComplete="off"
                placeholder={configured ? "Leave blank to keep the current key" : "Paste your API key"}
              />
            </div>
            {state.error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {state.error}
              </div>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              {configured && (
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

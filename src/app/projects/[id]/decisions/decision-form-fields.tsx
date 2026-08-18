import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_CONFIG, TYPE_OPTIONS } from "./decision-config";
import type { Decision } from "@/types/context";

export function DecisionFormFields({
  idPrefix,
  defaults,
}: {
  idPrefix: string;
  /** Partial on purpose: the "mark comment as decision" flow (TaskDetailDialog)
   *  only prefills title/description, unlike the edit dialog which passes a
   *  full Decision. */
  defaults?: Partial<
    Pick<Decision, "title" | "description" | "impact" | "alternatives" | "status" | "decision_type">
  >;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`}>Title</Label>
        <Input id={`${idPrefix}-title`} name="title" defaultValue={defaults?.title} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          name="description"
          defaultValue={defaults?.description ?? ""}
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-impact`}>Impact</Label>
        <Textarea id={`${idPrefix}-impact`} name="impact" defaultValue={defaults?.impact ?? ""} rows={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-alternatives`}>Alternatives Considered</Label>
        <Textarea
          id={`${idPrefix}-alternatives`}
          name="alternatives"
          defaultValue={(defaults?.alternatives ?? []).join("\n")}
          rows={2}
          placeholder="One alternative per line"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-status`}>Status</Label>
          <select
            id={`${idPrefix}-status`}
            name="status"
            defaultValue={defaults?.status ?? "proposed"}
            className="w-full px-3 py-2 border rounded-md bg-background"
          >
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <option key={status} value={status}>
                {config.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-type`}>Type</Label>
          <select
            id={`${idPrefix}-type`}
            name="decision_type"
            defaultValue={defaults?.decision_type ?? "technical"}
            className="w-full px-3 py-2 border rounded-md bg-background"
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}

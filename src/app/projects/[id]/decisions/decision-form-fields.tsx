import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Decision, DecisionStatus, DecisionType } from "@/types/context";

const STATUS_VALUES: DecisionStatus[] = ["proposed", "approved", "rejected", "deprecated"];
const TYPE_VALUES: DecisionType[] = ["technical", "architectural", "product", "business", "process", "other"];

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
  const t = useTranslations("decisions");
  const tCommon = useTranslations("common");
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`}>{t("titleLabel")}</Label>
        <Input id={`${idPrefix}-title`} name="title" defaultValue={defaults?.title} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-description`}>{t("descriptionLabel")}</Label>
        <Textarea
          id={`${idPrefix}-description`}
          name="description"
          defaultValue={defaults?.description ?? ""}
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-impact`}>{t("impactLabel")}</Label>
        <Textarea id={`${idPrefix}-impact`} name="impact" defaultValue={defaults?.impact ?? ""} rows={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-alternatives`}>{t("alternativesLabel")}</Label>
        <Textarea
          id={`${idPrefix}-alternatives`}
          name="alternatives"
          defaultValue={(defaults?.alternatives ?? []).join("\n")}
          rows={2}
          placeholder={t("alternativesPlaceholder")}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-status`}>{t("statusLabel")}</Label>
          <select
            id={`${idPrefix}-status`}
            name="status"
            defaultValue={defaults?.status ?? "proposed"}
            className="w-full px-3 py-2 border rounded-md bg-background"
          >
            {STATUS_VALUES.map((status) => (
              <option key={status} value={status}>
                {tCommon("decisionStatus", { status })}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-type`}>{t("typeLabel")}</Label>
          <select
            id={`${idPrefix}-type`}
            name="decision_type"
            defaultValue={defaults?.decision_type ?? "technical"}
            className="w-full px-3 py-2 border rounded-md bg-background"
          >
            {TYPE_VALUES.map((value) => (
              <option key={value} value={value}>
                {tCommon("decisionType", { type: value })}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STATUS_CONFIG } from "./phase-status-config";
import type { PhaseStatus, RoadmapPhase } from "@/types/task";

/** Shared fields for the create and edit phase dialogs, keyed by `idPrefix` so both can be on the page at once. */
export function PhaseFormFields({
  idPrefix,
  defaults,
}: {
  idPrefix: string;
  defaults?: Pick<
    RoadmapPhase,
    "name" | "description" | "start_date" | "planned_end_date" | "status" | "completion_percentage"
  >;
}) {
  const t = useTranslations("roadmap");
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>{t("phaseNameLabel")}</Label>
        <Input id={`${idPrefix}-name`} name="name" defaultValue={defaults?.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-description`}>{t("descriptionLabel")}</Label>
        <Input id={`${idPrefix}-description`} name="description" defaultValue={defaults?.description ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-start`}>{t("startDateLabel")}</Label>
          <Input
            id={`${idPrefix}-start`}
            name="start_date"
            type="date"
            defaultValue={defaults?.start_date ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-end`}>{t("endDateLabel")}</Label>
          <Input
            id={`${idPrefix}-end`}
            name="planned_end_date"
            type="date"
            defaultValue={defaults?.planned_end_date ?? ""}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-status`}>{t("statusLabel")}</Label>
          <select
            id={`${idPrefix}-status`}
            name="status"
            defaultValue={defaults?.status ?? "planned"}
            className="w-full px-3 py-2 border rounded-md bg-background"
          >
            {(Object.keys(STATUS_CONFIG) as PhaseStatus[]).map((status) => (
              <option key={status} value={status}>
                {t("phaseStatus", { status })}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-completion`}>{t("completionLabel")}</Label>
          <Input
            id={`${idPrefix}-completion`}
            name="completion_percentage"
            type="number"
            min="0"
            max="100"
            defaultValue={defaults?.completion_percentage ?? 0}
          />
        </div>
      </div>
    </>
  );
}

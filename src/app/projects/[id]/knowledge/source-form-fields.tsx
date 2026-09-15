import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AUTHORABLE_TYPES } from "./source-config";
import type { ContextSource } from "@/types/context";

export function SourceFormFields({
  idPrefix,
  defaults,
}: {
  idPrefix: string;
  defaults?: Pick<ContextSource, "title" | "content" | "source_type" | "url">;
}) {
  const t = useTranslations("knowledge");
  const tCommon = useTranslations("common");
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-type`}>{t("typeLabel")}</Label>
        <Select id={`${idPrefix}-type`} name="type" defaultValue={defaults?.source_type ?? "document"}>
          {AUTHORABLE_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {tCommon("sourceType", { type: item.value })}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`}>{t("titleLabel")}</Label>
        <Input id={`${idPrefix}-title`} name="title" defaultValue={defaults?.title ?? ""} required autoFocus />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-content`}>{t("contentLabel")}</Label>
        <Textarea
          id={`${idPrefix}-content`}
          name="content"
          rows={6}
          defaultValue={defaults?.content ?? ""}
          placeholder={t("contentPlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-url`}>{t("linkLabel")}</Label>
        <Input
          id={`${idPrefix}-url`}
          name="url"
          type="url"
          // type="url" alone accepts anything with a parseable scheme
          // (javascript:, data:, mailto:, ...) with no invalid state - the
          // server's isSafeHttpUrl (actions.ts) only accepts http(s), so
          // without this pattern a non-http(s) link passed native
          // validation silently and only failed with a generic-feeling
          // server error after submit.
          pattern="https?://.+"
          title={t("linkUrlTitle")}
          defaultValue={defaults?.url ?? ""}
          placeholder="https://..."
        />
      </div>
    </>
  );
}

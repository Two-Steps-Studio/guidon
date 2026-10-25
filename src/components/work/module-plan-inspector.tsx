"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { parseModulePlan, type ModulePlan } from "@/lib/work/module-builder";

type Field = ModulePlan["entities"][number]["fields"][number];
type View = ModulePlan["views"][number];
const inputClass = "w-full min-w-0 rounded border bg-background p-2 text-sm";

/** Edits a draft plan only. Applying it invalidates consent and generated manifests. */
export function ModulePlanInspector({ plan, disabled, onApply }: { plan: ModulePlan; disabled: boolean; onApply: (plan: ModulePlan) => void }) {
  const t = useTranslations("moduleInspector");
  const [working, setWorking] = useState(plan);
  const [invalid, setInvalid] = useState(false);
  function update(change: (copy: ModulePlan) => void) { const copy = structuredClone(working); change(copy); setWorking(copy); setInvalid(false); }
  function reorder<T>(items: T[], index: number, direction: number) { const target = index + direction; if (target >= 0 && target < items.length) [items[index], items[target]] = [items[target], items[index]]; }
  function reorderButtons(name: string, index: number, length: number, move: (direction: number) => void) {
    return <div className="flex gap-2"><Button type="button" variant="outline" size="sm" aria-label={t("up",{name})} disabled={disabled || index===0} onClick={()=>move(-1)}>↑</Button><Button type="button" variant="outline" size="sm" aria-label={t("down",{name})} disabled={disabled || index===length-1} onClick={()=>move(1)}>↓</Button></div>;
  }
  return <form className="min-w-0 space-y-4 rounded border p-3" onSubmit={event=>{
    event.preventDefault();
    try { const parsed = parseModulePlan(working); onApply(parsed); setInvalid(false); } catch { setInvalid(true); }
  }}>
    <h3 className="font-medium">{t("title")}</h3><p className="text-xs text-muted-foreground">{t("hint")}</p>
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <label className="block text-sm">{t("name")}<input className={inputClass} required maxLength={100} value={working.name} onChange={event=>update(copy=>{copy.name=event.target.value;})} /></label>
      {working.entities.map((entity,entityIndex)=><fieldset key={entity.id} className="min-w-0 space-y-3 rounded border p-2"><legend className="break-words px-1 text-sm">{entity.name}</legend>
        <label className="block text-sm">{t("entityName")}<input className={inputClass} required maxLength={100} value={entity.name} onChange={event=>update(copy=>{copy.entities[entityIndex].name=event.target.value;})} /></label>
        {entity.fields.map((field,index)=><fieldset key={field.id} className="min-w-0 space-y-2 border-t pt-2"><legend className="break-words text-xs">{field.id}</legend>
          <label className="block text-sm">{t("fieldName")}<input className={inputClass} required maxLength={100} value={field.name} onChange={event=>update(copy=>{copy.entities[entityIndex].fields[index].name=event.target.value;})} /></label>
          <label className="block text-sm">{t("type")}<select className={inputClass} value={field.type} onChange={event=>update(copy=>{
            const type=event.target.value as Field["type"];
            copy.entities[entityIndex].fields[index]={id:field.id,name:field.name,required:field.required,type,...(type==="select"?{options:[{value:"first",label:t("option")}]}:{})} as Field;
          })}>{["text","number","boolean","date","select"].map(type=><option key={type} value={type}>{t(type as Field["type"])}</option>)}</select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={field.required} onChange={event=>update(copy=>{copy.entities[entityIndex].fields[index].required=event.target.checked;})} />{t("required")}</label>
          {field.type==="select" && <div className="space-y-2">{field.options.map((option,optionIndex)=><div key={option.value} className="flex min-w-0 gap-2"><label className="min-w-0 flex-1 text-sm">{t("option")}<input className={inputClass} required maxLength={100} value={option.label} onChange={event=>update(copy=>{const target=copy.entities[entityIndex].fields[index];if(target.type==="select")target.options[optionIndex].label=event.target.value;})} /></label><Button type="button" variant="outline" aria-label={t("remove",{name:option.label})} disabled={field.options.length===1} onClick={()=>update(copy=>{const target=copy.entities[entityIndex].fields[index];if(target.type==="select")target.options.splice(optionIndex,1);})}>×</Button></div>)}<Button type="button" variant="outline" disabled={field.options.length>=50} onClick={()=>update(copy=>{const target=copy.entities[entityIndex].fields[index];if(target.type==="select")target.options.push({value:`option-${crypto.randomUUID().slice(0,8)}`,label:t("option")});})}>{t("addOption")}</Button></div>}
          {reorderButtons(field.name,index,entity.fields.length,direction=>update(copy=>reorder(copy.entities[entityIndex].fields,index,direction)))}
          <Button type="button" variant="outline" disabled={working.views.some(view=>view.entity===entity.id && view.fields.includes(field.id))} onClick={()=>update(copy=>{copy.entities[entityIndex].fields.splice(index,1);})}>{t("remove",{name:field.name})}</Button>
        </fieldset>)}
        <Button type="button" variant="outline" disabled={entity.fields.length>=50} onClick={()=>update(copy=>{copy.entities[entityIndex].fields.push({id:`field-${crypto.randomUUID().slice(0,8)}`,name:t("newField"),type:"text",required:false});})}>{t("addField")}</Button>
        <Button type="button" variant="outline" disabled={working.views.length>=10 || !entity.fields.length} onClick={()=>update(copy=>{copy.views.push({id:`view-${crypto.randomUUID().slice(0,8)}`,name:t("newView"),type:"table",entity:entity.id,fields:entity.fields.map(field=>field.id)});})}>{t("addView")}</Button>
      </fieldset>)}
      {working.views.map((view,index)=>{
        const entity=working.entities.find(entity=>entity.id===view.entity)!;
        return <fieldset key={view.id} className="min-w-0 space-y-2 rounded border p-2"><legend className="break-words px-1 text-xs">{view.id}</legend>
          <label className="block text-sm">{t("viewName")}<input className={inputClass} required maxLength={100} value={view.name} onChange={event=>update(copy=>{copy.views[index].name=event.target.value;})} /></label>
          <label className="block text-sm">{t("viewType")}<select className={inputClass} value={view.type} onChange={event=>update(copy=>{
            const type=event.target.value as View["type"];
            const group=entity.fields.find(field=>field.type==="select");const date=entity.fields.find(field=>field.type==="date");
            const extra=(type==="board"||type==="chart")?{groupBy:group!.id}:type==="calendar"?{dateField:date!.id}:{};
            const needed=(type==="board"||type==="chart")?group?.id:type==="calendar"?date?.id:undefined;
            copy.views[index]={id:view.id,name:view.name,entity:view.entity,fields:[...new Set([...view.fields,...(needed?[needed]:[])])],type,...extra} as View;
            if(type==="form" && !copy.permissions.includes("module-data:write"))copy.permissions.push("module-data:write");
          })}>{["table","form","board","chart","calendar"].map(type=><option key={type} value={type} disabled={(type==="board"||type==="chart")?!entity.fields.some(field=>field.type==="select"):type==="calendar"?!entity.fields.some(field=>field.type==="date"):false}>{t(type as View["type"])}</option>)}</select></label>
          {entity.fields.map(field=><label key={field.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={view.fields.includes(field.id)} disabled={(view.fields.length===1 && view.fields.includes(field.id)) || ("groupBy" in view && view.groupBy===field.id) || ("dateField" in view && view.dateField===field.id)} onChange={event=>update(copy=>{copy.views[index].fields=event.target.checked?[...view.fields,field.id]:view.fields.filter(id=>id!==field.id);})} />{field.name}</label>)}
          {reorderButtons(view.name,index,working.views.length,direction=>update(copy=>reorder(copy.views,index,direction)))}
          <Button type="button" variant="outline" disabled={working.views.length===1} onClick={()=>update(copy=>{copy.views.splice(index,1);})}>{t("remove",{name:view.name})}</Button>
        </fieldset>;
      })}
      <Button type="submit">{t("apply")}</Button>
    </fieldset>
    {invalid && <p role="alert" className="text-sm text-destructive">{t("invalid")}</p>}
  </form>;
}

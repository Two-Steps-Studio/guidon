import assert from "node:assert/strict";
import { groupTasksByStatus, taskComparator, pinnedTaskComparator, pinnedTaskDrop, compareTasksByDueDate, taskPositionAnchor, resolveColumnRenumbering } from "../src/lib/work/task-board.ts";

const tasks=[
  {id:"first",status:"todo",sort_order:1,priority:"medium",created_at:"2026-01-01",due_date:"2026-01-01"},
  {id:"pin",status:"todo",sort_order:9999,priority:"low",created_at:"2026-01-03",due_date:null},
  {id:"second",status:"todo",sort_order:2,priority:"high",created_at:"2026-01-02",due_date:"2026-01-02"},
  {id:"other-pin",status:"review",sort_order:99,priority:"medium",created_at:"2026-01-04",due_date:null},
  {id:"other",status:"review",sort_order:1,priority:"medium",created_at:"2026-01-01",due_date:"2026-01-01"},
];
const saved=JSON.stringify(tasks);
for(const compare of [taskComparator(),compareTasksByDueDate]) {
  const grouped=groupTasksByStatus(tasks,pinnedTaskComparator(new Set(["pin","other-pin"]),compare));
  assert.deepEqual(grouped.todo.map(t=>t.id),["pin","first","second"]);
  assert.deepEqual(grouped.review.map(t=>t.id),["other-pin","other"]);
  assert.deepEqual(groupTasksByStatus(tasks,pinnedTaskComparator(new Set(),compare)).todo.map(t=>t.id),["first","second","pin"]);
}
assert.equal(JSON.stringify(tasks),saved,"Personal pins must not rewrite saved task positions");
const pins=new Set(["pin"]);
const column=groupTasksByStatus(tasks,pinnedTaskComparator(pins,taskComparator())).todo;
const drop=pinnedTaskDrop(column,0,"second",pins);
assert.equal(drop.index,1,"Ordinary cards cannot be dropped ahead of personal pins");
assert.ok(drop.sortOrder<1,"Insertion uses the first ordinary card's order, not the unrelated high pinned order");
const next=column.map(task=>task.id==="second"?{...task,sort_order:drop.sortOrder}:task).sort(pinnedTaskComparator(pins,taskComparator()));
assert.deepEqual(next.map(task=>task.id),["pin","second","first"]);
assert.equal(pinnedTaskDrop(column,999,"pin",pins).index,0,"A pin cannot be dropped below ordinary cards");
assert.deepEqual(drop.anchor,{id:"first",side:"before"});
const legacy=[{id:"a",sort_order:1000},{id:"b",sort_order:null},{id:"c",sort_order:null}];
for(const [index,expected] of [[0,["moving","a","b","c"]],[1,["a","moving","b","c"]],[2,["a","b","moving","c"]],[3,["a","b","c","moving"]]]) {
  const plan=resolveColumnRenumbering(legacy,"moving",1000,taskPositionAnchor(legacy,index));
  assert.deepEqual(plan.map(task=>task.id),expected,"Legacy null positions respect the actual neighbouring card");
  assert.ok(plan.every((task,index)=>task.sort_order===(index+1)*1000));
}
assert.equal(resolveColumnRenumbering([{id:"a",sort_order:1000}],"moving",2000,{id:"a",side:"after"}),null,"Normal moves keep the single-row fast path");
console.log("pass per-column pin order, due-date mode, unpin and saved-position preservation");

// Due today / overdue follow the viewer's own calendar day, in any timezone.
{
  const { dueState } = await import("../src/lib/work/task-board.ts");
  const previous = process.env.TZ;
  try {
    for (const [zone, localNow] of [["Europe/Warsaw", "2026-11-03T00:30:00+01:00"], ["America/Los_Angeles", "2026-11-02T23:30:00-08:00"], ["UTC", "2026-11-02T12:00:00Z"]]) {
      process.env.TZ = zone;
      const now = new Date(localNow), day = (offset) => { const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offset)); return d.toISOString(); };
      assert.equal(dueState(day(0), "todo", false, now), "today", `${zone}: due today`);
      assert.equal(dueState(day(-1), "todo", false, now), "overdue", `${zone}: due yesterday`);
      assert.equal(dueState(day(1), "todo", false, now), "soon", `${zone}: due tomorrow`);
      assert.equal(dueState(day(5), "todo", false, now), "upcoming", `${zone}: later`);
      assert.equal(dueState(day(-1), "done", true, now), "none", `${zone}: done tasks are never overdue`);
    }
    // 30 minutes after midnight in Warsaw is still yesterday in UTC: a task due on the Warsaw date is today, not tomorrow.
    process.env.TZ = "Europe/Warsaw";
    assert.equal(dueState("2026-11-03T00:00:00.000Z", "todo", false, new Date("2026-11-02T23:30:00Z")), "today");
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  console.log("pass due today/overdue use the viewer's calendar day across timezones");
}

"""Sidebar panels (N-panel, "Guidon" tab) in the 3D Viewport and the Text
Editor - the Text Editor copy is there because that's where a task's
description gets edited (see GUIDON_OT_edit_description)."""

import textwrap

import bpy

from . import api, jobs, state
from .ops import online_access_blocked, prefs

# Blender panels can't take custom colors, but its color-tag icons can stand
# in for the website's colored dots (src/app/globals.css): 01 red, 02 orange,
# 03 yellow, 04 green, 05 blue, 06 violet, 07 pink, 08 brown, 09 gray. A
# project's own hex color (custom column/priority, or a recolored built-in)
# is mapped to the nearest tag by api.color_tag.
#
# Blender renamed these from SEQUENCE_COLOR_XX to STRIP_COLOR_XX somewhere in
# the 4.x cycle (part of the sequencer/VSE "strip" terminology rewrite). This
# add-on supports Blender 3.6+ (see README.md), so it can't hardcode either
# name - it has to ask the running Blender which one its icon enum actually
# has, once, at import time.
def _color_icon_prefix():
    try:
        enum_items = bpy.types.UILayout.bl_rna.functions["label"].parameters["icon"].enum_items
        valid = enum_items.keys()
    except Exception:
        valid = ()
    return "STRIP_COLOR" if "STRIP_COLOR_01" in valid else "SEQUENCE_COLOR"


_COLOR_ICON_PREFIX = _color_icon_prefix()
_DEFAULT_COLOR_ICON = _COLOR_ICON_PREFIX + "_09"

_STATUS_ICONS = {
    "backlog": _COLOR_ICON_PREFIX + "_09",  # muted
    "todo": _COLOR_ICON_PREFIX + "_05",  # info
    "in_progress": _COLOR_ICON_PREFIX + "_03",  # warning
    "ai_working": _COLOR_ICON_PREFIX + "_05",  # info
    "review": _COLOR_ICON_PREFIX + "_05",  # primary
    "done": _COLOR_ICON_PREFIX + "_04",  # success
}
_PRIORITY_ICONS = {
    "low": _COLOR_ICON_PREFIX + "_09",
    "medium": _COLOR_ICON_PREFIX + "_05",
    "high": _COLOR_ICON_PREFIX + "_02",
    "critical": _COLOR_ICON_PREFIX + "_01",
}


def _icon(color, builtin_icon):
    """A project color wins; otherwise the built-in key's icon, or the
    neutral gray for a custom key without a color / an unknown key."""
    tag = api.color_tag(color)
    if tag:
        return _COLOR_ICON_PREFIX + "_" + tag
    return builtin_icon or _DEFAULT_COLOR_ICON


def _status_icon(column):
    return _icon(column.color, _STATUS_ICONS.get(column.status))


def _priority_icon(key):
    priority = next((p for p in state.priorities if p.key == key), None)
    return _icon(priority.color if priority else None, _PRIORITY_ICONS.get(key))


def _wrapped(layout, context, text, max_lines=None):
    """Blender labels don't wrap - split by an estimate of the sidebar width."""
    width_chars = max(20, int(context.region.width / (7 * (context.preferences.system.ui_scale or 1.0))))
    lines = []
    for paragraph in (text or "").splitlines() or [""]:
        lines.extend(textwrap.wrap(paragraph, width_chars) or [""])
    if max_lines is not None and len(lines) > max_lines:
        lines = lines[:max_lines] + ["..."]
    col = layout.column(align=True)
    col.scale_y = 0.8
    for line in lines:
        col.label(text=line)


def _logged_in():
    return bool(prefs().api_key)


class _GuidonPanel:
    bl_region_type = "UI"
    bl_category = "Guidon"


class _BoardPanel(_GuidonPanel):
    bl_label = "Guidon Tasks"

    def draw_header_preset(self, context):
        if jobs.is_busy():
            self.layout.label(text="", icon="SORTTIME")

    def draw(self, context):
        layout = self.layout
        p = prefs(context)

        if online_access_blocked():
            layout.label(text="Online access is disabled.", icon="ERROR")
            layout.label(text="Preferences > System > Network")
            return

        if state.message:
            box = layout.box()
            box.alert = True
            _wrapped(box, context, state.message)

        if not _logged_in():
            layout.prop(p, "base_url", text="URL")
            if state.login_cancel is not None:
                layout.label(text="Waiting for the browser...", icon="URL")
                layout.operator("guidon.cancel_login", icon="CANCEL")
            else:
                layout.operator("guidon.login", icon="URL")
            return

        if state.projects is None:
            layout.operator("guidon.refresh", text="Load Projects", icon="FILE_REFRESH")
            return

        row = layout.row(align=True)
        name = next((pr.get("name") for pr in state.projects if pr.get("id") == p.project_id), "Pick a project")
        row.operator_menu_enum("guidon.pick_project", "project", text=name, icon="OUTLINER_COLLECTION")
        row.operator("guidon.refresh", text="", icon="FILE_REFRESH")
        row.operator("guidon.open_board", text="", icon="URL")

        if not p.project_id:
            return

        props = context.window_manager.guidon
        layout.prop(props, "reports_only", text="Reports", toggle=True, icon="ERROR")
        board_tasks = [t for t in state.tasks if api.is_report(t)] if props.reports_only else state.tasks
        if props.reports_only and not board_tasks:
            _wrapped(layout, context, "No bug reports yet. Add the website widget or an engine plugin's in-game reports.")
        for column in state.columns:
            status = column.status
            tasks = api.column_tasks(board_tasks, status)
            box = layout.box()
            header = box.row(align=True)
            header.label(text="", icon=_status_icon(column))
            expanded = state.column_expanded(column)
            header.operator(
                "guidon.toggle_column",
                text="{} ({})".format(column.label, len(tasks)),
                icon="TRIA_DOWN" if expanded else "TRIA_RIGHT",
                emboss=False,
            ).status = status
            add = header.operator("guidon.create_task", text="", icon="ADD", emboss=False)
            add.status = status
            add.parent_task_id = ""
            if not expanded:
                continue
            col = box.column(align=True)
            for task in tasks:
                row = col.row(align=True)
                row.label(text="", icon=_priority_icon(task.get("priority")))
                op = row.operator(
                    "guidon.select_task",
                    text=task.get("title") or "(untitled)",
                    depress=task.get("id") == state.selected_task_id,
                )
                op.task_id = task["id"]
                subs = api.subtasks_of(state.tasks, task["id"])
                if subs:
                    done = sum(1 for s in subs if api.is_done(s, state.columns))
                    row.label(text="{}/{}".format(done, len(subs)), icon="CHECKMARK")
            if not tasks:
                col.label(text="No tasks")


class _TaskPanel(_GuidonPanel):
    bl_label = "Task"

    @classmethod
    def poll(cls, context):
        return _logged_in() and state.find_task(state.selected_task_id) is not None

    def draw(self, context):
        layout = self.layout
        task = state.find_task(state.selected_task_id)
        task_id = task["id"]

        _wrapped(layout.box(), context, task.get("title") or "(untitled)")

        row = layout.row(align=True)
        left = row.operator("guidon.move_task", text="", icon="TRIA_LEFT")
        left.task_id, left.direction = task_id, -1
        context.window_manager.guidon.menu_task_id = task_id
        row.menu("GUIDON_MT_status", text=state.status_label(task.get("status")))
        right = row.operator("guidon.move_task", text="", icon="TRIA_RIGHT")
        right.task_id, right.direction = task_id, 1

        info = layout.row()
        info.label(text=state.priority_label(task.get("priority")), icon=_priority_icon(task.get("priority")))
        info.label(text=(task.get("due_date") or "")[:10] or "No due date", icon="TIME")

        row = layout.row(align=True)
        row.operator("guidon.edit_task", text="Edit", icon="GREASEPENCIL").task_id = task_id
        row.operator("guidon.delete_task", text="Delete", icon="TRASH").task_id = task_id
        row.operator("guidon.copy_git_ref", text="Git Ref", icon="COPYDOWN").task_id = task_id

        layout.separator()
        layout.label(text="Description", icon="TEXT")
        description = task.get("description") or ""
        if description:
            _wrapped(layout, context, description, max_lines=30)
        else:
            layout.label(text="No description")
        row = layout.row(align=True)
        row.operator("guidon.edit_description", icon="TEXT").task_id = task_id
        row.operator("guidon.save_description", text="Save", icon="EXPORT").task_id = task_id

        if not task.get("parent_task_id"):
            layout.separator()
            header = layout.row()
            header.label(text="Subtasks", icon="CHECKBOX_HLT")
            add = header.operator("guidon.create_task", text="", icon="ADD", emboss=False)
            add.status = ""
            add.parent_task_id = task_id
            col = layout.column(align=True)
            for sub in api.subtasks_of(state.tasks, task_id):
                done = api.is_done(sub, state.columns)
                r = col.row(align=True)
                r.operator(
                    "guidon.toggle_subtask", text="", icon="CHECKBOX_HLT" if done else "CHECKBOX_DEHLT", emboss=False
                ).task_id = sub["id"]
                r.operator("guidon.select_task", text=sub.get("title") or "(untitled)", emboss=False).task_id = sub["id"]
        else:
            layout.operator("guidon.select_task", text="Back to Parent", icon="BACK").task_id = task["parent_task_id"]

        layout.separator()
        layout.label(text="Comments", icon="OUTLINER_DATA_GP_LAYER")
        comments = state.comments.get(task_id)
        if comments is None:
            layout.label(text="Loading...")
        elif not comments:
            layout.label(text="No comments yet")
        for comment in comments or []:
            box = layout.box()
            meta = "{} - {}".format(comment.get("actor_label") or "Someone", (comment.get("created_at") or "")[:16].replace("T", " "))
            box.label(text=meta)
            _wrapped(box, context, comment.get("content") or "")
        row = layout.row(align=True)
        row.prop(context.window_manager.guidon, "comment_text", text="")
        row.operator("guidon.add_comment", icon="PLAY").task_id = task_id


class _AccountPanel(_GuidonPanel):
    bl_label = "Account"
    bl_options = {"DEFAULT_CLOSED"}

    @classmethod
    def poll(cls, context):
        return _logged_in()

    def draw(self, context):
        p = prefs(context)
        layout = self.layout
        layout.label(text=p.email or "Logged in", icon="USER")
        layout.label(text=p.base_url)
        layout.operator("guidon.logout", icon="X")


class GUIDON_MT_status(bpy.types.Menu):
    """The project's visible columns - so a task can't be moved into one the board hides."""

    bl_idname = "GUIDON_MT_status"
    bl_label = "Status"

    def draw(self, context):
        task_id = context.window_manager.guidon.menu_task_id
        current = (state.find_task(task_id) or {}).get("status")
        for column in state.columns:
            icon = "LAYER_ACTIVE" if column.status == current else "BLANK1"
            op = self.layout.operator("guidon.set_status", text=column.label, icon=icon)
            op.task_id = task_id
            op.status = column.status


def _make(base, space, suffix):
    return type(
        "GUIDON_PT_{}_{}".format(base.__name__.strip("_").lower(), suffix),
        (base, bpy.types.Panel),
        {"bl_space_type": space, "bl_idname": "GUIDON_PT_{}_{}".format(base.__name__.strip("_").lower(), suffix)},
    )


classes = (GUIDON_MT_status,) + tuple(
    _make(base, space, suffix)
    for space, suffix in (("VIEW_3D", "view3d"), ("TEXT_EDITOR", "text"))
    for base in (_BoardPanel, _TaskPanel, _AccountPanel)
)

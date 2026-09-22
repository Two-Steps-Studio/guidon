"""Sidebar panels (N-panel, "Guidon" tab) in the 3D Viewport and the Text
Editor - the Text Editor copy is there because that's where a task's
description gets edited (see GUIDON_OT_edit_description)."""

import textwrap

import bpy

from . import api, jobs, state
from .ops import online_access_blocked, prefs

_PRIORITY_ICONS = {"critical": "ERROR", "high": "TRIA_UP", "medium": "REMOVE", "low": "TRIA_DOWN"}


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
        for index, status in enumerate(api.STATUSES):
            tasks = api.column_tasks(state.tasks, status)
            box = layout.box()
            header = box.row(align=True)
            expanded = props.expanded[index]
            header.prop(
                props,
                "expanded",
                index=index,
                text="{} ({})".format(api.STATUS_LABELS[status], len(tasks)),
                icon="TRIA_DOWN" if expanded else "TRIA_RIGHT",
                emboss=False,
            )
            add = header.operator("guidon.create_task", text="", icon="ADD", emboss=False)
            add.status = status
            add.parent_task_id = ""
            if not expanded:
                continue
            col = box.column(align=True)
            for task in tasks:
                row = col.row(align=True)
                row.label(text="", icon=_PRIORITY_ICONS.get(task.get("priority"), "DOT"))
                op = row.operator(
                    "guidon.select_task",
                    text=task.get("title") or "(untitled)",
                    depress=task.get("id") == state.selected_task_id,
                )
                op.task_id = task["id"]
                subs = api.subtasks_of(state.tasks, task["id"])
                if subs:
                    done = sum(1 for s in subs if s.get("status") == "done")
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
        status_menu = row.operator_menu_enum(
            "guidon.set_status", "status", text=api.STATUS_LABELS.get(task.get("status"), task.get("status") or "?")
        )
        status_menu.task_id = task_id
        right = row.operator("guidon.move_task", text="", icon="TRIA_RIGHT")
        right.task_id, right.direction = task_id, 1

        info = layout.row()
        info.label(text=(task.get("priority") or "-").capitalize(), icon=_PRIORITY_ICONS.get(task.get("priority"), "DOT"))
        info.label(text=(task.get("due_date") or "")[:10] or "No due date", icon="TIME")

        row = layout.row(align=True)
        row.operator("guidon.edit_task", text="Edit", icon="GREASEPENCIL").task_id = task_id
        row.operator("guidon.delete_task", text="Delete", icon="TRASH").task_id = task_id

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
                done = sub.get("status") == "done"
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


def _make(base, space, suffix):
    return type(
        "GUIDON_PT_{}_{}".format(base.__name__.strip("_").lower(), suffix),
        (base, bpy.types.Panel),
        {"bl_space_type": space, "bl_idname": "GUIDON_PT_{}_{}".format(base.__name__.strip("_").lower(), suffix)},
    )


classes = tuple(
    _make(base, space, suffix)
    for space, suffix in (("VIEW_3D", "view3d"), ("TEXT_EDITOR", "text"))
    for base in (_BoardPanel, _TaskPanel, _AccountPanel)
)

"""Operators - every button in the Guidon panels. Network calls go through
jobs.run so Blender's UI never blocks on the API."""

import webbrowser

import bpy
from bpy.props import EnumProperty, IntProperty, StringProperty

from . import api, auth, jobs, state

_TEXT_PREFIX = "Guidon "


# --- helpers ---------------------------------------------------------------


def prefs(context=None):
    context = context or bpy.context
    return context.preferences.addons[__package__].preferences


def client(context=None):
    p = prefs(context)
    return api.Client(p.base_url, p.api_key)


def online_access_blocked():
    # Blender 4.2+ lets users disable network access for all extensions.
    return not getattr(bpy.app, "online_access", True)


def _fail(error):
    state.message = error or "Request failed."


def _ok():
    state.message = ""


def load_tasks(context=None):
    p = prefs(context)
    project_id = p.project_id
    if not project_id:
        state.tasks = []
        return
    c = client(context)

    def work():
        ok, value = c.list_tasks(project_id)
        if not ok:
            return ok, value
        # Any failure here (e.g. an older server without the endpoint) just
        # means the default columns - the tasks themselves loaded fine.
        columns_ok, columns = c.list_columns(project_id)
        return True, (value, columns if columns_ok else api.DEFAULT_COLUMNS)

    def done(result):
        ok, value = result
        if not ok:
            return _fail(value)
        _ok()
        # Ignore a stale response if the user switched project meanwhile.
        if prefs().project_id == project_id:
            state.tasks, state.columns = value[0] or [], value[1]
            if state.selected_task_id and not state.find_task(state.selected_task_id):
                state.selected_task_id = ""

    jobs.run(work, done)


def load_projects(context=None):
    c = client(context)

    def done(result):
        ok, value = result
        if not ok:
            return _fail(value)
        _ok()
        state.projects = value or []
        p = prefs()
        ids = [pr.get("id") for pr in state.projects]
        if p.project_id not in ids:
            p.project_id = ids[0] if ids else ""
        load_tasks()

    jobs.run(c.list_projects, done)


def load_comments(task_id, context=None):
    c = client(context)

    def done(result):
        ok, value = result
        if not ok:
            return _fail(value)
        state.comments[task_id] = value or []

    jobs.run(lambda: c.list_comments(task_id), done)


def _apply_task(result):
    ok, value = result
    if not ok:
        return _fail(value)
    _ok()
    state.replace_task(value)


def _guard(op):
    if online_access_blocked():
        op.report({"ERROR"}, "Online access is disabled (Preferences > System > Network).")
        return False
    if not prefs().api_key:
        op.report({"ERROR"}, "Log in first.")
        return False
    return True


def _text_for(task):
    return bpy.data.texts.get(_TEXT_PREFIX + task["id"][:8] + ".md")


# --- account -----------------------------------------------------------------


class GUIDON_OT_login(bpy.types.Operator):
    bl_idname = "guidon.login"
    bl_label = "Log In"
    bl_description = "Log in through the Guidon website in your browser"

    def execute(self, context):
        if online_access_blocked():
            self.report({"ERROR"}, "Online access is disabled (Preferences > System > Network).")
            return {"CANCELLED"}
        base_url = prefs(context).base_url
        cancel = state.new_login_cancel()

        def done(result):
            state.login_cancel = None
            ok, value = result
            if not ok:
                return _fail(value)
            p = prefs()
            p.api_key = value["apiKey"]
            p.email = value.get("email", "")
            bpy.context.preferences.is_dirty = True  # let auto-save persist the key
            _ok()
            load_projects()

        jobs.run(lambda: auth.login(base_url, cancel), done)
        return {"FINISHED"}


class GUIDON_OT_cancel_login(bpy.types.Operator):
    bl_idname = "guidon.cancel_login"
    bl_label = "Cancel Login"

    def execute(self, context):
        if state.login_cancel is not None:
            state.login_cancel.set()
        return {"FINISHED"}


class GUIDON_OT_logout(bpy.types.Operator):
    bl_idname = "guidon.logout"
    bl_label = "Log Out"
    bl_description = "Forget the stored API key on this machine (it stays listed under Profile > API Keys until revoked there)"

    def execute(self, context):
        p = prefs(context)
        p.api_key = ""
        p.email = ""
        context.preferences.is_dirty = True
        state.reset()
        return {"FINISHED"}


# --- board -------------------------------------------------------------------


class GUIDON_OT_refresh(bpy.types.Operator):
    bl_idname = "guidon.refresh"
    bl_label = "Refresh"
    bl_description = "Reload projects and tasks from Guidon"

    def execute(self, context):
        if not _guard(self):
            return {"CANCELLED"}
        load_projects(context)
        if state.selected_task_id:
            load_comments(state.selected_task_id, context)
        return {"FINISHED"}


def _project_items(self, context):
    items = [(p["id"], p.get("name") or p["id"], "") for p in (state.projects or []) if p.get("id")]
    _project_items.cache = items  # Blender needs the strings kept alive
    return items or [("", "(no projects)", "")]


class GUIDON_OT_pick_project(bpy.types.Operator):
    bl_idname = "guidon.pick_project"
    bl_label = "Project"
    bl_property = "project"

    project: EnumProperty(name="Project", items=_project_items)

    def execute(self, context):
        if self.project and self.project != prefs(context).project_id:
            prefs(context).project_id = self.project
            context.preferences.is_dirty = True
            state.tasks = []
            state.selected_task_id = ""
            state.columns = api.DEFAULT_COLUMNS
            load_tasks(context)
        return {"FINISHED"}


class GUIDON_OT_open_board(bpy.types.Operator):
    bl_idname = "guidon.open_board"
    bl_label = "Open in Browser"
    bl_description = "Open this project's board on the Guidon website"

    def execute(self, context):
        p = prefs(context)
        if p.project_id:
            webbrowser.open("{}/projects/{}/work".format(p.base_url.rstrip("/"), p.project_id))
        return {"FINISHED"}


class GUIDON_OT_select_task(bpy.types.Operator):
    bl_idname = "guidon.select_task"
    bl_label = "Open Task"
    bl_description = "Show this task in the Task panel"

    task_id: StringProperty()

    def execute(self, context):
        state.selected_task_id = "" if state.selected_task_id == self.task_id else self.task_id
        if state.selected_task_id and _guard(self):
            load_comments(self.task_id, context)
        return {"FINISHED"}


_STATUS_ITEMS = [(s, api.STATUS_LABELS[s], "") for s in api.STATUSES]
_PRIORITY_ITEMS = [(p, p.capitalize(), "") for p in api.PRIORITIES]


class GUIDON_OT_set_status(bpy.types.Operator):
    bl_idname = "guidon.set_status"
    bl_label = "Set Status"
    bl_description = "Move the task to another column"

    task_id: StringProperty()
    status: EnumProperty(name="Status", items=_STATUS_ITEMS)

    def execute(self, context):
        if not _guard(self):
            return {"CANCELLED"}
        task = state.find_task(self.task_id)
        if task is None or task.get("status") == self.status:
            return {"CANCELLED"}
        c = client(context)
        task_id, status = self.task_id, self.status
        # A moved card lands at the end of its new column, like a drop on the
        # web board / Unity plugin. Subtasks aren't on the board - status only.
        append_order = None
        if not task.get("parent_task_id"):
            append_order = api.sort_order_for_append(api.column_tasks(state.tasks, status))

        def work():
            ok, value = c.set_status(task_id, status)
            if not ok or append_order is None:
                return ok, value
            ok2, value2 = c.update_task(task_id, sort_order=append_order)
            # The status change already landed - report the reorder failure
            # but keep the status result rather than pretending nothing moved.
            return (True, value2) if ok2 else (True, dict(value, _warning=value2))

        def done(result):
            ok, value = result
            if ok and isinstance(value, dict) and value.get("_warning"):
                state.message = value.pop("_warning")
                state.replace_task(value)
                return
            _apply_task(result)

        jobs.run(work, done)
        return {"FINISHED"}


class GUIDON_OT_move_task(bpy.types.Operator):
    bl_idname = "guidon.move_task"
    bl_label = "Move Task"
    bl_description = "Move the task to the previous/next column"

    task_id: StringProperty()
    direction: IntProperty(default=1)

    def execute(self, context):
        task = state.find_task(self.task_id)
        order = [status for status, _ in state.columns]
        if task is None or task.get("status") not in order:
            return {"CANCELLED"}
        index = order.index(task["status"]) + self.direction
        if not 0 <= index < len(order):
            return {"CANCELLED"}
        return bpy.ops.guidon.set_status(task_id=self.task_id, status=order[index])


class GUIDON_OT_toggle_subtask(bpy.types.Operator):
    bl_idname = "guidon.toggle_subtask"
    bl_label = "Toggle Subtask"
    bl_description = "Mark the subtask done / not done"

    task_id: StringProperty()

    def execute(self, context):
        task = state.find_task(self.task_id)
        if task is None:
            return {"CANCELLED"}
        return bpy.ops.guidon.set_status(task_id=self.task_id, status="todo" if task.get("status") == "done" else "done")


class GUIDON_OT_create_task(bpy.types.Operator):
    bl_idname = "guidon.create_task"
    bl_label = "New Task"
    bl_description = "Create a task in this column (or a subtask of the open task)"

    status: StringProperty(options={"HIDDEN"})
    parent_task_id: StringProperty(options={"HIDDEN"})
    title: StringProperty(name="Title")
    description: StringProperty(name="Description")
    priority: EnumProperty(name="Priority", items=_PRIORITY_ITEMS, default="medium")
    due_date: StringProperty(name="Due Date", description="YYYY-MM-DD, empty for none")

    def invoke(self, context, event):
        self.title = ""
        self.description = ""
        self.due_date = ""
        return context.window_manager.invoke_props_dialog(self, width=360)

    def draw(self, context):
        layout = self.layout
        layout.prop(self, "title")
        if not self.parent_task_id:  # the API ignores these for a subtask
            layout.prop(self, "description")
            layout.prop(self, "priority")
            layout.prop(self, "due_date")

    def execute(self, context):
        if not _guard(self):
            return {"CANCELLED"}
        title = self.title.strip()
        if not title:
            self.report({"ERROR"}, "Title is required.")
            return {"CANCELLED"}
        project_id = prefs(context).project_id
        c = client(context)
        args = dict(
            description=self.description.strip(),
            priority=self.priority if not self.parent_task_id else "",
            due_date=self.due_date.strip(),
            parent_task_id=self.parent_task_id,
            status=self.status if not self.parent_task_id else "",
        )
        jobs.run(lambda: c.create_task(project_id, title, **args), _apply_task)
        return {"FINISHED"}


class GUIDON_OT_edit_task(bpy.types.Operator):
    bl_idname = "guidon.edit_task"
    bl_label = "Edit Task"
    bl_description = "Edit title, priority and due date"

    task_id: StringProperty(options={"HIDDEN"})
    title: StringProperty(name="Title")
    priority: EnumProperty(name="Priority", items=_PRIORITY_ITEMS, default="medium")
    due_date: StringProperty(name="Due Date", description="YYYY-MM-DD, empty for none")

    def invoke(self, context, event):
        task = state.find_task(self.task_id)
        if task is None:
            return {"CANCELLED"}
        self.title = task.get("title") or ""
        if task.get("priority") in api.PRIORITIES:
            self.priority = task["priority"]
        self.due_date = (task.get("due_date") or "")[:10]
        return context.window_manager.invoke_props_dialog(self, width=360)

    def execute(self, context):
        if not _guard(self):
            return {"CANCELLED"}
        title = self.title.strip()
        if not title:
            self.report({"ERROR"}, "Title is required.")
            return {"CANCELLED"}
        c = client(context)
        task_id = self.task_id
        fields = dict(title=title, priority=self.priority, due_date=self.due_date.strip())
        jobs.run(lambda: c.update_task(task_id, **fields), _apply_task)
        return {"FINISHED"}


class GUIDON_OT_edit_description(bpy.types.Operator):
    bl_idname = "guidon.edit_description"
    bl_label = "Edit in Text Editor"
    bl_description = "Copy the description into a text block to edit it (Markdown); save it back with Save Description"

    task_id: StringProperty()

    def execute(self, context):
        task = state.find_task(self.task_id)
        if task is None:
            return {"CANCELLED"}
        text = _text_for(task) or bpy.data.texts.new(_TEXT_PREFIX + task["id"][:8] + ".md")
        text.clear()
        text.write(task.get("description") or "")
        shown = False
        for area in context.screen.areas:
            if area.type == "TEXT_EDITOR":
                area.spaces.active.text = text
                shown = True
                break
        if not shown:
            self.report({"INFO"}, "Open a Text Editor and pick '{}' to edit the description.".format(text.name))
        return {"FINISHED"}


class GUIDON_OT_save_description(bpy.types.Operator):
    bl_idname = "guidon.save_description"
    bl_label = "Save Description"
    bl_description = "Send the text block's contents to Guidon as this task's description"

    task_id: StringProperty()

    def execute(self, context):
        if not _guard(self):
            return {"CANCELLED"}
        task = state.find_task(self.task_id)
        text = _text_for(task) if task else None
        if text is None:
            self.report({"ERROR"}, "Click Edit in Text Editor first.")
            return {"CANCELLED"}
        c = client(context)
        task_id, description = self.task_id, text.as_string()
        jobs.run(lambda: c.update_task(task_id, description=description), _apply_task)
        return {"FINISHED"}


class GUIDON_OT_delete_task(bpy.types.Operator):
    bl_idname = "guidon.delete_task"
    bl_label = "Delete Task"
    bl_description = "Delete this task and its subtasks"

    task_id: StringProperty()

    def invoke(self, context, event):
        return context.window_manager.invoke_confirm(self, event)

    def execute(self, context):
        if not _guard(self):
            return {"CANCELLED"}
        c = client(context)
        task_id = self.task_id

        def done(result):
            ok, value = result
            if not ok:
                return _fail(value)
            _ok()
            state.remove_task(task_id)

        jobs.run(lambda: c.delete_task(task_id), done)
        return {"FINISHED"}


class GUIDON_OT_add_comment(bpy.types.Operator):
    bl_idname = "guidon.add_comment"
    bl_label = "Post"
    bl_description = "Post the comment"

    task_id: StringProperty()

    def execute(self, context):
        if not _guard(self):
            return {"CANCELLED"}
        props = context.window_manager.guidon
        content = props.comment_text.strip()
        if not content:
            return {"CANCELLED"}
        c = client(context)
        task_id = self.task_id

        def done(result):
            ok, value = result
            if not ok:
                return _fail(value)
            _ok()
            bpy.context.window_manager.guidon.comment_text = ""
            state.comments.setdefault(task_id, []).append(value)

        jobs.run(lambda: c.add_comment(task_id, content), done)
        return {"FINISHED"}


classes = (
    GUIDON_OT_login,
    GUIDON_OT_cancel_login,
    GUIDON_OT_logout,
    GUIDON_OT_refresh,
    GUIDON_OT_pick_project,
    GUIDON_OT_open_board,
    GUIDON_OT_select_task,
    GUIDON_OT_set_status,
    GUIDON_OT_move_task,
    GUIDON_OT_toggle_subtask,
    GUIDON_OT_create_task,
    GUIDON_OT_edit_task,
    GUIDON_OT_edit_description,
    GUIDON_OT_save_description,
    GUIDON_OT_delete_task,
    GUIDON_OT_add_comment,
)

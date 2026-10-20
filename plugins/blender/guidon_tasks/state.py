"""In-memory add-on state. Plain Python, not bpy properties: it's a cache of
server data that gets reloaded with Refresh, never saved into a .blend."""

import threading

from . import api

projects = None  # list of project dicts, None until first loaded
tasks = []  # every task of the selected project, subtasks included
comments = {}  # task_id -> list of comment dicts
columns = api.DEFAULT_COLUMNS  # the selected project's visible api.Column tuples, board order
priorities = api.DEFAULT_PRIORITIES  # the selected project's visible api.Priority tuples, most important first
expanded = {}  # column status -> whether its box is open (see column_expanded)
selected_task_id = ""
message = ""  # last error, shown at the top of the board panel
login_cancel = None  # threading.Event while a browser login is waiting


def reset():
    global projects, tasks, comments, columns, priorities, selected_task_id, message
    projects = None
    tasks = []
    comments = {}
    columns = api.DEFAULT_COLUMNS
    priorities = api.DEFAULT_PRIORITIES
    selected_task_id = ""
    message = ""


def new_login_cancel():
    global login_cancel
    login_cancel = threading.Event()
    return login_cancel


def find_task(task_id):
    for task in tasks:
        if task.get("id") == task_id:
            return task
    return None


def replace_task(updated):
    if not isinstance(updated, dict) or not updated.get("id"):
        return
    for i, task in enumerate(tasks):
        if task.get("id") == updated["id"]:
            tasks[i] = updated
            return
    tasks.append(updated)


def remove_task(task_id):
    global tasks, selected_task_id
    # Deleting a task cascades to its subtasks server-side - drop them here too.
    tasks = [t for t in tasks if t.get("id") != task_id and t.get("parent_task_id") != task_id]
    comments.pop(task_id, None)
    if selected_task_id == task_id:
        selected_task_id = ""


def status_label(status):
    for column in columns:
        if column.status == status:
            return column.label
    # A hidden or unknown (e.g. just-deleted custom) status: show the key itself.
    return api.STATUS_LABELS.get(status, status or "?")


def priority_label(key):
    for priority in priorities:
        if priority.key == key:
            return priority.label
    return api.PRIORITY_LABELS.get(key, key or "-")


def column_expanded(column):
    """Backlog and done columns start collapsed, the rest open - by status
    key, so the choice survives the columns reloading or being reordered."""
    return expanded.get(column.status, column.status != "backlog" and not column.is_done)

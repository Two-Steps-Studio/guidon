"""In-memory add-on state. Plain Python, not bpy properties: it's a cache of
server data that gets reloaded with Refresh, never saved into a .blend."""

import threading

from . import api

projects = None  # list of project dicts, None until first loaded
tasks = []  # every task of the selected project, subtasks included
comments = {}  # task_id -> list of comment dicts
columns = api.DEFAULT_COLUMNS  # the selected project's visible (status, label) columns, board order
selected_task_id = ""
message = ""  # last error, shown at the top of the board panel
login_cancel = None  # threading.Event while a browser login is waiting


def reset():
    global projects, tasks, comments, columns, selected_task_id, message
    projects = None
    tasks = []
    comments = {}
    columns = api.DEFAULT_COLUMNS
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
    for column_status, label in columns:
        if column_status == status:
            return label
    return api.STATUS_LABELS.get(status, status or "?")

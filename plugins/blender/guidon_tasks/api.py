"""Thin client for Guidon's /api/v1 - the same calls the Unity plugin's
GuidonApiClient.cs makes. Standard library only (urllib + json), no bpy
import, so it can be exercised outside Blender.

Every function returns ``(ok, value_or_error)`` instead of raising: the
calls run on a worker thread (see jobs.py), where an uncaught exception
would surface nowhere useful.
"""

import json
import urllib.error
import urllib.request

TIMEOUT_SECONDS = 20

# Mirrors src/lib/work/task-board.ts (BOARD_COLUMNS / TASK_PRIORITIES) by
# hand - there is no shared-schema codegen, so this is a manual-sync point,
# same as GuidonVocabulary in the Unity plugin.
STATUSES = ("backlog", "todo", "in_progress", "ai_working", "review", "done")
STATUS_LABELS = {
    "backlog": "Backlog",
    "todo": "Todo",
    "in_progress": "In Progress",
    "ai_working": "AI Working",
    "review": "Review",
    "done": "Done",
}
PRIORITIES = ("low", "medium", "high", "critical")


class Client:
    def __init__(self, base_url, api_key):
        self.base_url = (base_url or "").rstrip("/")
        self.api_key = api_key or ""

    def _send(self, method, path, body=None):
        if not self.base_url or not self.api_key:
            return False, "Log in first."

        data = None
        headers = {
            "Authorization": "Bearer " + self.api_key,
            "Accept": "application/json",
            "User-Agent": "GuidonTasks-Blender/1.0",
        }
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = urllib.request.Request(self.base_url + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            return False, "{} {}".format(e.code, _server_error(e) or e.reason).strip()
        except (urllib.error.URLError, OSError) as e:
            reason = getattr(e, "reason", e)
            return False, "Request failed: {}".format(reason)

        if not raw:
            return True, {}
        try:
            return True, json.loads(raw)
        except ValueError as e:
            return False, "Malformed response: {}".format(e)

    def _get_field(self, method, path, field, body=None, default=None):
        ok, value = self._send(method, path, body)
        if not ok:
            return False, value
        if not isinstance(value, dict):
            return False, "Unexpected response shape."
        result = value.get(field, default)
        return True, result if result is not None else default

    def list_projects(self):
        return self._get_field("GET", "/api/v1/projects", "projects", default=[])

    def list_tasks(self, project_id):
        return self._get_field("GET", "/api/v1/projects/{}/tasks".format(project_id), "tasks", default=[])

    def create_task(self, project_id, title, description="", priority="", due_date="", parent_task_id="", status=""):
        body = {"title": title}
        # Omit empty optionals entirely - unlike Unity's JsonUtility, json.dumps can.
        for key, value in (
            ("description", description),
            ("priority", priority),
            ("due_date", due_date),
            ("parent_task_id", parent_task_id),
            ("status", status),
        ):
            if value:
                body[key] = value
        return self._get_field("POST", "/api/v1/projects/{}/tasks".format(project_id), "task", body)

    def update_task(self, task_id, **fields):
        """PATCH title/description/priority/due_date/sort_order - only the keys passed are sent."""
        return self._get_field("PATCH", "/api/v1/tasks/{}".format(task_id), "task", fields)

    def set_status(self, task_id, status):
        return self._get_field("PATCH", "/api/v1/tasks/{}/status".format(task_id), "task", {"status": status})

    def delete_task(self, task_id):
        ok, value = self._send("DELETE", "/api/v1/tasks/{}".format(task_id))
        return (True, True) if ok else (False, value)

    def list_comments(self, task_id):
        return self._get_field("GET", "/api/v1/tasks/{}/comment".format(task_id), "comments", default=[])

    def add_comment(self, task_id, content):
        return self._get_field("POST", "/api/v1/tasks/{}/comment".format(task_id), "comment", {"content": content})


def _server_error(http_error):
    try:
        payload = json.loads(http_error.read().decode("utf-8"))
    except Exception:
        return None
    return payload.get("error") if isinstance(payload, dict) else None


def sort_order_for_append(column_tasks):
    """Port of the append case of sortOrderForPosition (task-board.ts): a
    card dropped at the end of a column goes 100 past the current last one."""
    orders = [t.get("sort_order") for t in column_tasks if isinstance(t.get("sort_order"), (int, float))]
    return max(orders) + 100 if orders else 1000


def column_tasks(tasks, status):
    """Top-level tasks in one board column, in board order (sort_order, then newest first)."""
    top = [t for t in tasks if t.get("status") == status and not t.get("parent_task_id")]
    top.sort(key=lambda t: t.get("created_at") or "", reverse=True)
    top.sort(key=lambda t: t.get("sort_order") if isinstance(t.get("sort_order"), (int, float)) else 0)
    return top


def subtasks_of(tasks, task_id):
    subs = [t for t in tasks if t.get("parent_task_id") == task_id]
    subs.sort(key=lambda t: t.get("created_at") or "")
    return subs

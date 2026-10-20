"""Thin client for Guidon's /api/v1 - the same calls the Unity plugin's
GuidonApiClient.cs makes. Standard library only (urllib + json), no bpy
import, so it can be exercised outside Blender.

Every function returns ``(ok, value_or_error)`` instead of raising: the
calls run on a worker thread (see jobs.py), where an uncaught exception
would surface nowhere useful.
"""

import colorsys
import json
import os
import re
import urllib.error
import urllib.request
from collections import namedtuple

TIMEOUT_SECONDS = 20
MAX_IMAGE_BYTES = 20 * 1024 * 1024

# Formats Blender can load as an image (no GIF/SVG) -> file extension.
IMAGE_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/tiff": ".tif",
}

# The built-in vocabulary, mirrored from src/lib/work/task-board.ts
# (BOARD_COLUMNS / TASK_PRIORITIES) by hand - there is no shared-schema
# codegen, so this is a manual-sync point, same as GuidonVocabulary in the
# Unity plugin. Projects can add their own statuses and priorities on top
# (migration 060), loaded from /columns and /priorities; these are only the
# fallback for an older server and the labels/icons of the built-in keys.
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
PRIORITY_LABELS = {p: p.capitalize() for p in PRIORITIES}

# What a project-defined status/priority key looks like (server-side check).
KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,39}$")


class Column(namedtuple("Column", "status label is_done color")):
    """One visible board column. ``color`` is a "#rrggbb" or None (= built-in look)."""


class Priority(namedtuple("Priority", "key label color")):
    """One visible priority, most important first. ``color`` as for Column."""


# What the board shows when the server can't say (an older Guidon without
# the columns endpoint): every status, default labels, default order, and
# "done" as the only done column.
DEFAULT_COLUMNS = tuple(Column(s, STATUS_LABELS[s], s == "done", None) for s in STATUSES)
# Same for a server without the priorities endpoint (404): the four
# built-ins, most important first like the endpoint returns them.
DEFAULT_PRIORITIES = tuple(Priority(p, PRIORITY_LABELS[p], None) for p in reversed(PRIORITIES))


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

    def list_columns(self, project_id):
        """The project's visible board columns in board order, as Column tuples."""
        ok, value = self._get_field("GET", "/api/v1/projects/{}/columns".format(project_id), "columns", default=[])
        return (True, parse_columns(value)) if ok else (False, value)

    def list_priorities(self, project_id):
        """The project's visible priorities, most important first, as Priority
        tuples. An older server answers 404 - callers fall back to DEFAULT_PRIORITIES."""
        ok, value = self._get_field("GET", "/api/v1/projects/{}/priorities".format(project_id), "priorities", default=[])
        return (True, parse_priorities(value)) if ok else (False, value)

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

    def list_references(self, project_id):
        """The project's moodboard, newest first. Each ``image_url`` is signed and short-lived."""
        return self._get_field("GET", "/api/v1/projects/{}/references".format(project_id), "references", default=[])

    def list_comments(self, task_id):
        return self._get_field("GET", "/api/v1/tasks/{}/comment".format(task_id), "comments", default=[])

    def add_comment(self, task_id, content):
        return self._get_field("POST", "/api/v1/tasks/{}/comment".format(task_id), "comment", {"content": content})


def download_image(url, path):
    """Saves a signed moodboard image URL to ``path``. No API key is sent -
    the URL carries its own signature. Returns ``(ok, path_or_error)``."""
    if not url or not url.lower().startswith(("http://", "https://")):
        return False, "No image URL."
    request = urllib.request.Request(url, headers={"User-Agent": "GuidonTasks-Blender/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            data = response.read(MAX_IMAGE_BYTES + 1)
    except urllib.error.HTTPError as e:
        return False, "{} {}".format(e.code, e.reason)
    except (urllib.error.URLError, OSError) as e:
        return False, "Download failed: {}".format(getattr(e, "reason", e))
    if len(data) > MAX_IMAGE_BYTES:
        return False, "Image too large."
    os.makedirs(os.path.dirname(path), exist_ok=True)
    partial = path + ".part"
    with open(partial, "wb") as f:
        f.write(data)
    os.replace(partial, path)
    return True, path


def _server_error(http_error):
    try:
        payload = json.loads(http_error.read().decode("utf-8"))
    except Exception:
        return None
    return payload.get("error") if isinstance(payload, dict) else None


def _valid_key(value):
    return isinstance(value, str) and bool(KEY_PATTERN.match(value))


def _color(value):
    return value if isinstance(value, str) and re.match(r"^#[0-9a-fA-F]{6}$", value) else None


def parse_columns(raw):
    """Server columns -> Column tuples. Custom statuses are kept as-is; an
    older server sends only {status, label}, so "done" is then the only done
    column."""
    columns = []
    for column in raw if isinstance(raw, list) else []:
        status = column.get("status") if isinstance(column, dict) else None
        if not _valid_key(status) or status in (c.status for c in columns):
            continue
        is_done = column.get("is_done")
        columns.append(
            Column(
                status,
                column.get("label") or STATUS_LABELS.get(status, status),
                is_done if isinstance(is_done, bool) else status == "done",
                _color(column.get("color")),
            )
        )
    return tuple(columns) or DEFAULT_COLUMNS


def parse_priorities(raw):
    priorities = []
    for priority in raw if isinstance(raw, list) else []:
        key = priority.get("key") if isinstance(priority, dict) else None
        if not _valid_key(key) or key in (p.key for p in priorities):
            continue
        priorities.append(Priority(key, priority.get("label") or PRIORITY_LABELS.get(key, key), _color(priority.get("color"))))
    return tuple(priorities) or DEFAULT_PRIORITIES


def is_done(task, columns):
    """Whether a task counts as finished: the server's ``is_done`` when it
    sends one, else its column's ``is_done``, else ``status == "done"``."""
    value = task.get("is_done")
    if isinstance(value, bool):
        return value
    status = task.get("status")
    for column in columns:
        if column.status == status:
            return column.is_done
    return status == "done"


def color_tag(hex_color):
    """Nearest of Blender's nine color tags ("01".."09") for a "#rrggbb" -
    01 red, 02 orange, 03 yellow, 04 green, 05 blue, 06 violet, 07 pink,
    08 brown, 09 gray. None for no/invalid color."""
    if not _color(hex_color):
        return None
    r, g, b = (int(hex_color[i : i + 2], 16) / 255.0 for i in (1, 3, 5))
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    hue = h * 360
    if s < 0.2 or v < 0.15:
        return "09"
    if 15 <= hue < 50 and v < 0.55:
        return "08"
    for limit, tag in ((15, "01"), (40, "02"), (70, "03"), (170, "04"), (250, "05"), (290, "06"), (345, "07")):
        if hue < limit:
            return tag
    return "01"


def git_ref(task_id):
    """`guidon#1a2b3c4d` - what the GitHub integration recognises in commits, PRs and branch names."""
    return "guidon#" + (task_id or "")[:8].lower()


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


def is_report(task):
    """Filed by the website widget or an in-game reporter - the reports route tags it "web" or "in-game"."""
    tags = task.get("tags") or []
    return "web" in tags or "in-game" in tags


def subtasks_of(tasks, task_id):
    subs = [t for t in tasks if t.get("parent_task_id") == task_id]
    subs.sort(key=lambda t: t.get("created_at") or "")
    return subs

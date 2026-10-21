"""Client for the Guidon REST API (/api/v1)."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Optional, Sequence, Union

from ._http import FileTuple, HttpClient, _Multipart

JSON = Dict[str, Any]


class _Unset:
    def __repr__(self) -> str:
        return "UNSET"


UNSET: Any = _Unset()


def _seg(value: str, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{name} must be a non-empty string")
    return urllib.parse.quote(value, safe="")


def _drop_unset(fields: Mapping[str, Any]) -> JSON:
    return {k: v for k, v in fields.items() if v is not UNSET}


class _Resource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http


class ProjectsResource(_Resource):
    """Projects the key's user belongs to, and their board configuration."""

    def list(self) -> List[JSON]:
        """GET /projects. Scope ``tasks:read``."""
        return self._http.request("GET", "/projects")["projects"]

    def columns(self, project_id: str) -> List[JSON]:
        """GET /projects/{id}/columns - visible board columns, in order."""
        return self._http.request("GET", f"/projects/{_seg(project_id, 'project_id')}/columns")["columns"]

    def priorities(self, project_id: str) -> List[JSON]:
        """GET /projects/{id}/priorities - most important first."""
        return self._http.request("GET", f"/projects/{_seg(project_id, 'project_id')}/priorities")["priorities"]

    def references(self, project_id: str) -> List[JSON]:
        """GET /projects/{id}/references - moodboard images with short-lived signed URLs."""
        return self._http.request("GET", f"/projects/{_seg(project_id, 'project_id')}/references")["references"]


class TasksResource(_Resource):
    """Board cards."""

    def list_page(self, project_id: str, *, limit: Optional[int] = None, cursor: Optional[str] = None) -> JSON:
        """GET /projects/{id}/tasks - one page, newest first. Scope ``tasks:read``.

        Returns ``{"tasks": [...], "next_cursor": str | None}``; pass
        ``next_cursor`` as ``cursor`` for the next page. ``limit``: 1-1000
        (server default 1000).
        """
        res = self._http.request(
            "GET", f"/projects/{_seg(project_id, 'project_id')}/tasks", query={"limit": limit, "cursor": cursor}
        )
        return {"tasks": res.get("tasks") or [], "next_cursor": res.get("next_cursor")}

    def iter(self, project_id: str, *, page_size: Optional[int] = None) -> Iterator[JSON]:
        """Every task of the project, newest first, fetched page by page as you iterate."""
        cursor: Optional[str] = None
        seen = set()
        while True:
            page = self.list_page(project_id, limit=page_size, cursor=cursor)
            yield from page["tasks"]
            cursor = page["next_cursor"]
            if not cursor or cursor in seen:
                return
            seen.add(cursor)

    def list(
        self,
        project_id: str,
        *,
        status: Union[str, Sequence[str], None] = None,
        parent_task_id: Any = UNSET,
        page_size: Optional[int] = None,
    ) -> List[JSON]:
        """All of the project's tasks (every page), newest first. Scope ``tasks:read``.

        ``status`` and ``parent_task_id`` (``None`` for top-level tasks only)
        are applied client-side - the API has no server-side filters yet.
        """
        tasks: List[JSON] = list(self.iter(project_id, page_size=page_size))
        if status is not None:
            wanted = {status} if isinstance(status, str) else set(status)
            tasks = [t for t in tasks if t.get("status") in wanted]
        if parent_task_id is not UNSET:
            tasks = [t for t in tasks if t.get("parent_task_id") == parent_task_id]
        return tasks

    def get(self, task_id: str) -> JSON:
        """GET /tasks/{id}."""
        return self._http.request("GET", f"/tasks/{_seg(task_id, 'task_id')}")["task"]

    def create(
        self,
        project_id: str,
        title: str,
        *,
        description: Optional[str] = None,
        priority: Optional[str] = None,
        status: Optional[str] = None,
        due_date: Optional[str] = None,
        parent_task_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> JSON:
        """POST /projects/{id}/tasks. Scope ``tasks:write``.

        A top-level task defaults to ``backlog``/``medium``; with
        ``parent_task_id`` it is a subtask and starts as ``todo``/``medium``.
        """
        body: JSON = {"title": title}
        for key, value in (
            ("description", description),
            ("priority", priority),
            ("status", status),
            ("due_date", due_date),
            ("parent_task_id", parent_task_id),
        ):
            if value is not None:
                body[key] = value
        return self._http.request(
            "POST", f"/projects/{_seg(project_id, 'project_id')}/tasks", json_body=body, idempotency_key=idempotency_key
        )["task"]

    def update(
        self,
        task_id: str,
        *,
        title: Any = UNSET,
        description: Any = UNSET,
        priority: Any = UNSET,
        due_date: Any = UNSET,
        sort_order: Any = UNSET,
        idempotency_key: Optional[str] = None,
    ) -> JSON:
        """PATCH /tasks/{id} - edit fields (not the status: use :meth:`move`).

        Only the fields you pass are sent; ``description=None`` / ``due_date=None`` clear them.
        """
        body = _drop_unset(
            {"title": title, "description": description, "priority": priority, "due_date": due_date, "sort_order": sort_order}
        )
        if not body:
            raise ValueError("update() needs at least one field")
        return self._http.request(
            "PATCH", f"/tasks/{_seg(task_id, 'task_id')}", json_body=body, idempotency_key=idempotency_key
        )["task"]

    def move(self, task_id: str, status: str, *, idempotency_key: Optional[str] = None) -> JSON:
        """PATCH /tasks/{id}/status - move the task to another column. Scope ``tasks:status``."""
        return self._http.request(
            "PATCH", f"/tasks/{_seg(task_id, 'task_id')}/status", json_body={"status": status}, idempotency_key=idempotency_key
        )["task"]

    def delete(self, task_id: str, *, idempotency_key: Optional[str] = None) -> None:
        """DELETE /tasks/{id} - permanent (project owner/admin)."""
        self._http.request("DELETE", f"/tasks/{_seg(task_id, 'task_id')}", idempotency_key=idempotency_key)

    def start(self, task_id: str, *, idempotency_key: Optional[str] = None) -> JSON:
        """POST /tasks/{id}/start - claim the task. Scope ``tasks:status``."""
        return self._http.request("POST", f"/tasks/{_seg(task_id, 'task_id')}/start", idempotency_key=idempotency_key)["task"]

    def complete(self, task_id: str, *, idempotency_key: Optional[str] = None) -> JSON:
        """POST /tasks/{id}/complete - mark done, if the project allows AI auto-complete."""
        return self._http.request("POST", f"/tasks/{_seg(task_id, 'task_id')}/complete", idempotency_key=idempotency_key)[
            "task"
        ]

    def context(self, task_id: str) -> str:
        """GET /tasks/{id}/context - everything needed to do the task, as Markdown."""
        return self._http.request("GET", f"/tasks/{_seg(task_id, 'task_id')}/context", response_type="text")


class SubtasksResource:
    """Subtasks are tasks with ``parent_task_id`` set; they always start as ``todo``/``medium``."""

    def __init__(self, tasks: TasksResource) -> None:
        self._tasks = tasks

    def list(self, project_id: str, parent_task_id: str) -> List[JSON]:
        _seg(parent_task_id, "parent_task_id")
        return self._tasks.list(project_id, parent_task_id=parent_task_id)

    def create(
        self,
        project_id: str,
        parent_task_id: str,
        title: str,
        *,
        description: Optional[str] = None,
        due_date: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> JSON:
        _seg(parent_task_id, "parent_task_id")
        return self._tasks.create(
            project_id,
            title,
            description=description,
            due_date=due_date,
            parent_task_id=parent_task_id,
            idempotency_key=idempotency_key,
        )


class CommentsResource(_Resource):
    def list(self, task_id: str) -> List[JSON]:
        """GET /tasks/{id}/comment. Scope ``tasks:read``."""
        return self._http.request("GET", f"/tasks/{_seg(task_id, 'task_id')}/comment")["comments"]

    def create(self, task_id: str, content: str, *, idempotency_key: Optional[str] = None) -> JSON:
        """POST /tasks/{id}/comment. Scope ``comments:write``."""
        return self._http.request(
            "POST", f"/tasks/{_seg(task_id, 'task_id')}/comment", json_body={"content": content}, idempotency_key=idempotency_key
        )["comment"]


class AttemptsResource(_Resource):
    def list(self, task_id: str) -> List[JSON]:
        """GET /tasks/{id}/attempts, newest first."""
        return self._http.request("GET", f"/tasks/{_seg(task_id, 'task_id')}/attempts")["attempts"]

    def record(
        self,
        task_id: str,
        *,
        problem: str,
        approach: str,
        outcome: str,
        result: Optional[str] = None,
        failure_reason: Optional[str] = None,
        agent: Optional[str] = None,
        related_pr_url: Optional[str] = None,
        files_changed: Optional[Sequence[str]] = None,
        idempotency_key: Optional[str] = None,
    ) -> JSON:
        """POST /tasks/{id}/attempts. ``outcome``: failed, partial or succeeded. Scope ``attempts:write``."""
        body: JSON = {"problem": problem, "approach": approach, "outcome": outcome}
        for key, value in (
            ("result", result),
            ("failure_reason", failure_reason),
            ("agent", agent),
            ("related_pr_url", related_pr_url),
        ):
            if value is not None:
                body[key] = value
        if files_changed is not None:
            body["files_changed"] = list(files_changed)
        return self._http.request(
            "POST", f"/tasks/{_seg(task_id, 'task_id')}/attempts", json_body=body, idempotency_key=idempotency_key
        )["attempt"]


class ReportsResource(_Resource):
    def file(
        self,
        project_id: str,
        title: str,
        *,
        description: Optional[str] = None,
        category: Optional[str] = None,
        source: Optional[str] = None,
        reporter: Optional[str] = None,
        metadata: Optional[Mapping[str, Any]] = None,
        files: Iterable[FileTuple] = (),
        idempotency_key: Optional[str] = None,
    ) -> JSON:
        """POST /projects/{id}/reports (multipart) - file a bug report.

        ``files`` are ``(filename, data, content_type)`` tuples. Scope
        ``reports:write``, which a key can't combine with any other scope.
        """
        fields: Dict[str, str] = {"title": title}
        for key, value in (("description", description), ("category", category), ("source", source), ("reporter", reporter)):
            if value is not None:
                fields[key] = value
        if metadata is not None:
            fields["metadata"] = json.dumps(dict(metadata))
        return self._http.request(
            "POST",
            f"/projects/{_seg(project_id, 'project_id')}/reports",
            multipart=_Multipart(fields, files),
            idempotency_key=idempotency_key,
        )


class ProjectCollection(_Resource):
    """Decisions, knowledge, roadmap, memory and tech stack: /projects/{id}/<path>[/{item_id}].

    Reads need ``project:read``, writes ``project:write``. ``create``/``update``
    take the fields as keyword arguments (``None`` clears a nullable field on update).
    """

    def __init__(self, http: HttpClient, path: str, list_key: str, item_key: str) -> None:
        super().__init__(http)
        self._path = path
        self._list_key = list_key
        self._item_key = item_key

    def _base(self, project_id: str) -> str:
        return f"/projects/{_seg(project_id, 'project_id')}/{self._path}"

    def list(self, project_id: str) -> List[JSON]:
        """Up to 500 items."""
        return self._http.request("GET", self._base(project_id))[self._list_key]

    def get(self, project_id: str, item_id: str) -> JSON:
        return self._http.request("GET", f"{self._base(project_id)}/{_seg(item_id, 'item_id')}")[self._item_key]

    def create(self, project_id: str, *, idempotency_key: Optional[str] = None, **fields: Any) -> JSON:
        return self._http.request("POST", self._base(project_id), json_body=fields, idempotency_key=idempotency_key)[
            self._item_key
        ]

    def update(self, project_id: str, item_id: str, *, idempotency_key: Optional[str] = None, **fields: Any) -> JSON:
        if not fields:
            raise ValueError("update() needs at least one field")
        return self._http.request(
            "PATCH", f"{self._base(project_id)}/{_seg(item_id, 'item_id')}", json_body=fields, idempotency_key=idempotency_key
        )[self._item_key]

    def delete(self, project_id: str, item_id: str, *, idempotency_key: Optional[str] = None) -> None:
        self._http.request("DELETE", f"{self._base(project_id)}/{_seg(item_id, 'item_id')}", idempotency_key=idempotency_key)


class Guidon:
    """Client for the Guidon REST API.

    >>> guidon = Guidon(api_key="guidon_...")            # or set GUIDON_API_KEY
    >>> project = guidon.projects.list()[0]
    >>> task = guidon.tasks.create(project["id"], "Fix the jump", priority="high")
    >>> guidon.tasks.move(task["id"], "in_progress")

    ``base_url`` defaults to ``GUIDON_BASE_URL`` or https://useguidon.com (a
    self-hosted instance: ``https://guidon.example.com``; ``/api/v1`` is added).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        *,
        timeout: float = 30.0,
        max_retries: int = 2,
        user_agent: Optional[str] = None,
        headers: Optional[Mapping[str, str]] = None,
        opener: Optional[urllib.request.OpenerDirector] = None,
    ) -> None:
        self._http = HttpClient(
            api_key, base_url, timeout=timeout, max_retries=max_retries, user_agent=user_agent, headers=headers, opener=opener
        )
        self.projects = ProjectsResource(self._http)
        self.tasks = TasksResource(self._http)
        self.subtasks = SubtasksResource(self.tasks)
        self.comments = CommentsResource(self._http)
        self.attempts = AttemptsResource(self._http)
        self.reports = ReportsResource(self._http)
        self.decisions = ProjectCollection(self._http, "decisions", "decisions", "decision")
        self.knowledge = ProjectCollection(self._http, "knowledge", "sources", "source")
        self.roadmap = ProjectCollection(self._http, "roadmap", "phases", "phase")
        self.memory = ProjectCollection(self._http, "memory", "memories", "memory")
        self.technologies = ProjectCollection(self._http, "technologies", "technologies", "technology")

    @property
    def base_url(self) -> str:
        """The resolved API root, e.g. ``https://useguidon.com/api/v1``."""
        return self._http.base_url

    def request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[Mapping[str, Any]] = None,
        json: Any = None,
        idempotency_key: Optional[str] = None,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        """Escape hatch for routes the SDK doesn't wrap yet; ``path`` is relative to /api/v1."""
        return self._http.request(method, path, query=query, json_body=json, idempotency_key=idempotency_key, headers=headers)

"""Tests for the guidon SDK against a local mock http.server (no network)."""

from __future__ import annotations

import json
import io
import os
import sys
import threading
import time
import unittest
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
os.environ["NO_PROXY"] = os.environ["no_proxy"] = "127.0.0.1,localhost"

from guidon import Guidon, GuidonError, __version__, normalize_base_url  # noqa: E402

KEY = "guidon_py_test"
P = "11111111-1111-4111-8111-111111111111"
T = "22222222-2222-4222-8222-222222222222"


def task(**over):
    base = {
        "id": T,
        "project_id": P,
        "parent_task_id": None,
        "title": "Fix the jump",
        "description": None,
        "status": "backlog",
        "priority": "medium",
        "tags": [],
        "sort_order": 0,
    }
    base.update(over)
    return base


class MockServer:
    """Routes map "METHOD /path" -> handler(record, all_records) -> dict(status, body|raw, headers)."""

    def __init__(self):
        self.routes = {}
        self.requests = []
        mock = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):  # silence
                pass

            def _handle(self):
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length else b""
                url = urlsplit(self.path)
                body = None
                if raw and (self.headers.get("Content-Type") or "").startswith("application/json"):
                    body = json.loads(raw)
                record = {
                    "method": self.command,
                    "path": url.path,
                    "query": dict(parse_qsl(url.query)),
                    "headers": {k.lower(): v for k, v in self.headers.items()},
                    "raw": raw,
                    "body": body,
                }
                mock.requests.append(record)
                handler = mock.routes.get(f"{self.command} {url.path}") or mock.routes.get("*")
                out = handler(record, mock.requests) if handler else {"status": 404, "body": {"error": "no mock"}}
                if out.get("sleep"):
                    time.sleep(out["sleep"])
                headers = dict(out.get("headers") or {})
                if "raw" in out:
                    payload = out["raw"].encode() if isinstance(out["raw"], str) else out["raw"]
                elif "body" in out:
                    payload = json.dumps(out["body"]).encode()
                    headers.setdefault("Content-Type", "application/json")
                else:
                    payload = b""
                self.send_response(out.get("status", 200))
                for k, v in headers.items():
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            do_GET = do_POST = do_PATCH = do_DELETE = do_PUT = _handle

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mock = MockServer()

    @classmethod
    def tearDownClass(cls):
        cls.mock.close()

    def setUp(self):
        self.mock.routes.clear()
        self.mock.requests.clear()
        self.client = Guidon(api_key=KEY, base_url=self.mock.url, max_retries=2)

    def route(self, key, fn):
        self.mock.routes[key] = fn

    @property
    def last(self):
        return self.mock.requests[-1]


class ConfigTests(unittest.TestCase):
    def test_normalize_base_url(self):
        self.assertEqual(normalize_base_url("https://useguidon.com"), "https://useguidon.com/api/v1")
        self.assertEqual(normalize_base_url("https://useguidon.com/api/v1/"), "https://useguidon.com/api/v1")
        self.assertEqual(normalize_base_url("https://x.example/guidon/"), "https://x.example/guidon/api/v1")
        with self.assertRaises(GuidonError) as cm:
            normalize_base_url("ftp://x")
        self.assertEqual(cm.exception.code, "invalid_base_url")

    def test_default_base_url_and_env_key(self):
        saved = {k: os.environ.pop(k, None) for k in ("GUIDON_API_KEY", "GUIDON_BASE_URL")}
        try:
            with self.assertRaises(GuidonError) as cm:
                Guidon()
            self.assertEqual(cm.exception.code, "missing_api_key")
            os.environ["GUIDON_API_KEY"] = "guidon_env"
            self.assertEqual(Guidon().base_url, "https://useguidon.com/api/v1")
        finally:
            for k, v in saved.items():
                os.environ.pop(k, None)
                if v is not None:
                    os.environ[k] = v


class RequestShapeTests(Base):
    def test_projects_headers(self):
        self.route("GET /api/v1/projects", lambda r, a: {"body": {"projects": [{"id": P, "name": "Game"}]}})
        self.assertEqual(self.client.projects.list(), [{"id": P, "name": "Game"}])
        h = self.last["headers"]
        self.assertEqual(h["authorization"], f"Bearer {KEY}")
        self.assertEqual(h["accept"], "application/json")
        self.assertEqual(h["user-agent"], f"guidon-sdk-python/{__version__}")
        self.assertNotIn("idempotency-key", h)

    def test_board_config(self):
        self.route(f"GET /api/v1/projects/{P}/columns", lambda r, a: {"body": {"columns": [{"status": "todo"}]}})
        self.route(f"GET /api/v1/projects/{P}/priorities", lambda r, a: {"body": {"priorities": [{"key": "high"}]}})
        self.route(f"GET /api/v1/projects/{P}/references", lambda r, a: {"body": {"references": []}})
        self.assertEqual(self.client.projects.columns(P)[0]["status"], "todo")
        self.assertEqual(self.client.projects.priorities(P)[0]["key"], "high")
        self.assertEqual(self.client.projects.references(P), [])

    def test_tasks_list_filters(self):
        self.route(
            f"GET /api/v1/projects/{P}/tasks",
            lambda r, a: {
                "body": {
                    "tasks": [
                        task(id="a", status="todo"),
                        task(id="b", status="done"),
                        task(id="c", status="todo", parent_task_id="a"),
                    ]
                }
            },
        )
        ids = lambda ts: [t["id"] for t in ts]  # noqa: E731
        self.assertEqual(ids(self.client.tasks.list(P)), ["a", "b", "c"])
        self.assertEqual(ids(self.client.tasks.list(P, status="todo")), ["a", "c"])
        self.assertEqual(ids(self.client.tasks.list(P, status=["todo", "done"], parent_task_id=None)), ["a", "b"])
        self.assertEqual(ids(self.client.subtasks.list(P, "a")), ["c"])

    def test_pagination(self):
        pages = {"": (["a", "b"], "c1"), "c1": (["c"], "c2"), "c2": (["d"], None)}

        def handler(r, a):
            ids, nxt = pages[r["query"].get("cursor", "")]
            return {"body": {"tasks": [task(id=i) for i in ids], "next_cursor": nxt}}

        self.route(f"GET /api/v1/projects/{P}/tasks", handler)
        first = self.client.tasks.list_page(P, limit=2)
        self.assertEqual([t["id"] for t in first["tasks"]], ["a", "b"])
        self.assertEqual(first["next_cursor"], "c1")
        self.assertEqual(self.last["query"], {"limit": "2"})
        self.client.tasks.list_page(P, cursor="c1")
        self.assertEqual(self.last["query"], {"cursor": "c1"})
        self.mock.requests.clear()
        self.assertEqual([t["id"] for t in self.client.tasks.iter(P, page_size=2)], ["a", "b", "c", "d"])
        self.assertEqual([r["query"].get("limit") for r in self.mock.requests], ["2", "2", "2"])
        self.assertEqual([t["id"] for t in self.client.tasks.list(P)], ["a", "b", "c", "d"])

    def test_pagination_old_server_and_repeated_cursor(self):
        self.route(f"GET /api/v1/projects/{P}/tasks", lambda r, a: {"body": {"tasks": [task()]}})
        self.assertEqual(self.client.tasks.list_page(P), {"tasks": [task()], "next_cursor": None})
        self.route(f"GET /api/v1/projects/{P}/tasks", lambda r, a: {"body": {"tasks": [task()], "next_cursor": "same"}})
        self.mock.requests.clear()
        self.assertEqual(len(self.client.tasks.list(P)), 2)
        self.assertEqual(len(self.mock.requests), 2)

    def test_tasks_create_with_idempotency_key(self):
        self.route(f"POST /api/v1/projects/{P}/tasks", lambda r, a: {"body": {"task": task(**r["body"])}})
        t = self.client.tasks.create(P, "Fix the jump", priority="high", idempotency_key="idem-1")
        self.assertEqual(t["priority"], "high")
        self.assertEqual(self.last["body"], {"title": "Fix the jump", "priority": "high"})
        self.assertEqual(self.last["headers"]["content-type"], "application/json")
        self.assertEqual(self.last["headers"]["idempotency-key"], "idem-1")

    def test_subtasks_create(self):
        self.route(f"POST /api/v1/projects/{P}/tasks", lambda r, a: {"body": {"task": task(**r["body"])}})
        self.client.subtasks.create(P, T, "Step 1")
        self.assertEqual(self.last["body"], {"title": "Step 1", "parent_task_id": T})

    def test_task_operations(self):
        self.route(f"GET /api/v1/tasks/{T}", lambda r, a: {"body": {"task": task()}})
        self.route(f"PATCH /api/v1/tasks/{T}", lambda r, a: {"body": {"task": task(**r["body"])}})
        self.route(f"PATCH /api/v1/tasks/{T}/status", lambda r, a: {"body": {"task": task(status=r["body"]["status"])}})
        self.route(f"POST /api/v1/tasks/{T}/start", lambda r, a: {"body": {"task": task(status="ai_working")}})
        self.route(f"POST /api/v1/tasks/{T}/complete", lambda r, a: {"body": {"task": task(status="done")}})
        self.route(f"DELETE /api/v1/tasks/{T}", lambda r, a: {"body": {"ok": True}})
        self.route(
            f"GET /api/v1/tasks/{T}/context",
            lambda r, a: {"raw": "# Fix the jump\n", "headers": {"Content-Type": "text/markdown"}},
        )
        self.assertEqual(self.client.tasks.get(T)["id"], T)
        self.client.tasks.update(T, description=None, sort_order=3)
        self.assertEqual(self.last["body"], {"description": None, "sort_order": 3})
        with self.assertRaises(ValueError):
            self.client.tasks.update(T)
        self.assertEqual(self.client.tasks.move(T, "review")["status"], "review")
        self.assertEqual(self.last["body"], {"status": "review"})
        self.assertEqual(self.client.tasks.start(T)["status"], "ai_working")
        self.assertEqual(self.last["raw"], b"")
        self.assertEqual(self.client.tasks.complete(T)["status"], "done")
        self.assertIsNone(self.client.tasks.delete(T, idempotency_key="d1"))
        self.assertEqual(self.last["method"], "DELETE")
        self.assertEqual(self.last["headers"]["idempotency-key"], "d1")
        self.assertEqual(self.client.tasks.context(T), "# Fix the jump\n")
        self.assertIn("text/markdown", self.last["headers"]["accept"])

    def test_path_segments_are_encoded(self):
        self.route("*", lambda r, a: {"body": {"task": {"id": r["path"]}}})
        self.assertEqual(self.client.tasks.get("a/b?c")["id"], "/api/v1/tasks/a%2Fb%3Fc")
        with self.assertRaises(ValueError):
            self.client.tasks.get("")

    def test_comments_and_attempts(self):
        self.route(f"GET /api/v1/tasks/{T}/comment", lambda r, a: {"body": {"comments": [{"id": "c1"}]}})
        self.route(
            f"POST /api/v1/tasks/{T}/comment",
            lambda r, a: {"body": {"comment": {"id": "c2", "content": r["body"]["content"]}}},
        )
        self.route(f"GET /api/v1/tasks/{T}/attempts", lambda r, a: {"body": {"attempts": []}})
        self.route(
            f"POST /api/v1/tasks/{T}/attempts",
            lambda r, a: {"status": 201, "body": {"attempt": dict(id="a1", **r["body"])}},
        )
        self.assertEqual(self.client.comments.list(T), [{"id": "c1"}])
        self.assertEqual(self.client.comments.create(T, "Looks good", idempotency_key="c-1")["content"], "Looks good")
        self.assertEqual(self.last["body"], {"content": "Looks good"})
        self.assertEqual(self.last["headers"]["idempotency-key"], "c-1")
        self.assertEqual(self.client.attempts.list(T), [])
        a = self.client.attempts.record(T, problem="p", approach="a", outcome="failed", files_changed=("x.py",))
        self.assertEqual(a["outcome"], "failed")
        self.assertEqual(self.last["body"], {"problem": "p", "approach": "a", "outcome": "failed", "files_changed": ["x.py"]})

    def test_project_collections(self):
        cases = [
            ("decisions", "decisions", "decision"),
            ("knowledge", "sources", "source"),
            ("roadmap", "phases", "phase"),
            ("memory", "memories", "memory"),
            ("technologies", "technologies", "technology"),
        ]
        for path, list_key, item_key in cases:
            base = f"/api/v1/projects/{P}/{path}"
            self.route(f"GET {base}", lambda r, a, k=list_key: {"body": {k: [{"id": "i1"}]}})
            self.route(f"POST {base}", lambda r, a, k=item_key: {"status": 201, "body": {k: dict(id="i2", **r["body"])}})
            self.route(f"GET {base}/i1", lambda r, a, k=item_key: {"body": {k: {"id": "i1"}}})
            self.route(f"PATCH {base}/i1", lambda r, a, k=item_key: {"body": {k: dict(id="i1", **r["body"])}})
            self.route(f"DELETE {base}/i1", lambda r, a: {"body": {"ok": True}})
            col = getattr(self.client, path)
            self.assertEqual(col.list(P), [{"id": "i1"}], path)
            self.assertEqual(col.get(P, "i1")["id"], "i1", path)
            self.assertEqual(col.create(P, title="t")["title"], "t", path)
            self.assertEqual(self.last["body"], {"title": "t"})
            self.assertEqual(col.update(P, "i1", description=None)["description"], None, path)
            self.assertEqual(self.last["body"], {"description": None})
            self.assertIsNone(col.delete(P, "i1"), path)

    def test_reports_multipart(self):
        self.route(
            f"POST /api/v1/projects/{P}/reports",
            lambda r, a: {"status": 201, "body": {"task": task(), "attachments": [{"id": "f"}], "warnings": []}},
        )
        res = self.client.reports.file(
            P, "Crash on load", category="crash", metadata={"version": "1.2.0"}, files=[("log.txt", b"boom", "text/plain")]
        )
        self.assertEqual(len(res["attachments"]), 1)
        h = self.last["headers"]
        self.assertTrue(h["content-type"].startswith("multipart/form-data; boundary="))
        self.assertEqual(int(h["content-length"]), len(self.last["raw"]))
        raw = self.last["raw"].decode()
        self.assertIn('name="title"\r\n\r\nCrash on load', raw)
        self.assertIn('name="metadata"\r\n\r\n{"version": "1.2.0"}', raw)
        self.assertIn('name="file"; filename="log.txt"\r\nContent-Type: text/plain\r\n\r\nboom', raw)

    def test_request_escape_hatch(self):
        self.route("GET /api/v1/anything", lambda r, a: {"body": {"q": r["query"]}})
        self.assertEqual(self.client.request("GET", "/anything", query={"a": 1, "b": None, "c": True}), {"q": {"a": "1", "c": "true"}})


class ErrorResponseLifetimeTests(unittest.TestCase):
    def test_error_responses_close_before_retry_or_raise(self):
        for status, expected_calls in [(401, 1), (503, 2)]:
            bodies = []
            test = self

            class Opener:
                def open(self, request, **kwargs):
                    test.assertTrue(all(body.closed for body in bodies), "Close the previous error before retrying")
                    body = io.BytesIO(b'{"error":"failure"}')
                    bodies.append(body)
                    raise urllib.error.HTTPError(request.full_url, status, "failure", {"Content-Type": "application/json", "Retry-After": "0"}, body)

            client = Guidon(api_key=KEY, opener=Opener(), max_retries=1)
            with self.assertRaises(GuidonError) as caught:
                client.projects.list()
            self.assertEqual(caught.exception.status, status)
            self.assertEqual(len(bodies), expected_calls)
            self.assertTrue(all(body.closed for body in bodies))


class ErrorTests(Base):
    def test_error_body_parsed(self):
        self.route(
            f"GET /api/v1/tasks/{T}",
            lambda r, a: {"status": 404, "body": {"error": "Task not found."}, "headers": {"X-Request-Id": "req-9"}},
        )
        with self.assertRaises(GuidonError) as cm:
            self.client.tasks.get(T)
        e = cm.exception
        self.assertEqual((e.status, e.code, e.message), (404, "not_found", "Task not found."))
        self.assertEqual(e.body, {"error": "Task not found."})
        self.assertEqual(e.request_id, "req-9")
        self.assertEqual(e.method, "GET")
        self.assertEqual(str(e), "Task not found. (HTTP 404, not_found)")

    def test_status_codes_and_server_code(self):
        for status, code in [(400, "invalid_request"), (401, "unauthorized"), (403, "forbidden"), (422, "unprocessable"), (500, "internal_error"), (502, "internal_error"), (418, "invalid_request")]:
            self.route("GET /api/v1/projects", lambda r, a, s=status: {"status": s, "body": {"error": f"e{s}"}})
            with self.assertRaises(GuidonError) as cm:
                self.client.projects.list()
            self.assertEqual((cm.exception.status, cm.exception.code, cm.exception.message), (status, code, f"e{status}"))
        self.route("GET /api/v1/projects", lambda r, a: {"status": 409, "body": {"error": "Replay", "code": "idempotency_conflict"}})
        with self.assertRaises(GuidonError) as cm:
            self.client.projects.list()
        self.assertEqual(cm.exception.code, "idempotency_conflict")

    def test_hint_and_docs(self):
        self.route(
            "GET /api/v1/projects",
            lambda r, a: {"status": 401, "body": {"error": "Invalid key.", "code": "unauthorized", "hint": "Send a valid key.", "docs": "https://useguidon.com/developers"}},
        )
        with self.assertRaises(GuidonError) as cm:
            self.client.projects.list()
        self.assertEqual((cm.exception.hint, cm.exception.docs), ("Send a valid key.", "https://useguidon.com/developers"))

    def test_non_json_error_and_success(self):
        self.route("GET /api/v1/projects", lambda r, a: {"status": 400, "raw": "<html>bad</html>", "headers": {"Content-Type": "text/html"}})
        with self.assertRaises(GuidonError) as cm:
            self.client.projects.list()
        self.assertEqual(cm.exception.body, "<html>bad</html>")
        self.assertTrue(cm.exception.message.startswith("HTTP 400"))
        self.route("GET /api/v1/projects", lambda r, a: {"raw": "<html>login</html>", "headers": {"Content-Type": "text/html"}})
        with self.assertRaises(GuidonError) as cm:
            self.client.projects.list()
        self.assertEqual((cm.exception.code, cm.exception.status), ("invalid_response", 200))

    def test_network_error(self):
        client = Guidon(api_key=KEY, base_url="http://127.0.0.1:1", max_retries=0)
        with self.assertRaises(GuidonError) as cm:
            client.projects.list()
        self.assertEqual((cm.exception.status, cm.exception.code), (0, "network_error"))

    def test_timeout(self):
        self.route("GET /api/v1/projects", lambda r, a: {"sleep": 0.5, "body": {"projects": []}})
        client = Guidon(api_key=KEY, base_url=self.mock.url, timeout=0.1, max_retries=0)
        with self.assertRaises(GuidonError) as cm:
            client.projects.list()
        self.assertEqual(cm.exception.code, "timeout")


class RetryTests(Base):
    def test_get_retries_429_with_retry_after(self):
        self.route(
            "GET /api/v1/projects",
            lambda r, a: {"status": 429, "body": {"error": "Rate limit exceeded."}, "headers": {"Retry-After": "0"}}
            if len(a) < 3
            else {"body": {"projects": []}},
        )
        self.assertEqual(self.client.projects.list(), [])
        self.assertEqual(len(self.mock.requests), 3)

    def test_gives_up_after_max_retries(self):
        self.route("GET /api/v1/projects", lambda r, a: {"status": 503, "body": {"error": "down"}, "headers": {"Retry-After": "0"}})
        with self.assertRaises(GuidonError) as cm:
            self.client.projects.list()
        self.assertEqual((cm.exception.status, cm.exception.retry_after), (503, 0.0))
        self.assertEqual(len(self.mock.requests), 3)

    def test_write_without_key_not_retried(self):
        self.route(f"POST /api/v1/projects/{P}/tasks", lambda r, a: {"status": 503, "body": {"error": "down"}, "headers": {"Retry-After": "0"}})
        with self.assertRaises(GuidonError):
            self.client.tasks.create(P, "x")
        self.assertEqual(len(self.mock.requests), 1)

    def test_write_with_key_retried_with_same_key(self):
        self.route(
            f"POST /api/v1/projects/{P}/tasks",
            lambda r, a: {"status": 502, "body": {"error": "bad gateway"}, "headers": {"Retry-After": "0"}}
            if len(a) < 2
            else {"body": {"task": task()}},
        )
        self.client.tasks.create(P, "x", idempotency_key="same")
        self.assertEqual([r["headers"]["idempotency-key"] for r in self.mock.requests], ["same", "same"])

    def test_idempotency_in_progress_retried(self):
        self.route(
            f"POST /api/v1/tasks/{T}/comment",
            lambda r, a: {"status": 409, "body": {"error": "busy", "code": "idempotency_in_progress"}, "headers": {"Retry-After": "0"}}
            if len(a) < 2
            else {"body": {"comment": {"id": "c"}}},
        )
        self.client.comments.create(T, "x", idempotency_key="k")
        self.assertEqual(len(self.mock.requests), 2)

    def test_401_not_retried(self):
        self.route("GET /api/v1/projects", lambda r, a: {"status": 401, "body": {"error": "Invalid or missing API key."}})
        with self.assertRaises(GuidonError) as cm:
            self.client.projects.list()
        self.assertEqual(cm.exception.code, "unauthorized")
        self.assertEqual(len(self.mock.requests), 1)

    def test_cross_host_redirect_drops_authorization(self):
        other = MockServer()
        try:
            other.routes["GET /api/v1/projects"] = lambda r, a: {"body": {"projects": []}}
            self.route("GET /api/v1/projects", lambda r, a: {"status": 302, "headers": {"Location": f"{other.url}/api/v1/projects"}})
            self.assertEqual(self.client.projects.list(), [])
            self.assertNotIn("authorization", other.requests[0]["headers"])
        finally:
            other.close()


if __name__ == "__main__":
    unittest.main()

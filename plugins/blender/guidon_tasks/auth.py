"""Browser login - the same loopback flow as the Unity plugin's
GuidonBrowserAuth.cs (and `gh auth login`): bind a short-lived HTTP
listener on 127.0.0.1, open /auth/plugin-login on the Guidon site with that
listener as redirect_uri, and receive the issued API key back once the user
clicks Authorize. The add-on never sees a password.

No bpy import: login() blocks (up to TIMEOUT_SECONDS) and is meant to run
on a worker thread - see jobs.py.
"""

import html
import http.server
import time
import urllib.parse
import uuid
import webbrowser

PORT_RANGE = range(51820, 51830)
TIMEOUT_SECONDS = 5 * 60


class _CallbackServer(http.server.HTTPServer):
    result = None  # dict of the callback's query params once received


class _CallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/callback":
            self.send_response(404)
            self.end_headers()
            return

        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        ok = bool(params.get("apiKey")) and params.get("state") == self.server.expected_state
        self.server.result = params if ok else {}

        title = "Logged in" if ok else "Login failed"
        message = (
            "You're logged in - you can close this tab and return to Blender."
            if ok
            else "Something went wrong - return to Blender and try again."
        )
        body = (
            "<html><head><title>Guidon</title></head>"
            '<body style="font-family:sans-serif;text-align:center;padding-top:80px;">'
            "<h2>{}</h2><p>{}</p></body></html>".format(html.escape(title), html.escape(message))
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):  # keep Blender's console quiet
        pass


def _bind():
    for port in PORT_RANGE:
        try:
            return _CallbackServer(("127.0.0.1", port), _CallbackHandler), port
        except OSError:
            continue  # in use (e.g. another editor's Guidon login) - try the next one
    return None, None


def login(base_url, cancel_event=None):
    """Returns (True, {"apiKey", "email"}) or (False, error message)."""
    base_url = (base_url or "").rstrip("/")
    if not base_url:
        return False, "Set a base URL first."

    server, port = _bind()
    if server is None:
        return False, (
            "Could not open a local port for browser login (tried {}-{}). "
            "Close any other Guidon login attempt and try again.".format(PORT_RANGE[0], PORT_RANGE[-1])
        )

    try:
        state = uuid.uuid4().hex
        server.expected_state = state
        server.timeout = 0.5  # handle_request() returns at least this often so cancel/timeout are noticed

        redirect_uri = "http://127.0.0.1:{}/callback".format(port)
        url = "{}/auth/plugin-login?{}".format(
            base_url,
            urllib.parse.urlencode({"redirect_uri": redirect_uri, "state": state, "client": "blender"}),
        )
        if not webbrowser.open(url):
            return False, "Could not open a browser. Open this URL manually: " + url

        deadline = time.monotonic() + TIMEOUT_SECONDS
        while server.result is None:
            if cancel_event is not None and cancel_event.is_set():
                return False, "Login cancelled."
            if time.monotonic() > deadline:
                return False, "Login timed out - no response from the browser within 5 minutes."
            server.handle_request()

        if not server.result:
            return False, "Login was not completed, or the response could not be verified."
        return True, {"apiKey": server.result["apiKey"], "email": server.result.get("email", "")}
    finally:
        server.server_close()

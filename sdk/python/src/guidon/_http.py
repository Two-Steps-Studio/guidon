"""Transport: auth, JSON, errors and retries over urllib (standard library only)."""

from __future__ import annotations

import email.utils
import json
import os
import random
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any, Dict, Iterable, Mapping, Optional, Tuple, Union

from ._version import __version__
from .errors import GuidonError, code_for_status

DEFAULT_BASE_URL = "https://useguidon.com"
_API_PREFIX = "/api/v1"
_RETRYABLE_STATUS = {429, 502, 503, 504}

FileTuple = Tuple[str, Union[bytes, str], Optional[str]]


def normalize_base_url(raw: str) -> str:
    """``https://host`` or ``https://host/api/v1/`` -> ``https://host/api/v1``."""
    parsed = urllib.parse.urlsplit(raw.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise GuidonError(f"Guidon base URL must be an http(s) URL: {raw}", code="invalid_base_url")
    path = parsed.path.rstrip("/")
    if not path.endswith(_API_PREFIX):
        path += _API_PREFIX
    return f"{parsed.scheme}://{parsed.netloc}{path}"


def _parse_retry_after(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    try:
        seconds = float(value)
        return seconds if seconds >= 0 else None
    except ValueError:
        pass
    try:
        when = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    return max(0.0, when.timestamp() - time.time())


def encode_multipart(fields: Mapping[str, str], files: Iterable[FileTuple]) -> Tuple[bytes, str]:
    boundary = f"----guidon{uuid.uuid4().hex}"
    out = bytearray()
    for name, value in fields.items():
        out += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n".encode()
        out += value.encode("utf-8") + b"\r\n"
    for filename, data, content_type in files:
        safe = filename.replace('"', "%22").replace("\r", "").replace("\n", "")
        out += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{safe}\"\r\n"
            f"Content-Type: {content_type or 'application/octet-stream'}\r\n\r\n"
        ).encode()
        out += (data.encode("utf-8") if isinstance(data, str) else bytes(data)) + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Follows redirects but never forwards the API key to another host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new is not None:
            old_host = urllib.parse.urlsplit(req.full_url)
            new_host = urllib.parse.urlsplit(new.full_url)
            if (old_host.scheme, old_host.netloc) != (new_host.scheme, new_host.netloc):
                for name in list(new.headers):
                    if name.lower() == "authorization":
                        del new.headers[name]
                new.unredirected_hdrs.pop("Authorization", None)
        return new


class _Multipart:
    def __init__(self, fields: Mapping[str, str], files: Iterable[FileTuple]) -> None:
        self.fields = dict(fields)
        self.files = list(files)


class HttpClient:
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
        api_key = api_key or os.environ.get("GUIDON_API_KEY")
        if not api_key:
            raise GuidonError(
                "No Guidon API key. Pass api_key=... or set GUIDON_API_KEY (create one in Profile -> API keys).",
                code="missing_api_key",
            )
        self._api_key = api_key
        self.base_url = normalize_base_url(base_url or os.environ.get("GUIDON_BASE_URL") or DEFAULT_BASE_URL)
        self.timeout = timeout
        self.max_retries = max(0, max_retries)
        self._opener = opener or urllib.request.build_opener(_SafeRedirectHandler())
        ua = f"guidon-sdk-python/{__version__}"
        self._headers: Dict[str, str] = {"User-Agent": f"{ua} {user_agent}" if user_agent else ua}
        self._headers.update(headers or {})

    def url(self, path: str, query: Optional[Mapping[str, Any]] = None) -> str:
        url = self.base_url + path
        params = {k: ("true" if v is True else "false" if v is False else str(v)) for k, v in (query or {}).items() if v is not None}
        if params:
            url += "?" + urllib.parse.urlencode(params)
        return url

    def request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[Mapping[str, Any]] = None,
        json_body: Any = None,
        multipart: Optional[_Multipart] = None,
        idempotency_key: Optional[str] = None,
        headers: Optional[Mapping[str, str]] = None,
        timeout: Optional[float] = None,
        response_type: str = "json",
    ) -> Any:
        method = method.upper()
        url = self.url(path, query)
        all_headers = {
            "Accept": "text/markdown, text/plain, application/json" if response_type == "text" else "application/json",
            **self._headers,
            **(headers or {}),
            "Authorization": f"Bearer {self._api_key}",
        }
        data: Optional[bytes] = None
        if multipart is not None:
            data, content_type = encode_multipart(multipart.fields, multipart.files)
            all_headers["Content-Type"] = content_type
        elif json_body is not None:
            data = json.dumps(json_body).encode("utf-8")
            all_headers["Content-Type"] = "application/json"
        if idempotency_key:
            all_headers["Idempotency-Key"] = idempotency_key

        retryable = method == "GET" or bool(idempotency_key)
        attempts = self.max_retries + 1 if retryable else 1
        effective_timeout = self.timeout if timeout is None else timeout

        attempt = 0
        while True:
            attempt += 1
            req = urllib.request.Request(url, data=data, method=method, headers=all_headers)
            try:
                with self._opener.open(req, timeout=effective_timeout) as resp:
                    raw = resp.read()
                    status = resp.status
                    content_type = resp.headers.get("Content-Type")
            except urllib.error.HTTPError as http_error:
                error = self._error_from_response(http_error, method, url)
                # 409 idempotency_in_progress: the first request with this key is still running.
                in_progress = error.status == 409 and error.code == "idempotency_in_progress"
                if attempt < attempts and (error.status in _RETRYABLE_STATUS or in_progress):
                    wait = error.retry_after if error.retry_after is not None else self._backoff(attempt)
                    time.sleep(min(wait, 60.0))
                    continue
                raise error from None
            except (socket.timeout, TimeoutError) as exc:
                error = GuidonError(
                    f"Request timed out after {effective_timeout} s.", code="timeout", method=method, url=url
                )
                if attempt < attempts:
                    time.sleep(self._backoff(attempt))
                    continue
                raise error from exc
            except urllib.error.URLError as exc:
                reason = exc.reason
                if isinstance(reason, (socket.timeout, TimeoutError)):
                    error = GuidonError(
                        f"Request timed out after {effective_timeout} s.", code="timeout", method=method, url=url
                    )
                else:
                    error = GuidonError(
                        f"Could not reach Guidon at {self.base_url}: {reason}",
                        code="network_error",
                        method=method,
                        url=url,
                    )
                if attempt < attempts:
                    time.sleep(self._backoff(attempt))
                    continue
                raise error from exc

            text = raw.decode("utf-8", errors="replace")
            if response_type == "text":
                return text
            if not text:
                return None
            try:
                return json.loads(text)
            except ValueError:
                raise GuidonError(
                    f"Expected JSON from {method} {url}, got {content_type or 'an unknown content type'}.",
                    status=status,
                    code="invalid_response",
                    body=text[:2000],
                    method=method,
                    url=url,
                ) from None

    @staticmethod
    def _backoff(attempt: int) -> float:
        base = min(8.0, 0.5 * 2 ** (attempt - 1))
        return base / 2 + random.random() * base / 2

    @staticmethod
    def _error_from_response(resp: urllib.error.HTTPError, method: str, url: str) -> GuidonError:
        try:
            text = resp.read().decode("utf-8", errors="replace")
        except Exception:  # pragma: no cover - broken connection while reading the error
            text = ""
        body: Any = None
        if text:
            try:
                body = json.loads(text)
            except ValueError:
                body = text
        message: Optional[str] = None
        code: Optional[str] = None
        hint: Optional[str] = None
        docs: Optional[str] = None
        if isinstance(body, dict):
            err = body.get("error")
            if isinstance(err, str):
                message = err
            elif isinstance(err, dict) and isinstance(err.get("message"), str):
                message = err["message"]
            elif isinstance(body.get("message"), str):
                message = body["message"]
            if isinstance(body.get("code"), str) and body["code"]:
                code = body["code"]
            if isinstance(body.get("hint"), str) and body["hint"]:
                hint = body["hint"]
            if isinstance(body.get("docs"), str) and body["docs"]:
                docs = body["docs"]
        status = resp.code
        headers = resp.headers
        return GuidonError(
            message or f"HTTP {status} {resp.reason or ''}".strip(),
            status=status,
            code=code or code_for_status(status),
            body=body,
            hint=hint,
            docs=docs,
            retry_after=_parse_retry_after(headers.get("Retry-After") if headers else None),
            request_id=(headers.get("X-Request-Id") or headers.get("X-Vercel-Id")) if headers else None,
            method=method,
            url=url,
        )

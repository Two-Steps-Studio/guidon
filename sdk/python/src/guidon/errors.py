"""The single exception type the SDK raises."""

from __future__ import annotations

from typing import Any, Optional

# The same table the server uses for the codes it adds to its errors.
_STATUS_CODES = {
    400: "invalid_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    411: "length_required",
    413: "payload_too_large",
    415: "unsupported_media_type",
    422: "unprocessable",
    429: "rate_limited",
    500: "internal_error",
    503: "unavailable",
}


def code_for_status(status: int) -> str:
    """Default ``code`` for an HTTP status when the error body doesn't carry one."""
    if status in _STATUS_CODES:
        return _STATUS_CODES[status]
    return "internal_error" if status >= 500 else "invalid_request"


class GuidonError(Exception):
    """An API error (``status`` >= 400) or a transport failure (``status`` 0).

    ``code`` is the server's machine-readable code when it sends one, otherwise
    derived from the status (``not_found``, ``rate_limited``...), or one of
    ``network_error``, ``timeout``, ``invalid_response``, ``missing_api_key``,
    ``invalid_base_url`` for failures that never got a usable response.
    """

    def __init__(
        self,
        message: str,
        *,
        status: int = 0,
        code: str = "invalid_request",
        body: Any = None,
        hint: Optional[str] = None,
        docs: Optional[str] = None,
        retry_after: Optional[float] = None,
        request_id: Optional[str] = None,
        method: Optional[str] = None,
        url: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.body = body
        #: The server's "what to do now" for this error, if it sent one.
        self.hint = hint
        #: Link to the API docs the server sent with the error, if any.
        self.docs = docs
        self.retry_after = retry_after
        self.request_id = request_id
        self.method = method
        self.url = url

    def __str__(self) -> str:
        if self.status:
            return f"{self.message} (HTTP {self.status}, {self.code})"
        return f"{self.message} ({self.code})"

    def __repr__(self) -> str:
        return f"GuidonError(status={self.status!r}, code={self.code!r}, message={self.message!r})"

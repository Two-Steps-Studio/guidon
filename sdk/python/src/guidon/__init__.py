"""Official Python SDK for the Guidon REST API (https://useguidon.com)."""

from ._http import DEFAULT_BASE_URL, normalize_base_url
from ._version import __version__
from .client import (
    UNSET,
    AttemptsResource,
    CommentsResource,
    Guidon,
    ProjectCollection,
    ProjectsResource,
    ReportsResource,
    SubtasksResource,
    TasksResource,
)
from .errors import GuidonError, code_for_status

__all__ = [
    "Guidon",
    "GuidonError",
    "code_for_status",
    "normalize_base_url",
    "DEFAULT_BASE_URL",
    "UNSET",
    "ProjectsResource",
    "TasksResource",
    "SubtasksResource",
    "CommentsResource",
    "AttemptsResource",
    "ReportsResource",
    "ProjectCollection",
    "__version__",
]

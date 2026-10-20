using System;
using System.Linq;
using System.Text.RegularExpressions;

namespace Guidon.Tasks.Editor
{
    // Field names deliberately match the Guidon API's JSON verbatim
    // (snake_case, not idiomatic C#) - Unity's built-in JsonUtility has no
    // rename/casing attribute, and pulling in Newtonsoft.Json as a
    // dependency isn't worth it for a v1 viewer. Every response below is a
    // JSON *object* wrapping the payload (never a bare top-level array),
    // which happens to be exactly what JsonUtility requires - confirmed by
    // reading src/app/api/v1/**/route.ts directly, not assumed.

    [Serializable]
    public class ProjectDto
    {
        public string id;
        public string name;
        public string organization_id;
    }

    [Serializable]
    internal class ProjectsResponse
    {
        public ProjectDto[] projects;
    }

    /// <summary>A moodboard image (GET /api/v1/projects/{id}/references). image_url is signed and short-lived - download it right away.</summary>
    [Serializable]
    public class ReferenceDto
    {
        public string id;
        public string name;
        public string caption;
        public string[] tags;
        public string source_url;
        public string mime_type;
        public string created_at;
        public string image_url;
    }

    [Serializable]
    internal class ReferencesResponse
    {
        public ReferenceDto[] references;
    }

    [Serializable]
    public class TaskDto
    {
        public string id;
        public string project_id;
        public string title;
        public string description;
        // Any key the project defines (migration 060), not just the
        // built-ins - never coerce an unknown one to a default.
        public string status;
        public string priority;
        /// <summary>Whether the task's column counts as finished. Missing (false) on older servers - use GuidonVocabulary.IsDone, not this field alone.</summary>
        public bool is_done;
        public string[] tags;
        public string due_date;
        public int progress_percent;
        // float, not int: the web app's own sortOrderForPosition
        // (task-board.ts) does midpoint insertion ((before+after)/2), so
        // real rows routinely have fractional values - an int field here
        // would risk a hard parse failure on real data. Also not nullable
        // (JsonUtility can't deserialize Nullable<T>) - a JSON `null`
        // leaves this at its default (0f), which only affects relative
        // ordering among cards, never which column a task is in.
        public float sort_order;
        public string parent_task_id;
        public string created_at;
        public string updated_at;
    }

    [Serializable]
    internal class TasksResponse
    {
        public TaskDto[] tasks;
    }

    [Serializable]
    internal class TaskResponse
    {
        public TaskDto task;
    }

    [Serializable]
    public class CommentDto
    {
        public string id;
        public string task_id;
        public string author_id;
        public string content;
        public string created_at;
        public string actor_label;
    }

    [Serializable]
    internal class CommentsResponse
    {
        public CommentDto[] comments;
    }

    [Serializable]
    internal class CommentResponse
    {
        public CommentDto comment;
    }

    /// <summary>
    /// One board column (GET /api/v1/projects/{id}/columns). Older servers
    /// send only status/label - JsonUtility leaves the rest at false/null,
    /// which is why "done" is decided by GuidonVocabulary.IsDoneStatus
    /// (is_done OR status == "done"), never by is_done alone.
    /// </summary>
    [Serializable]
    public class ColumnDto
    {
        public string status;
        public string label;
        public bool is_done;
        public bool custom;
        /// <summary>Hex colour, or null/empty for the built-in accent.</summary>
        public string color;
    }

    [Serializable]
    internal class ColumnsResponse
    {
        public ColumnDto[] columns;
    }

    /// <summary>One task priority (GET /api/v1/projects/{id}/priorities), most important first. 404 on older servers - then the four built-ins.</summary>
    [Serializable]
    public class PriorityDto
    {
        public string key;
        public string label;
        /// <summary>Hex colour, or null/empty for the built-in colour of that key (grey for a custom one).</summary>
        public string color;
        public bool custom;
    }

    [Serializable]
    internal class PrioritiesResponse
    {
        public PriorityDto[] priorities;
    }

    /// <summary>POST /api/v1/projects/{id}/report-keys - a reports:write key bound to the project, shown once.</summary>
    [Serializable]
    internal class ReportKeyResponse
    {
        public string key;
        public string keyPrefix;
        public string projectId;
    }

    [Serializable]
    internal class ReportKeyBody
    {
        public string client;
    }

    [Serializable]
    internal class ErrorResponse
    {
        public string error;
    }

    /// <summary>Shape of the query params GuidonBrowserAuth's local listener receives back from /auth/plugin-login.</summary>
    [Serializable]
    internal class LoginResponse
    {
        public string apiKey;
        public string email;
    }

    [Serializable]
    internal class StatusPatchBody
    {
        public string status;
    }

    [Serializable]
    internal class CommentPostBody
    {
        public string content;
    }

    /// <summary>
    /// Body for POST /api/v1/projects/{id}/tasks. Every field below is
    /// always serialized by JsonUtility (it has no concept of "omit this
    /// field") - the server treats an empty string the same as "not
    /// provided" for all of these except title, which it requires
    /// non-empty (see that route's own validation).
    /// </summary>
    [Serializable]
    internal class CreateTaskBody
    {
        public string title;
        public string description;
        public string priority;
        public string due_date;
        public string parent_task_id;
        /// <summary>Ignored server-side for a subtask (always forced to "todo") - only meaningful for a top-level task.</summary>
        public string status;
    }

    /// <summary>
    /// Body for PATCH /api/v1/tasks/{id} from the "Save" button in
    /// GuidonTaskDetailWindow - always sends all four fields together
    /// (matching how the web task dialog itself always patches its whole
    /// form, not just the fields the user actually touched). Kept as a
    /// separate type from UpdateSortOrderBody below specifically so each
    /// only serializes the fields relevant to its own call site -
    /// JsonUtility has no way to selectively omit fields from one shared
    /// class, so "which fields did the server receive" is controlled by
    /// which DTO type gets used, not by leaving fields blank.
    /// </summary>
    [Serializable]
    internal class UpdateTaskFieldsBody
    {
        public string title;
        public string description;
        public string priority;
        public string due_date;
    }

    /// <summary>Body for the drag-and-drop reorder commit - see UpdateTaskFieldsBody's doc comment for why this is a separate type.</summary>
    [Serializable]
    internal class UpdateSortOrderBody
    {
        public float sort_order;
    }

    /// <summary>
    /// Guidon's task vocabulary. The built-in statuses/priorities are
    /// mirrored by hand from src/lib/work/task-board.ts (BOARD_COLUMNS /
    /// TASK_PRIORITIES) and are only the fallback: a project can relabel,
    /// reorder and hide them and add its own (migration 060), which the
    /// board loads from /columns and /priorities into CurrentColumns /
    /// CurrentPriorities. Any key matching ^[a-z][a-z0-9_]{0,39}$ is a
    /// legitimate status/priority - unknown ones are shown as-is (label =
    /// key, grey), never coerced to a built-in or dropped.
    /// </summary>
    internal static class GuidonVocabulary
    {
        public static readonly string[] Statuses =
        {
            "backlog", "todo", "in_progress", "ai_working", "review", "done"
        };

        public static readonly string[] StatusLabels =
        {
            "Backlog", "Todo", "In Progress", "AI Working", "Review", "Done"
        };

        /// <summary>Built-in priorities, most important first (PRIORITY_RANK in task-board.ts).</summary>
        public static readonly string[] Priorities = { "critical", "high", "medium", "low" };

        public static readonly string[] PriorityLabels = { "Critical", "High", "Medium", "Low" };

        private static readonly Regex KeyPattern = new Regex("^[a-z][a-z0-9_]{0,39}$");

        /// <summary>The server's rule for a status/priority key (WORKFLOW_KEY_RE).</summary>
        public static bool IsValidKey(string key) => !string.IsNullOrEmpty(key) && KeyPattern.IsMatch(key);

        public static string StatusLabel(string status)
        {
            int index = Array.IndexOf(Statuses, status);
            return index >= 0 ? StatusLabels[index] : status;
        }

        /// <summary>What the board shows when the server can't say (an older Guidon without the columns endpoint).</summary>
        public static ColumnDto[] DefaultColumns() =>
            Statuses.Select(s => new ColumnDto { status = s, label = StatusLabel(s), is_done = s == "done" }).ToArray();

        /// <summary>
        /// The selected project's visible columns in board order (its
        /// label/order/hidden overrides and custom columns from the
        /// server). Set by GuidonTasksWindow after each load; read by the
        /// detail window's status dropdown so a task can't be moved into a
        /// hidden column.
        /// </summary>
        public static ColumnDto[] CurrentColumns = DefaultColumns();

        public static string ColumnLabel(string status) =>
            CurrentColumns.FirstOrDefault(c => c.status == status)?.label ?? StatusLabel(status);

        /// <summary>
        /// Whether a status is a finished one: "done" always is; any other
        /// column is when the server marked it is_done. Older servers never
        /// send is_done, so there "done" is the only done column.
        /// </summary>
        public static bool IsDoneStatus(string status)
        {
            if (status == "done") return true;
            ColumnDto column = CurrentColumns.FirstOrDefault(c => c.status == status);
            return column != null && column.is_done;
        }

        /// <summary>A task counts as finished when the server says so (is_done) or its column is a done column.</summary>
        public static bool IsDone(TaskDto task) => task != null && (task.is_done || IsDoneStatus(task.status));

        public static string BuiltInPriorityLabel(string priority)
        {
            int index = Array.IndexOf(Priorities, priority);
            return index >= 0 ? PriorityLabels[index] : priority;
        }

        /// <summary>The four built-ins - what an older server (no /priorities endpoint, 404) or a failed load falls back to.</summary>
        public static PriorityDto[] DefaultPriorities() =>
            Priorities.Select(p => new PriorityDto { key = p, label = BuiltInPriorityLabel(p) }).ToArray();

        /// <summary>
        /// The selected project's visible priorities, most important first
        /// (list index = rank). Set by GuidonTasksWindow after each load; read
        /// by the detail window's priority dropdown and by the card styling.
        /// </summary>
        public static PriorityDto[] CurrentPriorities = DefaultPriorities();

        public static PriorityDto FindPriority(string priority) =>
            CurrentPriorities.FirstOrDefault(p => p.key == priority);

        /// <summary>The project's label for a priority; a hidden/unknown key falls back to the built-in label, else the key itself.</summary>
        public static string PriorityLabel(string priority)
        {
            if (string.IsNullOrEmpty(priority)) return string.Empty;
            PriorityDto found = FindPriority(priority);
            return found != null && !string.IsNullOrEmpty(found.label) ? found.label : BuiltInPriorityLabel(priority);
        }

        /// <summary>Importance rank (0 = most important); a key the project doesn't list sorts after every listed one.</summary>
        public static int PriorityRank(string priority)
        {
            int index = Array.FindIndex(CurrentPriorities, p => p.key == priority);
            return index >= 0 ? index : CurrentPriorities.Length;
        }
    }
}

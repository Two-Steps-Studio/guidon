using System;

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

    [Serializable]
    public class TaskDto
    {
        public string id;
        public string project_id;
        public string title;
        public string description;
        public string status;
        public string priority;
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
    /// Guidon's task vocabulary, mirrored by hand from
    /// src/lib/work/task-board.ts (BOARD_COLUMNS / TASK_PRIORITIES). There
    /// is no shared-schema codegen between this plugin and the Next.js app,
    /// so this is a manual-sync point if the web app's statuses ever
    /// change - same spirit as normalizeTaskStatus's own comment there
    /// about legacy statuses.
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

        public static readonly string[] Priorities = { "low", "medium", "high", "critical" };

        public static string StatusLabel(string status)
        {
            int index = Array.IndexOf(Statuses, status);
            return index >= 0 ? StatusLabels[index] : status;
        }
    }
}

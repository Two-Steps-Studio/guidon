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

using System;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace Guidon.Tasks.Editor
{
    /// <summary>
    /// Lets Editor code `await request.SendWebRequest()` directly.
    /// UnityWebRequestAsyncOperation doesn't implement GetAwaiter() out of
    /// the box on the Unity versions this plugin targets - this is the
    /// standard, widely-documented extension that adds it.
    /// </summary>
    internal static class UnityWebRequestAwaiterExtensions
    {
        public static UnityWebRequestAwaiter GetAwaiter(this UnityWebRequestAsyncOperation op) =>
            new UnityWebRequestAwaiter(op);
    }

    internal readonly struct UnityWebRequestAwaiter : INotifyCompletion
    {
        private readonly UnityWebRequestAsyncOperation _op;

        public UnityWebRequestAwaiter(UnityWebRequestAsyncOperation op) => _op = op;

        public bool IsCompleted => _op.isDone;

        public void OnCompleted(Action continuation) => _op.completed += _ => continuation();

        public UnityWebRequest GetResult() => _op.webRequest;
    }

    /// <summary>Every call site gets this back instead of a thrown exception - see SendAsync's own comment.</summary>
    internal readonly struct GuidonResult<T>
    {
        public readonly bool Ok;
        public readonly T Value;
        public readonly string Error;

        private GuidonResult(bool ok, T value, string error)
        {
            Ok = ok;
            Value = value;
            Error = error;
        }

        public static GuidonResult<T> Success(T value) => new GuidonResult<T>(true, value, default);
        public static GuidonResult<T> Failure(string error) => new GuidonResult<T>(false, default, error);
    }

    /// <summary>
    /// Thin wrapper over Guidon's /api/v1 for the six calls this plugin
    /// needs. UnityWebRequest + JsonUtility rather than HttpClient/
    /// Newtonsoft - both ship with Unity, zero extra package dependency,
    /// the idiomatic choice for Editor tooling.
    /// </summary>
    internal static class GuidonApiClient
    {
        /// <summary>
        /// Never throws - GuidonTasksWindow's OnGUI loop drives these calls
        /// fire-and-forget (`_ = SomeCall();`), so an unhandled exception
        /// here would surface nowhere useful. Every failure mode (network
        /// error, non-2xx response, malformed JSON) comes back as
        /// GuidonResult.Failure instead.
        /// </summary>
        private static async Task<GuidonResult<string>> SendAsync(string method, string path, string jsonBody = null)
        {
            if (!GuidonSettings.IsConfigured)
                return GuidonResult<string>.Failure("Log in from the Settings foldout first.");

            string url = GuidonSettings.BaseUrl.TrimEnd('/') + path;

            using (var request = new UnityWebRequest(url, method))
            {
                if (jsonBody != null)
                {
                    request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(jsonBody));
                    request.SetRequestHeader("Content-Type", "application/json");
                }

                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Authorization", "Bearer " + GuidonSettings.ApiKey);

                try
                {
                    await request.SendWebRequest();
                }
                catch (Exception e)
                {
                    return GuidonResult<string>.Failure("Request failed: " + e.Message);
                }

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string body = request.downloadHandler?.text;
                    string message = ExtractServerError(body) ?? request.error;
                    return GuidonResult<string>.Failure($"{(int)request.responseCode} {message}".Trim());
                }

                return GuidonResult<string>.Success(request.downloadHandler.text);
            }
        }

        private static string ExtractServerError(string body)
        {
            if (string.IsNullOrEmpty(body)) return null;
            try
            {
                return JsonUtility.FromJson<ErrorResponse>(body)?.error;
            }
            catch
            {
                return null;
            }
        }

        private static GuidonResult<TResponse> ParseResponse<TResponse>(string json, string context)
            where TResponse : class
        {
            try
            {
                var parsed = JsonUtility.FromJson<TResponse>(json);
                return parsed != null
                    ? GuidonResult<TResponse>.Success(parsed)
                    : GuidonResult<TResponse>.Failure($"Empty response reading {context}.");
            }
            catch (Exception e)
            {
                return GuidonResult<TResponse>.Failure($"Failed to parse {context}: {e.Message}");
            }
        }

        public static async Task<GuidonResult<ProjectDto[]>> ListProjects()
        {
            var raw = await SendAsync("GET", "/api/v1/projects");
            if (!raw.Ok) return GuidonResult<ProjectDto[]>.Failure(raw.Error);

            var parsed = ParseResponse<ProjectsResponse>(raw.Value, "projects");
            return parsed.Ok
                ? GuidonResult<ProjectDto[]>.Success(parsed.Value.projects ?? Array.Empty<ProjectDto>())
                : GuidonResult<ProjectDto[]>.Failure(parsed.Error);
        }

        public static async Task<GuidonResult<TaskDto[]>> ListTasks(string projectId)
        {
            var raw = await SendAsync("GET", $"/api/v1/projects/{projectId}/tasks");
            if (!raw.Ok) return GuidonResult<TaskDto[]>.Failure(raw.Error);

            var parsed = ParseResponse<TasksResponse>(raw.Value, "tasks");
            return parsed.Ok
                ? GuidonResult<TaskDto[]>.Success(parsed.Value.tasks ?? Array.Empty<TaskDto>())
                : GuidonResult<TaskDto[]>.Failure(parsed.Error);
        }

        /// <summary>
        /// The project's visible columns in board order. Unknown statuses and
        /// duplicates are dropped; an empty answer means the defaults.
        /// </summary>
        public static async Task<GuidonResult<ColumnDto[]>> ListColumns(string projectId)
        {
            var raw = await SendAsync("GET", $"/api/v1/projects/{projectId}/columns");
            if (!raw.Ok) return GuidonResult<ColumnDto[]>.Failure(raw.Error);

            var parsed = ParseResponse<ColumnsResponse>(raw.Value, "columns");
            if (!parsed.Ok) return GuidonResult<ColumnDto[]>.Failure(parsed.Error);

            var columns = (parsed.Value.columns ?? Array.Empty<ColumnDto>())
                .Where(c => c != null && Array.IndexOf(GuidonVocabulary.Statuses, c.status) >= 0)
                .GroupBy(c => c.status)
                .Select(g => new ColumnDto
                {
                    status = g.Key,
                    label = string.IsNullOrEmpty(g.First().label) ? GuidonVocabulary.StatusLabel(g.Key) : g.First().label,
                })
                .ToArray();
            return GuidonResult<ColumnDto[]>.Success(columns.Length > 0 ? columns : GuidonVocabulary.DefaultColumns());
        }

        public static async Task<GuidonResult<TaskDto>> SetTaskStatus(string taskId, string status)
        {
            string body = JsonUtility.ToJson(new StatusPatchBody { status = status });
            var raw = await SendAsync("PATCH", $"/api/v1/tasks/{taskId}/status", body);
            if (!raw.Ok) return GuidonResult<TaskDto>.Failure(raw.Error);

            var parsed = ParseResponse<TaskResponse>(raw.Value, "task");
            return parsed.Ok
                ? GuidonResult<TaskDto>.Success(parsed.Value.task)
                : GuidonResult<TaskDto>.Failure(parsed.Error);
        }

        public static async Task<GuidonResult<CommentDto[]>> ListComments(string taskId)
        {
            var raw = await SendAsync("GET", $"/api/v1/tasks/{taskId}/comment");
            if (!raw.Ok) return GuidonResult<CommentDto[]>.Failure(raw.Error);

            var parsed = ParseResponse<CommentsResponse>(raw.Value, "comments");
            return parsed.Ok
                ? GuidonResult<CommentDto[]>.Success(parsed.Value.comments ?? Array.Empty<CommentDto>())
                : GuidonResult<CommentDto[]>.Failure(parsed.Error);
        }

        public static async Task<GuidonResult<CommentDto>> AddComment(string taskId, string content)
        {
            string body = JsonUtility.ToJson(new CommentPostBody { content = content });
            var raw = await SendAsync("POST", $"/api/v1/tasks/{taskId}/comment", body);
            if (!raw.Ok) return GuidonResult<CommentDto>.Failure(raw.Error);

            var parsed = ParseResponse<CommentResponse>(raw.Value, "comment");
            return parsed.Ok
                ? GuidonResult<CommentDto>.Success(parsed.Value.comment)
                : GuidonResult<CommentDto>.Failure(parsed.Error);
        }

        /// <param name="parentTaskId">Null/empty creates a top-level task; a real task id creates a subtask of it.</param>
        /// <param name="status">Only meaningful for a top-level task - which column it's created into (defaults server-side to "backlog"). Ignored for a subtask.</param>
        public static async Task<GuidonResult<TaskDto>> CreateTask(
            string projectId, string title, string description, string priority, string dueDateIso,
            string parentTaskId = null, string status = null)
        {
            string body = JsonUtility.ToJson(new CreateTaskBody
            {
                title = title,
                description = description ?? string.Empty,
                priority = priority ?? string.Empty,
                due_date = dueDateIso ?? string.Empty,
                parent_task_id = parentTaskId ?? string.Empty,
                status = status ?? string.Empty,
            });

            var raw = await SendAsync("POST", $"/api/v1/projects/{projectId}/tasks", body);
            if (!raw.Ok) return GuidonResult<TaskDto>.Failure(raw.Error);

            var parsed = ParseResponse<TaskResponse>(raw.Value, "task");
            return parsed.Ok
                ? GuidonResult<TaskDto>.Success(parsed.Value.task)
                : GuidonResult<TaskDto>.Failure(parsed.Error);
        }

        public static async Task<GuidonResult<TaskDto>> UpdateTaskFields(
            string taskId, string title, string description, string priority, string dueDateIso)
        {
            string body = JsonUtility.ToJson(new UpdateTaskFieldsBody
            {
                title = title,
                description = description ?? string.Empty,
                priority = priority,
                due_date = dueDateIso ?? string.Empty,
            });

            var raw = await SendAsync("PATCH", $"/api/v1/tasks/{taskId}", body);
            if (!raw.Ok) return GuidonResult<TaskDto>.Failure(raw.Error);

            var parsed = ParseResponse<TaskResponse>(raw.Value, "task");
            return parsed.Ok
                ? GuidonResult<TaskDto>.Success(parsed.Value.task)
                : GuidonResult<TaskDto>.Failure(parsed.Error);
        }

        /// <summary>Commits a drag-and-drop reorder - only sort_order, nothing else on the task changes.</summary>
        public static async Task<GuidonResult<TaskDto>> UpdateSortOrder(string taskId, float sortOrder)
        {
            string body = JsonUtility.ToJson(new UpdateSortOrderBody { sort_order = sortOrder });
            var raw = await SendAsync("PATCH", $"/api/v1/tasks/{taskId}", body);
            if (!raw.Ok) return GuidonResult<TaskDto>.Failure(raw.Error);

            var parsed = ParseResponse<TaskResponse>(raw.Value, "task");
            return parsed.Ok
                ? GuidonResult<TaskDto>.Success(parsed.Value.task)
                : GuidonResult<TaskDto>.Failure(parsed.Error);
        }

        public static async Task<GuidonResult<bool>> DeleteTask(string taskId)
        {
            var raw = await SendAsync("DELETE", $"/api/v1/tasks/{taskId}");
            return raw.Ok ? GuidonResult<bool>.Success(true) : GuidonResult<bool>.Failure(raw.Error);
        }
    }
}

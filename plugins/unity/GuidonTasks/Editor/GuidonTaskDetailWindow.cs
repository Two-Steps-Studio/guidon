using System;
using System.Linq;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;

namespace Guidon.Tasks.Editor
{
    /// <summary>
    /// Floating detail/edit window for one task - opened by clicking a
    /// card on the board, or via a column's "+" button (new-task mode). A
    /// separate EditorWindow rather than a panel embedded in the main
    /// board window, mirroring the web app's own board-plus-modal-dialog
    /// split and keeping the main window free to just be the board.
    ///
    /// Talks back to GuidonTasksWindow through these two static events
    /// rather than a direct reference - simpler than plumbing a callback
    /// through every Open* factory method, and there is only ever one
    /// board window in practice.
    /// </summary>
    public class GuidonTaskDetailWindow : EditorWindow
    {
        public static event Action<TaskDto> TaskUpserted;
        public static event Action<string> TaskRemoved;

        private string _projectId;
        private TaskDto _task; // null while creating a brand-new top-level task
        private string _newTaskStatus; // target column, "new task" mode only

        private string _titleField;
        private string _descriptionField;
        private int _priorityIndex;
        private string _dueDateField; // yyyy-MM-dd, or empty for "no due date"
        private bool _previewingDescription;

        private TaskDto[] _subtasks = Array.Empty<TaskDto>();
        private string _newSubtaskTitle = string.Empty;
        private bool _addingSubtask;
        private string _subtaskBusyId; // the one subtask currently being toggled/deleted, if any

        private CommentDto[] _comments = Array.Empty<CommentDto>();
        private bool _loadingComments = true;
        private string _newCommentDraft = string.Empty;
        private bool _postingComment;

        private bool _saving;
        private bool _deleting;
        private string _statusMessage;

        private Vector2 _scroll;
        private static GUIStyle _richTextStyle;

        private static GUIStyle RichTextStyle
        {
            get
            {
                if (_richTextStyle == null)
                {
                    _richTextStyle = new GUIStyle(EditorStyles.label) { richText = true, wordWrap = true };
                }
                return _richTextStyle;
            }
        }

        public static void OpenForTask(string projectId, TaskDto task, TaskDto[] allProjectTasks)
        {
            var window = CreateInstance<GuidonTaskDetailWindow>();
            window._projectId = projectId;
            window._task = task;
            window._subtasks = allProjectTasks.Where(t => t.parent_task_id == task.id).ToArray();
            window._titleField = task.title;
            window._descriptionField = task.description ?? string.Empty;
            window._priorityIndex = Math.Max(0, Array.IndexOf(GuidonVocabulary.Priorities, task.priority));
            window._dueDateField = FormatDueDateForField(task.due_date);
            window.titleContent = new GUIContent(task.title);
            window.minSize = new Vector2(420, 480);
            window.ShowUtility();
            _ = window.RefreshComments();
        }

        public static void OpenForNewTask(string projectId, string status)
        {
            var window = CreateInstance<GuidonTaskDetailWindow>();
            window._projectId = projectId;
            window._newTaskStatus = status;
            window._titleField = string.Empty;
            window._descriptionField = string.Empty;
            window._priorityIndex = Math.Max(0, Array.IndexOf(GuidonVocabulary.Priorities, "medium"));
            window._dueDateField = string.Empty;
            window._loadingComments = false; // no comments section in new-task mode
            window.titleContent = new GUIContent("New Task");
            window.minSize = new Vector2(420, 260);
            window.ShowUtility();
        }

        private static string FormatDueDateForField(string isoDate)
        {
            if (string.IsNullOrEmpty(isoDate)) return string.Empty;
            return DateTime.TryParse(isoDate, out DateTime parsed) ? parsed.ToString("yyyy-MM-dd") : string.Empty;
        }

        /// <returns>ISO 8601 string, empty string for "no due date", or null if `input` couldn't be parsed (check `error`).</returns>
        private static string ParseDueDateToIso(string input, out string error)
        {
            error = null;
            if (string.IsNullOrWhiteSpace(input)) return string.Empty;

            if (DateTime.TryParse(input, out DateTime parsed)) return parsed.ToUniversalTime().ToString("o");

            error = $"Due date \"{input}\" isn't a valid date - use yyyy-MM-dd.";
            return null;
        }

        private void OnGUI()
        {
            _scroll = EditorGUILayout.BeginScrollView(_scroll);

            _titleField = EditorGUILayout.TextField("Title", _titleField);
            DrawDescriptionField();

            _priorityIndex = EditorGUILayout.Popup("Priority", _priorityIndex, GuidonVocabulary.Priorities);
            _dueDateField = EditorGUILayout.TextField("Due date (yyyy-MM-dd)", _dueDateField);

            if (_task != null) DrawStatusRow();

            EditorGUILayout.Space();
            DrawActionButtons();

            if (!string.IsNullOrEmpty(_statusMessage))
            {
                EditorGUILayout.HelpBox(_statusMessage, MessageType.Error);
            }

            if (_task != null)
            {
                EditorGUILayout.Space();
                DrawSubtasksSection();
                EditorGUILayout.Space();
                DrawCommentsSection();
            }

            EditorGUILayout.EndScrollView();
        }

        private void DrawDescriptionField()
        {
            EditorGUILayout.BeginHorizontal();
            EditorGUILayout.LabelField("Description");
            if (GUILayout.Button(_previewingDescription ? "Edit" : "Preview", GUILayout.Width(70)))
            {
                _previewingDescription = !_previewingDescription;
            }
            EditorGUILayout.EndHorizontal();

            if (_previewingDescription)
            {
                string content = string.IsNullOrEmpty(_descriptionField) ? "(no description)" : _descriptionField;
                EditorGUILayout.LabelField(GuidonMarkdown.ToRichText(content), RichTextStyle, GUILayout.MinHeight(60));
            }
            else
            {
                _descriptionField = EditorGUILayout.TextArea(_descriptionField, GUILayout.MinHeight(60));
            }
        }

        private void DrawStatusRow()
        {
            int statusIndex = Array.IndexOf(GuidonVocabulary.Statuses, _task.status);
            int newIndex = EditorGUILayout.Popup("Status", Math.Max(statusIndex, 0), GuidonVocabulary.StatusLabels);

            // Guarded by statusIndex >= 0 for the same reason the main
            // board's old status dropdown was - see GuidonTasksWindow's
            // history for the loop this prevents.
            if (statusIndex >= 0 && newIndex != statusIndex)
            {
                _ = ChangeStatus(GuidonVocabulary.Statuses[newIndex]);
            }
        }

        private async Task ChangeStatus(string newStatus)
        {
            _statusMessage = null;
            var result = await GuidonApiClient.SetTaskStatus(_task.id, newStatus);

            if (!result.Ok)
            {
                _statusMessage = result.Error;
            }
            else if (result.Value != null)
            {
                _task = result.Value;
                TaskUpserted?.Invoke(_task);
            }

            Repaint();
        }

        private void DrawActionButtons()
        {
            EditorGUILayout.BeginHorizontal();

            bool canSubmit = !_saving && !string.IsNullOrWhiteSpace(_titleField);
            EditorGUI.BeginDisabledGroup(!canSubmit);
            string submitLabel = _task == null ? (_saving ? "Creating..." : "Create") : (_saving ? "Saving..." : "Save");
            if (GUILayout.Button(submitLabel))
            {
                _ = Submit();
            }
            EditorGUI.EndDisabledGroup();

            if (_task != null)
            {
                EditorGUI.BeginDisabledGroup(_deleting);
                if (GUILayout.Button(_deleting ? "Deleting..." : "Delete"))
                {
                    _ = SubmitDelete();
                }
                EditorGUI.EndDisabledGroup();
            }

            if (GUILayout.Button("Close")) Close();

            EditorGUILayout.EndHorizontal();
        }

        private async Task Submit()
        {
            string priority = GuidonVocabulary.Priorities[_priorityIndex];
            string dueDateIso = ParseDueDateToIso(_dueDateField, out string dueDateError);
            if (dueDateError != null)
            {
                _statusMessage = dueDateError;
                Repaint();
                return;
            }

            _saving = true;
            _statusMessage = null;
            Repaint();

            GuidonResult<TaskDto> result = _task == null
                ? await GuidonApiClient.CreateTask(
                    _projectId, _titleField.Trim(), _descriptionField, priority, dueDateIso, status: _newTaskStatus)
                : await GuidonApiClient.UpdateTaskFields(_task.id, _titleField.Trim(), _descriptionField, priority, dueDateIso);

            _saving = false;

            if (!result.Ok || result.Value == null)
            {
                _statusMessage = result.Error;
                Repaint();
                return;
            }

            bool wasNew = _task == null;
            _task = result.Value;
            titleContent = new GUIContent(_task.title);
            TaskUpserted?.Invoke(_task);

            if (wasNew) Close();
            else Repaint();
        }

        private async Task SubmitDelete()
        {
            _deleting = true;
            _statusMessage = null;
            Repaint();

            var result = await GuidonApiClient.DeleteTask(_task.id);
            _deleting = false;

            if (!result.Ok)
            {
                _statusMessage = result.Error;
                Repaint();
                return;
            }

            TaskRemoved?.Invoke(_task.id);
            Close();
        }

        private void DrawSubtasksSection()
        {
            EditorGUILayout.LabelField("Subtasks", EditorStyles.boldLabel);

            if (_subtasks.Length == 0)
            {
                EditorGUILayout.LabelField("No subtasks yet.", EditorStyles.miniLabel);
            }

            foreach (var subtask in _subtasks)
            {
                bool busy = _subtaskBusyId == subtask.id;
                bool done = subtask.status == "done";

                EditorGUILayout.BeginHorizontal();

                EditorGUI.BeginDisabledGroup(busy);
                bool newDone = EditorGUILayout.ToggleLeft(subtask.title, done, GUILayout.ExpandWidth(true));
                EditorGUI.EndDisabledGroup();
                if (newDone != done)
                {
                    _ = ToggleSubtask(subtask, newDone);
                }

                EditorGUI.BeginDisabledGroup(busy);
                if (GUILayout.Button("x", GUILayout.Width(20)))
                {
                    _ = DeleteSubtask(subtask);
                }
                EditorGUI.EndDisabledGroup();

                EditorGUILayout.EndHorizontal();
            }

            EditorGUILayout.BeginHorizontal();
            _newSubtaskTitle = EditorGUILayout.TextField(_newSubtaskTitle);
            EditorGUI.BeginDisabledGroup(_addingSubtask || string.IsNullOrWhiteSpace(_newSubtaskTitle));
            if (GUILayout.Button(_addingSubtask ? "Adding..." : "Add subtask", GUILayout.Width(100)))
            {
                _ = AddSubtask();
            }
            EditorGUI.EndDisabledGroup();
            EditorGUILayout.EndHorizontal();
        }

        private async Task ToggleSubtask(TaskDto subtask, bool done)
        {
            _subtaskBusyId = subtask.id;
            _statusMessage = null;
            Repaint();

            var result = await GuidonApiClient.SetTaskStatus(subtask.id, done ? "done" : "todo");
            _subtaskBusyId = null;

            if (!result.Ok)
            {
                _statusMessage = result.Error;
            }
            else if (result.Value != null)
            {
                ReplaceSubtask(result.Value);
                TaskUpserted?.Invoke(result.Value);
            }

            Repaint();
        }

        private async Task DeleteSubtask(TaskDto subtask)
        {
            _subtaskBusyId = subtask.id;
            _statusMessage = null;
            Repaint();

            var result = await GuidonApiClient.DeleteTask(subtask.id);
            _subtaskBusyId = null;

            if (!result.Ok)
            {
                _statusMessage = result.Error;
            }
            else
            {
                _subtasks = _subtasks.Where(t => t.id != subtask.id).ToArray();
                TaskRemoved?.Invoke(subtask.id);
            }

            Repaint();
        }

        private async Task AddSubtask()
        {
            _addingSubtask = true;
            _statusMessage = null;
            Repaint();

            var result = await GuidonApiClient.CreateTask(
                _projectId, _newSubtaskTitle.Trim(), string.Empty, "medium", string.Empty, parentTaskId: _task.id);

            _addingSubtask = false;

            if (!result.Ok || result.Value == null)
            {
                _statusMessage = result.Error;
                Repaint();
                return;
            }

            _subtasks = _subtasks.Append(result.Value).ToArray();
            _newSubtaskTitle = string.Empty;
            TaskUpserted?.Invoke(result.Value);
            Repaint();
        }

        private void ReplaceSubtask(TaskDto updated)
        {
            _subtasks = _subtasks.Select(t => t.id == updated.id ? updated : t).ToArray();
        }

        private void DrawCommentsSection()
        {
            EditorGUILayout.LabelField("Comments", EditorStyles.boldLabel);

            if (_loadingComments)
            {
                EditorGUILayout.LabelField("Loading...", EditorStyles.miniLabel);
            }
            else if (_comments.Length == 0)
            {
                EditorGUILayout.LabelField("No comments yet.", EditorStyles.miniLabel);
            }
            else
            {
                foreach (var comment in _comments)
                {
                    string author = string.IsNullOrEmpty(comment.actor_label) ? "Someone" : comment.actor_label;
                    EditorGUILayout.LabelField($"{author} - {comment.created_at}", EditorStyles.miniLabel);
                    EditorGUILayout.LabelField(comment.content, EditorStyles.wordWrappedLabel);
                    EditorGUILayout.Space(2);
                }
            }

            EditorGUILayout.BeginHorizontal();
            _newCommentDraft = EditorGUILayout.TextField(_newCommentDraft);
            EditorGUI.BeginDisabledGroup(_postingComment || string.IsNullOrWhiteSpace(_newCommentDraft));
            if (GUILayout.Button(_postingComment ? "Posting..." : "Post", GUILayout.Width(70)))
            {
                _ = PostComment();
            }
            EditorGUI.EndDisabledGroup();
            EditorGUILayout.EndHorizontal();
        }

        private async Task RefreshComments()
        {
            _loadingComments = true;
            Repaint();

            var result = await GuidonApiClient.ListComments(_task.id);
            _loadingComments = false;

            if (result.Ok) _comments = result.Value;
            else _statusMessage = result.Error;

            Repaint();
        }

        private async Task PostComment()
        {
            _postingComment = true;
            _statusMessage = null;
            Repaint();

            var result = await GuidonApiClient.AddComment(_task.id, _newCommentDraft.Trim());
            _postingComment = false;

            if (!result.Ok)
            {
                _statusMessage = result.Error;
                Repaint();
                return;
            }

            _newCommentDraft = string.Empty;
            await RefreshComments();
        }
    }
}

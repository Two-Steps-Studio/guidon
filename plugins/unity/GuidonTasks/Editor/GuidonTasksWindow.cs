using System;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;

namespace Guidon.Tasks.Editor
{
    /// <summary>
    /// Window > Guidon > Tasks. View a project's tasks, change a task's
    /// status, and read/post its comments, without leaving the editor.
    ///
    /// No background polling - a manual Refresh button only. An
    /// EditorWindow that polls while unfocused is a real footgun
    /// (EditorApplication.update leaks, editor idle CPU) not worth it for a
    /// "glance at it while it's open" v1.
    /// </summary>
    public class GuidonTasksWindow : EditorWindow
    {
        [MenuItem("Window/Guidon/Tasks")]
        private static void ShowWindow()
        {
            var window = GetWindow<GuidonTasksWindow>();
            window.titleContent = new GUIContent("Guidon Tasks");
            window.minSize = new Vector2(560, 360);
        }

        private ProjectDto[] _projects = Array.Empty<ProjectDto>();
        private int _selectedProjectIndex = -1;
        private TaskDto[] _tasks = Array.Empty<TaskDto>();
        private TaskDto _selectedTask;
        private CommentDto[] _comments = Array.Empty<CommentDto>();
        private string _newComment = string.Empty;
        private string _statusMessage;
        private bool _isBusy;
        private Vector2 _listScroll;
        private Vector2 _detailScroll;

        private bool _showSettings;
        private string _baseUrlField;
        private string _apiKeyField;

        private void OnEnable()
        {
            _baseUrlField = GuidonSettings.BaseUrl;
            _apiKeyField = GuidonSettings.ApiKey;
            _showSettings = !GuidonSettings.IsConfigured;

            if (GuidonSettings.IsConfigured)
            {
                // Fire-and-forget: OnEnable can't be async itself (fixed
                // Unity lifecycle signature). GuidonApiClient never throws,
                // so nothing here needs a try/catch around the discard.
                _ = RefreshProjects();
            }
        }

        private void OnGUI()
        {
            DrawSettingsFoldout();

            if (!GuidonSettings.IsConfigured)
            {
                EditorGUILayout.HelpBox("Set a base URL and API key above to get started.", MessageType.Info);
                return;
            }

            DrawTopBar();

            if (!string.IsNullOrEmpty(_statusMessage))
            {
                EditorGUILayout.HelpBox(_statusMessage, MessageType.Error);
            }

            EditorGUILayout.BeginHorizontal();
            DrawTaskList();
            DrawTaskDetail();
            EditorGUILayout.EndHorizontal();
        }

        private void DrawSettingsFoldout()
        {
            _showSettings = EditorGUILayout.Foldout(_showSettings, "Settings", true);
            if (!_showSettings) return;

            EditorGUILayout.BeginVertical("box");
            EditorGUILayout.HelpBox(
                "Create an API key in Guidon under Profile > API Keys with scopes " +
                "tasks:read, tasks:status and comments:write, then paste it here.",
                MessageType.None);
            _baseUrlField = EditorGUILayout.TextField("Base URL", _baseUrlField);
            _apiKeyField = EditorGUILayout.PasswordField("API Key", _apiKeyField);

            if (GUILayout.Button("Save", GUILayout.Width(80)))
            {
                GuidonSettings.BaseUrl = _baseUrlField?.TrimEnd('/') ?? string.Empty;
                GuidonSettings.ApiKey = _apiKeyField;
                _showSettings = false;
                _statusMessage = null;
                _ = RefreshProjects();
            }
            EditorGUILayout.EndVertical();
        }

        private void DrawTopBar()
        {
            EditorGUILayout.BeginHorizontal(EditorStyles.toolbar);

            if (_projects.Length == 0)
            {
                GUILayout.Label("No projects found for this API key.", EditorStyles.toolbarButton);
            }
            else
            {
                string[] names = new string[_projects.Length];
                for (int i = 0; i < _projects.Length; i++) names[i] = _projects[i].name;

                int displayIndex = Mathf.Clamp(_selectedProjectIndex, 0, _projects.Length - 1);
                int newIndex = EditorGUILayout.Popup(displayIndex, names, EditorStyles.toolbarPopup, GUILayout.Width(240));
                if (newIndex != _selectedProjectIndex)
                {
                    _selectedProjectIndex = newIndex;
                    GuidonSettings.ProjectId = _projects[newIndex].id;
                    _selectedTask = null;
                    _comments = Array.Empty<CommentDto>();
                    _ = RefreshTasks();
                }
            }

            if (GUILayout.Button("Refresh", EditorStyles.toolbarButton, GUILayout.Width(70)))
            {
                _ = RefreshProjects();
            }

            GUILayout.FlexibleSpace();
            if (_isBusy) GUILayout.Label("Loading...", EditorStyles.toolbarButton);

            EditorGUILayout.EndHorizontal();
        }

        private void DrawTaskList()
        {
            EditorGUILayout.BeginVertical(GUILayout.Width(220));
            _listScroll = EditorGUILayout.BeginScrollView(_listScroll);

            foreach (var task in _tasks)
            {
                bool selected = _selectedTask != null && _selectedTask.id == task.id;
                EditorGUILayout.BeginVertical(selected ? EditorStyles.helpBox : GUIStyle.none);

                if (GUILayout.Button(task.title, EditorStyles.boldLabel))
                {
                    _selectedTask = task;
                    _newComment = string.Empty;
                    _comments = Array.Empty<CommentDto>();
                    _ = RefreshComments(task.id);
                }
                EditorGUILayout.LabelField($"{GuidonVocabulary.StatusLabel(task.status)} · {task.priority}", EditorStyles.miniLabel);

                EditorGUILayout.EndVertical();
            }

            if (_tasks.Length == 0)
            {
                EditorGUILayout.LabelField("No tasks in this project.", EditorStyles.wordWrappedMiniLabel);
            }

            EditorGUILayout.EndScrollView();
            EditorGUILayout.EndVertical();
        }

        private void DrawTaskDetail()
        {
            EditorGUILayout.BeginVertical();
            _detailScroll = EditorGUILayout.BeginScrollView(_detailScroll);

            if (_selectedTask == null)
            {
                EditorGUILayout.LabelField("Select a task from the list.");
            }
            else
            {
                EditorGUILayout.LabelField(_selectedTask.title, EditorStyles.boldLabel);
                EditorGUILayout.LabelField("Priority: " + _selectedTask.priority);

                int statusIndex = Array.IndexOf(GuidonVocabulary.Statuses, _selectedTask.status);
                int newStatusIndex = EditorGUILayout.Popup("Status", Math.Max(statusIndex, 0), GuidonVocabulary.StatusLabels);
                // Guarded by statusIndex >= 0 on purpose: if the task's status
                // string doesn't match any known value, Popup is drawn with a
                // 0 fallback every frame while statusIndex stays -1, which
                // would otherwise make `newStatusIndex != statusIndex` true
                // on every single repaint and fire ChangeStatus in a loop.
                if (statusIndex >= 0 && newStatusIndex != statusIndex)
                {
                    _ = ChangeStatus(_selectedTask, GuidonVocabulary.Statuses[newStatusIndex]);
                }

                EditorGUILayout.Space();
                EditorGUILayout.LabelField("Description", EditorStyles.boldLabel);
                EditorGUILayout.LabelField(
                    string.IsNullOrEmpty(_selectedTask.description) ? "(none)" : _selectedTask.description,
                    EditorStyles.wordWrappedLabel);

                EditorGUILayout.Space();
                EditorGUILayout.LabelField("Comments", EditorStyles.boldLabel);

                foreach (var comment in _comments)
                {
                    string author = string.IsNullOrEmpty(comment.actor_label) ? "Someone" : comment.actor_label;
                    EditorGUILayout.LabelField($"{author} · {comment.created_at}", EditorStyles.miniLabel);
                    EditorGUILayout.LabelField(comment.content, EditorStyles.wordWrappedLabel);
                    EditorGUILayout.Space(4);
                }

                if (_comments.Length == 0)
                {
                    EditorGUILayout.LabelField("No comments yet.", EditorStyles.wordWrappedMiniLabel);
                }

                _newComment = EditorGUILayout.TextArea(_newComment, GUILayout.Height(50));

                EditorGUI.BeginDisabledGroup(string.IsNullOrWhiteSpace(_newComment));
                if (GUILayout.Button("Post Comment", GUILayout.Width(120)))
                {
                    _ = PostComment(_selectedTask.id, _newComment);
                }
                EditorGUI.EndDisabledGroup();
            }

            EditorGUILayout.EndScrollView();
            EditorGUILayout.EndVertical();
        }

        private async Task RefreshProjects()
        {
            _isBusy = true;
            _statusMessage = null;
            Repaint();

            var result = await GuidonApiClient.ListProjects();
            _isBusy = false;

            if (!result.Ok)
            {
                _statusMessage = result.Error;
                Repaint();
                return;
            }

            _projects = result.Value;

            string savedId = GuidonSettings.ProjectId;
            _selectedProjectIndex = Array.FindIndex(_projects, p => p.id == savedId);
            if (_selectedProjectIndex < 0 && _projects.Length > 0) _selectedProjectIndex = 0;

            if (_selectedProjectIndex >= 0)
            {
                GuidonSettings.ProjectId = _projects[_selectedProjectIndex].id;
                await RefreshTasks();
            }

            Repaint();
        }

        private async Task RefreshTasks()
        {
            if (_selectedProjectIndex < 0 || _selectedProjectIndex >= _projects.Length) return;

            _isBusy = true;
            _statusMessage = null;
            Repaint();

            var result = await GuidonApiClient.ListTasks(_projects[_selectedProjectIndex].id);
            _isBusy = false;

            if (!result.Ok)
            {
                _statusMessage = result.Error;
            }
            else
            {
                _tasks = result.Value;
                _selectedTask = null;
                _comments = Array.Empty<CommentDto>();
            }

            Repaint();
        }

        private async Task RefreshComments(string taskId)
        {
            var result = await GuidonApiClient.ListComments(taskId);
            if (result.Ok) _comments = result.Value;
            else _statusMessage = result.Error;
            Repaint();
        }

        private async Task ChangeStatus(TaskDto task, string newStatus)
        {
            _statusMessage = null;
            var result = await GuidonApiClient.SetTaskStatus(task.id, newStatus);

            if (!result.Ok)
            {
                // Left as-is deliberately: this is the same
                // project_ai_permissions error text task-transitions.ts
                // already produces for an AI caller (e.g. "This project
                // does not allow AI to auto-complete tasks...") - accurate
                // and actionable even though this caller is a human using
                // the plugin, not an AI.
                _statusMessage = result.Error;
            }
            else if (result.Value != null)
            {
                // Update in place rather than a full RefreshTasks() - that
                // would reset _selectedTask/_comments and lose the user's
                // place in the detail panel for no reason, since the API
                // already hands back the updated row.
                int index = Array.FindIndex(_tasks, t => t.id == task.id);
                if (index >= 0) _tasks[index] = result.Value;
                if (_selectedTask != null && _selectedTask.id == task.id) _selectedTask = result.Value;
            }

            Repaint();
        }

        private async Task PostComment(string taskId, string content)
        {
            _statusMessage = null;
            var result = await GuidonApiClient.AddComment(taskId, content);

            if (!result.Ok)
            {
                _statusMessage = result.Error;
            }
            else
            {
                _newComment = string.Empty;
                await RefreshComments(taskId);
            }

            Repaint();
        }
    }
}

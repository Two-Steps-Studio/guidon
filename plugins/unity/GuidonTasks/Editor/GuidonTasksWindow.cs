using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;

namespace Guidon.Tasks.Editor
{
    /// <summary>
    /// Window > Guidon > Tasks. A Kanban board for one project - columns
    /// per status, drag-and-drop between them, creating/opening/deleting
    /// tasks (opening delegates to GuidonTaskDetailWindow, which also owns
    /// editing, subtasks, and comments - this window is just the board).
    ///
    /// No background polling - a manual Refresh button only. An
    /// EditorWindow that polls while unfocused is a real footgun
    /// (EditorApplication.update leaks, editor idle CPU) not worth it for a
    /// "glance at it while it's open" tool.
    ///
    /// Drag-and-drop is manual Event.current mouse tracking, not
    /// UnityEditor.DragAndDrop (that API targets cross-window/OS drags,
    /// e.g. dragging an asset from the Project view - overkill for a
    /// same-window reorder, and the simpler/more common IMGUI pattern for
    /// this is exactly what's below). Card and column Rects are captured
    /// via GUILayoutUtility.GetLastRect() immediately after drawing each -
    /// valid for hit-testing during the same OnGUI pass that drew them,
    /// the same mechanism every built-in IMGUI control (GUI.Button
    /// included) already relies on internally.
    /// </summary>
    public class GuidonTasksWindow : EditorWindow
    {
        [MenuItem("Window/Guidon/Tasks")]
        private static void ShowWindow()
        {
            var window = GetWindow<GuidonTasksWindow>();
            window.titleContent = new GUIContent("Guidon Tasks");
            window.minSize = new Vector2(720, 420);
        }

        private ProjectDto[] _projects = Array.Empty<ProjectDto>();
        private int _selectedProjectIndex = -1;
        private TaskDto[] _tasks = Array.Empty<TaskDto>();
        private string _statusMessage;
        private bool _isBusy;
        private Vector2 _boardScroll;

        private bool _showSettings;
        private string _baseUrlField;
        private bool _loggingIn;

        // --- drag-and-drop state ---
        private TaskDto _pressedTask; // mouse went down on this card; not yet a confirmed drag
        private TaskDto _draggingTask; // promoted from _pressedTask once the mouse moved past DragThreshold
        private Vector2 _mouseDownPosition;
        private string _hoveredDropStatus;
        private readonly Dictionary<string, Rect> _columnRects = new Dictionary<string, Rect>();
        private const float DragThreshold = 4f;

        private string CurrentProjectId =>
            _selectedProjectIndex >= 0 && _selectedProjectIndex < _projects.Length
                ? _projects[_selectedProjectIndex].id
                : null;

        private void OnEnable()
        {
            GuidonTaskDetailWindow.TaskUpserted += OnTaskUpserted;
            GuidonTaskDetailWindow.TaskRemoved += OnTaskRemoved;

            _baseUrlField = GuidonSettings.BaseUrl;
            _showSettings = !GuidonSettings.IsConfigured;

            if (GuidonSettings.IsConfigured)
            {
                // Fire-and-forget: OnEnable can't be async itself (fixed
                // Unity lifecycle signature). GuidonApiClient never throws,
                // so nothing here needs a try/catch around the discard.
                _ = RefreshProjects();
            }
        }

        private void OnDisable()
        {
            GuidonTaskDetailWindow.TaskUpserted -= OnTaskUpserted;
            GuidonTaskDetailWindow.TaskRemoved -= OnTaskRemoved;
        }

        private void OnTaskUpserted(TaskDto task)
        {
            if (task.project_id != CurrentProjectId) return;

            int index = Array.FindIndex(_tasks, t => t.id == task.id);
            _tasks = index >= 0
                ? _tasks.Select(t => t.id == task.id ? task : t).ToArray()
                : _tasks.Append(task).ToArray();
            Repaint();
        }

        private void OnTaskRemoved(string taskId)
        {
            _tasks = _tasks.Where(t => t.id != taskId).ToArray();
            Repaint();
        }

        private void OnGUI()
        {
            DrawSettingsFoldout();

            if (!GuidonSettings.IsConfigured)
            {
                EditorGUILayout.HelpBox("Log in above to get started.", MessageType.Info);
                return;
            }

            DrawTopBar();

            if (!string.IsNullOrEmpty(_statusMessage))
            {
                EditorGUILayout.HelpBox(_statusMessage, MessageType.Error);
            }

            DrawKanbanBoard();
            HandleGlobalDragEvents();
        }

        private void DrawSettingsFoldout()
        {
            _showSettings = EditorGUILayout.Foldout(_showSettings, "Settings", true);
            if (!_showSettings) return;

            EditorGUILayout.BeginVertical("box");
            _baseUrlField = EditorGUILayout.TextField("Base URL", _baseUrlField);

            if (GuidonSettings.IsConfigured)
            {
                string email = string.IsNullOrEmpty(GuidonSettings.Email) ? "(unknown)" : GuidonSettings.Email;
                EditorGUILayout.LabelField("Logged in as", email);

                if (GUILayout.Button("Log Out", GUILayout.Width(90)))
                {
                    GuidonSettings.LogOut();
                    _projects = Array.Empty<ProjectDto>();
                    _selectedProjectIndex = -1;
                    _tasks = Array.Empty<TaskDto>();
                    _statusMessage = null;
                }
            }
            else
            {
                EditorGUILayout.HelpBox(
                    "Log in opens useguidon.com in your browser - the same login you already use " +
                    "(including password reset and OAuth). Approve the request there and this window " +
                    "picks it up automatically.",
                    MessageType.None);

                EditorGUI.BeginDisabledGroup(_loggingIn || string.IsNullOrEmpty(_baseUrlField));
                if (GUILayout.Button(_loggingIn ? "Waiting for browser..." : "Log In", GUILayout.Width(150)))
                {
                    _ = LogInViaBrowser();
                }
                EditorGUI.EndDisabledGroup();
            }

            EditorGUILayout.EndVertical();
        }

        private async Task LogInViaBrowser()
        {
            GuidonSettings.BaseUrl = _baseUrlField?.TrimEnd('/') ?? string.Empty;
            _loggingIn = true;
            _statusMessage = null;
            Repaint();

            var result = await GuidonBrowserAuth.LoginAsync(GuidonSettings.BaseUrl);
            _loggingIn = false;

            if (!result.Ok)
            {
                _statusMessage = result.Error;
                Repaint();
                return;
            }

            GuidonSettings.ApiKey = result.Value.apiKey;
            GuidonSettings.Email = result.Value.email;
            _showSettings = false;

            await RefreshProjects();
        }

        private void DrawTopBar()
        {
            EditorGUILayout.BeginHorizontal(EditorStyles.toolbar);

            if (_projects.Length == 0)
            {
                GUILayout.Label("No projects found for this account.", EditorStyles.toolbarButton);
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

        private void DrawKanbanBoard()
        {
            _boardScroll = EditorGUILayout.BeginScrollView(_boardScroll, GUILayout.ExpandHeight(true));
            EditorGUILayout.BeginHorizontal();

            foreach (string status in GuidonVocabulary.Statuses)
            {
                DrawColumn(status);
            }

            EditorGUILayout.EndHorizontal();
            EditorGUILayout.EndScrollView();
        }

        private void DrawColumn(string status)
        {
            var columnTasks = _tasks
                .Where(t => string.IsNullOrEmpty(t.parent_task_id) && t.status == status)
                .OrderBy(t => t.sort_order)
                .ToList();

            bool highlighted = _draggingTask != null && _hoveredDropStatus == status;
            Color previousBg = GUI.backgroundColor;
            if (highlighted) GUI.backgroundColor = new Color(0.35f, 0.65f, 1f);

            EditorGUILayout.BeginVertical(EditorStyles.helpBox, GUILayout.Width(220), GUILayout.ExpandHeight(true));
            GUI.backgroundColor = previousBg;

            EditorGUILayout.BeginHorizontal();
            EditorGUILayout.LabelField(GuidonVocabulary.StatusLabel(status), EditorStyles.boldLabel);
            GUILayout.FlexibleSpace();
            EditorGUILayout.LabelField(columnTasks.Count.ToString(), GUILayout.Width(20));
            if (GUILayout.Button("+", GUILayout.Width(20)))
            {
                GuidonTaskDetailWindow.OpenForNewTask(CurrentProjectId, status);
            }
            EditorGUILayout.EndHorizontal();

            foreach (var task in columnTasks)
            {
                DrawCard(task);
            }

            if (columnTasks.Count == 0)
            {
                EditorGUILayout.LabelField("Empty", EditorStyles.centeredGreyMiniLabel);
            }

            GUILayout.FlexibleSpace();
            EditorGUILayout.EndVertical();

            if (Event.current.type != EventType.Layout)
            {
                _columnRects[status] = GUILayoutUtility.GetLastRect();
            }
        }

        private void DrawCard(TaskDto task)
        {
            bool isDragging = _draggingTask != null && _draggingTask.id == task.id;

            Color previousColor = GUI.color;
            if (isDragging) GUI.color = new Color(previousColor.r, previousColor.g, previousColor.b, 0.4f);

            EditorGUILayout.BeginVertical(EditorStyles.helpBox);
            EditorGUILayout.LabelField(task.title, EditorStyles.wordWrappedLabel);

            string dueSuffix = string.IsNullOrEmpty(task.due_date) ? string.Empty : $" · {task.due_date.Substring(0, 10)}";
            EditorGUILayout.LabelField($"{task.priority}{dueSuffix}", EditorStyles.miniLabel);

            EditorGUILayout.EndVertical();
            GUI.color = previousColor;

            if (Event.current.type != EventType.Layout)
            {
                Rect cardRect = GUILayoutUtility.GetLastRect();
                HandleCardInput(task, cardRect);
            }
        }

        private void HandleCardInput(TaskDto task, Rect cardRect)
        {
            Event e = Event.current;

            if (e.type == EventType.MouseDown && e.button == 0 && cardRect.Contains(e.mousePosition))
            {
                _pressedTask = task;
                _mouseDownPosition = e.mousePosition;
                e.Use();
            }
            else if (e.type == EventType.MouseDrag
                     && _pressedTask != null && _pressedTask.id == task.id
                     && _draggingTask == null
                     && Vector2.Distance(e.mousePosition, _mouseDownPosition) > DragThreshold)
            {
                _draggingTask = _pressedTask;
                Repaint();
            }
        }

        /// <summary>
        /// Board-level input that doesn't belong to any single card: updating
        /// the hovered-column highlight while dragging, and resolving a
        /// MouseUp into either "committed drop" (a drag happened) or "open
        /// the task" (a plain click - the mouse never moved past the
        /// threshold, so _draggingTask was never set).
        /// </summary>
        private void HandleGlobalDragEvents()
        {
            Event e = Event.current;

            if (_draggingTask != null && e.type == EventType.MouseDrag)
            {
                _hoveredDropStatus = HitTestColumn(e.mousePosition);
                Repaint();
            }

            if (e.type != EventType.MouseUp) return;

            if (_draggingTask != null)
            {
                var task = _draggingTask;
                string dropStatus = HitTestColumn(e.mousePosition);
                _draggingTask = null;
                _hoveredDropStatus = null;
                _pressedTask = null;

                if (dropStatus != null)
                {
                    _ = CommitMove(task, dropStatus);
                }
                Repaint();
            }
            else if (_pressedTask != null)
            {
                var task = _pressedTask;
                _pressedTask = null;
                GuidonTaskDetailWindow.OpenForTask(CurrentProjectId, task, _tasks);
            }
        }

        private string HitTestColumn(Vector2 position)
        {
            foreach (var pair in _columnRects)
            {
                if (pair.Value.Contains(position)) return pair.Key;
            }
            return null;
        }

        private async Task CommitMove(TaskDto task, string newStatus)
        {
            string previousStatus = task.status;
            float previousSortOrder = task.sort_order;

            var targetColumn = _tasks
                .Where(t => string.IsNullOrEmpty(t.parent_task_id) && t.status == newStatus && t.id != task.id)
                .OrderBy(t => t.sort_order)
                .ToList();
            // v1 always drops at the end of the target column - reordering
            // within a column by drop Y-position is a natural follow-up,
            // not attempted here to keep the hit-testing above simpler.
            float newSortOrder = GuidonSortOrder.ForPosition(targetColumn, targetColumn.Count, task.id);

            // Optimistic: `task` is the exact reference already sitting in
            // `_tasks`, so mutating it in place is enough for the card to
            // visually move immediately, no array surgery needed.
            task.status = newStatus;
            task.sort_order = newSortOrder;
            Repaint();

            if (previousStatus != newStatus)
            {
                var statusResult = await GuidonApiClient.SetTaskStatus(task.id, newStatus);
                if (!statusResult.Ok)
                {
                    // Roll back - left exactly where it was rather than
                    // silently stuck in a column the server rejected.
                    task.status = previousStatus;
                    task.sort_order = previousSortOrder;
                    _statusMessage = statusResult.Error;
                    Repaint();
                    return;
                }
            }

            var sortResult = await GuidonApiClient.UpdateSortOrder(task.id, newSortOrder);
            if (!sortResult.Ok)
            {
                // Status change (if any) already committed server-side at
                // this point - only the exact position within the column
                // failed to save, not worth rolling back the column move
                // itself over.
                _statusMessage = sortResult.Error;
            }

            Repaint();
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

            if (!result.Ok) _statusMessage = result.Error;
            else _tasks = result.Value;

            Repaint();
        }
    }
}

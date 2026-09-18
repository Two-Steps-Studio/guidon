using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace Guidon.Tasks.Editor
{
    /// <summary>
    /// Window > Guidon > Tasks. A Kanban board for one project - columns
    /// per status, drag-and-drop between them, creating/opening/deleting
    /// tasks (opening delegates to GuidonTaskDetailWindow, which also owns
    /// editing, subtasks, and comments - this window is just the board).
    ///
    /// Built on UI Toolkit (CreateGUI/VisualElement), not IMGUI - IMGUI
    /// can't produce anything but flat grey boxes (no background colors,
    /// no rounded corners, no real per-element styling), which is exactly
    /// what looked wrong about the first version of this board. No
    /// external .uss/.uxml file: this plugin is a "copy the folder
    /// anywhere under Assets/" tool, not a UPM package with a fixed path,
    /// so there is no reliable project-relative path to load a stylesheet
    /// asset from after that copy - every element is styled directly via
    /// GuidonStyles.cs's helpers instead.
    ///
    /// No background polling - a manual Refresh button only. An
    /// EditorWindow that polls while unfocused is a real footgun
    /// (EditorApplication.update leaks, editor idle CPU) not worth it for a
    /// "glance at it while it's open" tool.
    ///
    /// Drag-and-drop uses UI Toolkit pointer events
    /// (PointerDownEvent/PointerMoveEvent/PointerUpEvent) with
    /// VisualElement.CapturePointer so move/up events keep targeting the
    /// dragged card even once the cursor leaves its bounds, and
    /// panel.Pick(position) to resolve which column is under the pointer -
    /// the API this problem actually calls for, unlike the IMGUI version's
    /// manual Rect-containment bookkeeping.
    /// </summary>
    public class GuidonTasksWindow : EditorWindow
    {
        [MenuItem("Window/Guidon/Tasks")]
        private static void ShowWindow()
        {
            var window = GetWindow<GuidonTasksWindow>();
            window.titleContent = new GUIContent("Guidon Tasks");
            window.minSize = new Vector2(640, 420);
        }

        private ProjectDto[] _projects = Array.Empty<ProjectDto>();
        private int _selectedProjectIndex = -1;
        private TaskDto[] _tasks = Array.Empty<TaskDto>();

        private string CurrentProjectId =>
            _selectedProjectIndex >= 0 && _selectedProjectIndex < _projects.Length
                ? _projects[_selectedProjectIndex].id
                : null;

        // --- element references, built once in CreateGUI and mutated afterward ---
        private Foldout _settingsFoldout;
        private TextField _baseUrlField;
        private VisualElement _loggedInRow;
        private Label _loggedInLabel;
        private VisualElement _loginRow;
        private Button _loginButton;
        private Label _infoBox;
        private VisualElement _mainContent;
        private DropdownField _projectDropdown;
        private Label _busyLabel;
        private Label _statusMessageLabel;
        private VisualElement _columnsContainer;
        private readonly Dictionary<string, VisualElement> _columnCardContainers = new Dictionary<string, VisualElement>();
        private readonly Dictionary<string, Label> _columnCountLabels = new Dictionary<string, Label>();
        private readonly Dictionary<VisualElement, string> _statusByColumnElement = new Dictionary<VisualElement, string>();

        // --- drag-and-drop state ---
        private TaskDto _pressedTask;
        private TaskDto _draggingTask;
        private Vector3 _pointerDownPosition;
        private VisualElement _hoveredColumn;
        private const float DragThreshold = 5f;

        private bool _loggingIn;

        private void OnEnable()
        {
            GuidonTaskDetailWindow.TaskUpserted += OnTaskUpserted;
            GuidonTaskDetailWindow.TaskRemoved += OnTaskRemoved;
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
            RebuildBoard();
        }

        private void OnTaskRemoved(string taskId)
        {
            _tasks = _tasks.Where(t => t.id != taskId).ToArray();
            RebuildBoard();
        }

        public void CreateGUI()
        {
            VisualElement root = rootVisualElement;
            root.style.flexGrow = 1;
            GuidonStyles.StyleRoot(root);
            GuidonStyles.SetPadding(root, 8f);

            BuildHeader(root);
            BuildSettingsSection(root);

            _infoBox = new Label("Log in above to get started.");
            GuidonStyles.StyleMutedLabel(_infoBox);
            root.Add(_infoBox);

            _mainContent = new VisualElement { style = { flexGrow = 1 } };
            root.Add(_mainContent);

            BuildToolbar(_mainContent);

            _statusMessageLabel = new Label();
            GuidonStyles.StyleErrorBox(_statusMessageLabel);
            _statusMessageLabel.style.display = DisplayStyle.None;
            _mainContent.Add(_statusMessageLabel);

            BuildBoard(_mainContent);

            RefreshVisibility();

            if (GuidonSettings.IsConfigured)
            {
                // Fire-and-forget: CreateGUI can't be async itself.
                // GuidonApiClient never throws, so nothing here needs a
                // try/catch around the discard.
                _ = RefreshProjects();
            }
        }

        /// <summary>The plugin's small branded header - the Guidon icon plus a link back to the website, so the board reads as a Guidon surface rather than an anonymous Editor tool.</summary>
        private void BuildHeader(VisualElement root)
        {
            var header = new VisualElement { style = { flexDirection = FlexDirection.Row, alignItems = Align.Center, marginBottom = 6f } };

            Texture2D logo = GuidonLogo.GetTexture();
            if (logo != null)
            {
                var logoImage = new Image
                {
                    image = logo,
                    scaleMode = ScaleMode.ScaleToFit,
                    style = { width = 20f, height = 20f, marginRight = 6f },
                };
                header.Add(logoImage);
            }

            var linkButton = new Button(() => Application.OpenURL("https://useguidon.com")) { text = "Guidon ↗" };
            GuidonStyles.StyleLinkButton(linkButton);
            header.Add(linkButton);

            root.Add(header);
        }

        private void BuildSettingsSection(VisualElement root)
        {
            _settingsFoldout = new Foldout { text = "Settings", value = !GuidonSettings.IsConfigured };
            GuidonStyles.SetPadding(_settingsFoldout, 4f);

            _baseUrlField = new TextField { value = GuidonSettings.BaseUrl };
            GuidonStyles.AddLabeledField(_settingsFoldout, "Base URL", _baseUrlField);

            _loggedInRow = new VisualElement { style = { flexDirection = FlexDirection.Row, alignItems = Align.Center, marginTop = 4f } };
            _loggedInLabel = new Label { style = { flexGrow = 1 } };
            _loggedInRow.Add(_loggedInLabel);
            var logOutButton = new Button(OnLogOutClicked) { text = "Log Out" };
            GuidonStyles.StyleSecondaryButton(logOutButton);
            _loggedInRow.Add(logOutButton);
            _settingsFoldout.Add(_loggedInRow);

            _loginRow = new VisualElement { style = { marginTop = 4f } };
            var infoLabel = new Label(
                "Log in opens useguidon.com in your browser - the same login you already use " +
                "(including password reset and OAuth). Approve the request there and this window " +
                "picks it up automatically.");
            infoLabel.style.whiteSpace = WhiteSpace.Normal;
            infoLabel.style.marginBottom = 4f;
            GuidonStyles.StyleMutedLabel(infoLabel);
            _loginRow.Add(infoLabel);

            _loginButton = new Button(() => { _ = LogInViaBrowser(); }) { text = "Log In" };
            GuidonStyles.StylePrimaryButton(_loginButton);
            _loginButton.SetEnabled(!string.IsNullOrEmpty(_baseUrlField.value));
            _baseUrlField.RegisterValueChangedCallback(evt => _loginButton.SetEnabled(!_loggingIn && !string.IsNullOrEmpty(evt.newValue)));
            _loginRow.Add(_loginButton);
            _settingsFoldout.Add(_loginRow);

            root.Add(_settingsFoldout);

            RefreshLoginState();
        }

        private void RefreshLoginState()
        {
            bool configured = GuidonSettings.IsConfigured;
            _loggedInRow.style.display = configured ? DisplayStyle.Flex : DisplayStyle.None;
            _loginRow.style.display = configured ? DisplayStyle.None : DisplayStyle.Flex;

            if (configured)
            {
                string email = string.IsNullOrEmpty(GuidonSettings.Email) ? "(unknown)" : GuidonSettings.Email;
                _loggedInLabel.text = $"Logged in as {email}";
            }
        }

        private void RefreshVisibility()
        {
            bool configured = GuidonSettings.IsConfigured;
            _infoBox.style.display = configured ? DisplayStyle.None : DisplayStyle.Flex;
            _mainContent.style.display = configured ? DisplayStyle.Flex : DisplayStyle.None;
        }

        private void OnLogOutClicked()
        {
            GuidonSettings.LogOut();
            _projects = Array.Empty<ProjectDto>();
            _selectedProjectIndex = -1;
            _tasks = Array.Empty<TaskDto>();

            RebuildProjectDropdown();
            RebuildBoard();
            ShowStatusMessage(null);
            RefreshLoginState();
            RefreshVisibility();
        }

        private async Task LogInViaBrowser()
        {
            GuidonSettings.BaseUrl = _baseUrlField.value?.TrimEnd('/') ?? string.Empty;
            _loggingIn = true;
            _loginButton.SetEnabled(false);
            _loginButton.text = "Waiting for browser...";
            ShowStatusMessage(null);

            var result = await GuidonBrowserAuth.LoginAsync(GuidonSettings.BaseUrl);
            _loggingIn = false;
            _loginButton.text = "Log In";
            _loginButton.SetEnabled(!string.IsNullOrEmpty(_baseUrlField.value));

            if (!result.Ok)
            {
                ShowStatusMessage(result.Error);
                return;
            }

            GuidonSettings.ApiKey = result.Value.apiKey;
            GuidonSettings.Email = result.Value.email;
            _settingsFoldout.value = false;
            RefreshLoginState();
            RefreshVisibility();

            await RefreshProjects();
        }

        private void BuildToolbar(VisualElement parent)
        {
            var row = new VisualElement { style = { flexDirection = FlexDirection.Row, alignItems = Align.Center, marginBottom = 6f } };

            _projectDropdown = new DropdownField { style = { width = 220f } };
            _projectDropdown.RegisterValueChangedCallback(OnProjectDropdownChanged);
            GuidonStyles.StyleInputBox(_projectDropdown);
            _projectDropdown.style.marginBottom = 0f;
            row.Add(_projectDropdown);

            var refreshButton = new Button(() => { _ = RefreshProjects(); }) { text = "↻ Refresh", style = { marginLeft = 4f } };
            GuidonStyles.StyleSecondaryButton(refreshButton);
            row.Add(refreshButton);

            _busyLabel = new Label("Loading...") { style = { marginLeft = 8f } };
            _busyLabel.style.display = DisplayStyle.None;
            GuidonStyles.StyleMutedLabel(_busyLabel);
            row.Add(_busyLabel);

            parent.Add(row);
        }

        private void OnProjectDropdownChanged(ChangeEvent<string> evt)
        {
            int newIndex = Array.FindIndex(_projects, p => p.name == evt.newValue);
            if (newIndex < 0 || newIndex == _selectedProjectIndex) return;

            _selectedProjectIndex = newIndex;
            GuidonSettings.ProjectId = _projects[newIndex].id;
            _ = RefreshTasks();
        }

        private void RebuildProjectDropdown()
        {
            _projectDropdown.choices = _projects.Select(p => p.name).ToList();
            if (_selectedProjectIndex >= 0 && _selectedProjectIndex < _projects.Length)
            {
                _projectDropdown.SetValueWithoutNotify(_projects[_selectedProjectIndex].name);
            }
        }

        private void BuildBoard(VisualElement parent)
        {
            var scroll = new ScrollView(ScrollViewMode.Horizontal) { style = { flexGrow = 1 } };
            _columnsContainer = new VisualElement { style = { flexDirection = FlexDirection.Row } };
            scroll.Add(_columnsContainer);
            parent.Add(scroll);

            foreach (string status in GuidonVocabulary.Statuses)
            {
                BuildColumn(status);
            }
        }

        private void BuildColumn(string status)
        {
            var column = new VisualElement();
            GuidonStyles.StyleColumn(column);
            _statusByColumnElement[column] = status;

            var header = new VisualElement { style = { flexDirection = FlexDirection.Row, alignItems = Align.Center } };
            GuidonStyles.StyleColumnHeader(header);

            var accentDot = new VisualElement();
            GuidonStyles.StyleColumnAccentDot(accentDot, status);
            header.Add(accentDot);

            var titleLabel = new Label(GuidonVocabulary.StatusLabel(status)) { style = { flexGrow = 1 } };
            GuidonStyles.StyleSectionHeader(titleLabel);
            header.Add(titleLabel);

            var countLabel = new Label("0");
            GuidonStyles.StyleMutedLabel(countLabel);
            countLabel.style.marginRight = 4f;
            header.Add(countLabel);
            _columnCountLabels[status] = countLabel;

            var addButton = new Button(() => GuidonTaskDetailWindow.OpenForNewTask(CurrentProjectId, status)) { text = "+" };
            GuidonStyles.StyleIconButton(addButton);
            header.Add(addButton);

            column.Add(header);

            var cardsContainer = new VisualElement();
            column.Add(cardsContainer);
            _columnCardContainers[status] = cardsContainer;

            _columnsContainer.Add(column);
        }

        private void RebuildBoard()
        {
            foreach (string status in GuidonVocabulary.Statuses)
            {
                VisualElement container = _columnCardContainers[status];
                container.Clear();

                var columnTasks = _tasks
                    .Where(t => string.IsNullOrEmpty(t.parent_task_id) && t.status == status)
                    .OrderBy(t => t.sort_order)
                    .ToList();

                _columnCountLabels[status].text = columnTasks.Count.ToString();

                foreach (var task in columnTasks)
                {
                    container.Add(BuildCard(task));
                }

                if (columnTasks.Count == 0)
                {
                    var empty = new Label("Empty") { style = { unityTextAlign = TextAnchor.MiddleCenter, marginTop = 8f } };
                    GuidonStyles.StyleMutedLabel(empty);
                    container.Add(empty);
                }
            }
        }

        private VisualElement BuildCard(TaskDto task)
        {
            var card = new VisualElement();
            GuidonStyles.StyleCard(card, false);

            var titleRow = new VisualElement { style = { flexDirection = FlexDirection.Row } };

            var dot = new VisualElement();
            GuidonStyles.StylePriorityDot(dot, task.priority);
            titleRow.Add(dot);

            var titleLabel = new Label(task.title) { style = { flexGrow = 1 } };
            GuidonStyles.StyleTitleLabel(titleLabel);
            titleRow.Add(titleLabel);

            card.Add(titleRow);

            if (task.tags != null && task.tags.Length > 0)
            {
                card.Add(BuildTagsRow(task.tags));
            }

            card.Add(BuildMetaRow(task));

            card.RegisterCallback<PointerDownEvent>(evt => OnCardPointerDown(evt, task, card));
            card.RegisterCallback<PointerMoveEvent>(evt => OnCardPointerMove(evt, task, card));
            card.RegisterCallback<PointerUpEvent>(evt => OnCardPointerUp(evt, task, card));

            return card;
        }

        /// <summary>Task tags as small pills - mt-2 flex flex-wrap gap-1 pl-3.5 on the site, capped at 3 + "+N" the same way.</summary>
        private static VisualElement BuildTagsRow(string[] tags)
        {
            var row = new VisualElement { style = { flexDirection = FlexDirection.Row, flexWrap = Wrap.Wrap, marginLeft = 14f, marginTop = 2f } };

            foreach (string tag in tags.Take(3))
            {
                var pill = new Label(tag);
                GuidonStyles.StyleTagPill(pill);
                row.Add(pill);
            }

            if (tags.Length > 3)
            {
                var overflow = new Label($"+{tags.Length - 3}");
                GuidonStyles.StyleMutedLabel(overflow);
                row.Add(overflow);
            }

            return row;
        }

        /// <summary>Priority + due date + subtask progress in one row - mirrors the site's card footer. Subtask counts are computed client-side from the already-loaded `_tasks` (the list-tasks API returns no aggregate count), so this only reflects what's currently loaded on the board.</summary>
        private VisualElement BuildMetaRow(TaskDto task)
        {
            var row = new VisualElement { style = { flexDirection = FlexDirection.Row, alignItems = Align.Center, marginLeft = 14f, marginTop = 4f } };

            var priorityLabel = new Label(task.priority) { style = { marginRight = 10f } };
            GuidonStyles.StyleMutedLabel(priorityLabel);
            row.Add(priorityLabel);

            if (!string.IsNullOrEmpty(task.due_date))
            {
                var dueLabel = new Label(task.due_date.Substring(0, 10)) { style = { marginRight = 10f } };
                GuidonStyles.StyleMutedLabel(dueLabel);
                row.Add(dueLabel);
            }

            int subtaskTotal = _tasks.Count(t => t.parent_task_id == task.id);
            if (subtaskTotal > 0)
            {
                int subtaskDone = _tasks.Count(t => t.parent_task_id == task.id && t.status == "done");
                var subtaskLabel = new Label($"✓ {subtaskDone}/{subtaskTotal}");
                GuidonStyles.StyleMutedLabel(subtaskLabel);
                row.Add(subtaskLabel);
            }

            return row;
        }

        private void OnCardPointerDown(PointerDownEvent evt, TaskDto task, VisualElement card)
        {
            if (evt.button != 0) return;

            _pressedTask = task;
            _draggingTask = null;
            _pointerDownPosition = evt.position;
            card.CapturePointer(evt.pointerId);
            evt.StopPropagation();
        }

        private void OnCardPointerMove(PointerMoveEvent evt, TaskDto task, VisualElement card)
        {
            if (_pressedTask == null || _pressedTask.id != task.id) return;
            if (!card.HasPointerCapture(evt.pointerId)) return;

            if (_draggingTask == null)
            {
                if (Vector3.Distance(evt.position, _pointerDownPosition) <= DragThreshold) return;
                _draggingTask = _pressedTask;
                GuidonStyles.StyleCard(card, true);
            }

            // `panel` belongs to a VisualElement, not the EditorWindow -
            // `card` (the element that captured this pointer) is the one
            // with a `.panel` to pick against.
            VisualElement hit = card.panel.Pick(evt.position);
            VisualElement column = FindColumnAncestor(hit);
            if (column == _hoveredColumn) return;

            if (_hoveredColumn != null) GuidonStyles.StyleColumnHighlighted(_hoveredColumn, false);
            _hoveredColumn = column;
            if (_hoveredColumn != null) GuidonStyles.StyleColumnHighlighted(_hoveredColumn, true);
        }

        private void OnCardPointerUp(PointerUpEvent evt, TaskDto task, VisualElement card)
        {
            if (_pressedTask == null || _pressedTask.id != task.id) return;

            card.ReleasePointer(evt.pointerId);
            bool wasDragging = _draggingTask != null;

            string dropStatus = null;
            if (wasDragging)
            {
                GuidonStyles.StyleCard(card, false);
                if (_hoveredColumn != null)
                {
                    GuidonStyles.StyleColumnHighlighted(_hoveredColumn, false);
                    dropStatus = _statusByColumnElement[_hoveredColumn];
                }
            }

            TaskDto pressedTask = _pressedTask;
            _pressedTask = null;
            _draggingTask = null;
            _hoveredColumn = null;

            if (wasDragging)
            {
                if (dropStatus != null) _ = CommitMove(pressedTask, dropStatus);
            }
            else
            {
                GuidonTaskDetailWindow.OpenForTask(CurrentProjectId, pressedTask, _tasks);
            }
        }

        private VisualElement FindColumnAncestor(VisualElement element)
        {
            VisualElement current = element;
            while (current != null)
            {
                if (_statusByColumnElement.ContainsKey(current)) return current;
                current = current.parent;
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
            // Always drops at the end of the target column - reordering
            // within a column by drop position is a natural follow-up, not
            // attempted here to keep the hit-testing above simpler.
            float newSortOrder = GuidonSortOrder.ForPosition(targetColumn, targetColumn.Count, task.id);

            // Optimistic: `task` is the exact reference already sitting in
            // `_tasks`, so mutating it in place and rebuilding is enough
            // for the card to visually move immediately.
            task.status = newStatus;
            task.sort_order = newSortOrder;
            RebuildBoard();

            if (previousStatus != newStatus)
            {
                var statusResult = await GuidonApiClient.SetTaskStatus(task.id, newStatus);
                if (!statusResult.Ok)
                {
                    // Roll back - left exactly where it was rather than
                    // silently stuck in a column the server rejected.
                    task.status = previousStatus;
                    task.sort_order = previousSortOrder;
                    ShowStatusMessage(statusResult.Error);
                    RebuildBoard();
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
                ShowStatusMessage(sortResult.Error);
            }
        }

        private void ShowStatusMessage(string message)
        {
            _statusMessageLabel.text = message ?? string.Empty;
            _statusMessageLabel.style.display = string.IsNullOrEmpty(message) ? DisplayStyle.None : DisplayStyle.Flex;
        }

        private void SetBusy(bool busy)
        {
            _busyLabel.style.display = busy ? DisplayStyle.Flex : DisplayStyle.None;
        }

        private async Task RefreshProjects()
        {
            SetBusy(true);
            ShowStatusMessage(null);

            var result = await GuidonApiClient.ListProjects();
            SetBusy(false);

            if (!result.Ok)
            {
                ShowStatusMessage(result.Error);
                return;
            }

            _projects = result.Value;
            RebuildProjectDropdown();

            string savedId = GuidonSettings.ProjectId;
            _selectedProjectIndex = Array.FindIndex(_projects, p => p.id == savedId);
            if (_selectedProjectIndex < 0 && _projects.Length > 0) _selectedProjectIndex = 0;

            if (_selectedProjectIndex >= 0)
            {
                _projectDropdown.SetValueWithoutNotify(_projects[_selectedProjectIndex].name);
                GuidonSettings.ProjectId = _projects[_selectedProjectIndex].id;
                await RefreshTasks();
            }
        }

        private async Task RefreshTasks()
        {
            if (_selectedProjectIndex < 0 || _selectedProjectIndex >= _projects.Length) return;

            SetBusy(true);
            ShowStatusMessage(null);

            var result = await GuidonApiClient.ListTasks(_projects[_selectedProjectIndex].id);
            SetBusy(false);

            if (!result.Ok)
            {
                ShowStatusMessage(result.Error);
                return;
            }

            _tasks = result.Value;
            RebuildBoard();
        }
    }
}

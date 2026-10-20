using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
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
    /// Its toolbar also opens the Moodboard and toggles Reports: the board
    /// narrowed to bug reports (from the game and the website's widget),
    /// with a bar that sets up the in-game reporter (GuidonReportsSetup).
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
        private bool _reportsOnly;
        private Button _reportsButton;
        private VisualElement _reportsBar;
        private Label _reportsStatusLabel;
        private Button _reportsSetupButton;
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

        // --- auto-refresh ---
        private const long AutoRefreshMs = 30000;
        private int _busyCount;
        // Bumped by every user change, so a background refresh that overlapped one is thrown away.
        private int _actionCount;

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
            _actionCount++;
            if (task.project_id != CurrentProjectId) return;

            int index = Array.FindIndex(_tasks, t => t.id == task.id);
            _tasks = index >= 0
                ? _tasks.Select(t => t.id == task.id ? task : t).ToArray()
                : _tasks.Append(task).ToArray();
            RebuildBoard();
        }

        private void OnTaskRemoved(string taskId)
        {
            _actionCount++;
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

            BuildReportsBar(_mainContent);
            BuildBoard(_mainContent);

            RefreshVisibility();

            root.schedule.Execute(AutoRefreshTick).Every(AutoRefreshMs);

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

            var autoRefresh = new Toggle("Auto-refresh every 30 s") { value = GuidonSettings.AutoRefresh, style = { marginTop = 4f } };
            autoRefresh.RegisterValueChangedCallback(evt => GuidonSettings.AutoRefresh = evt.newValue);
            GuidonStyles.StyleToggleLabel(autoRefresh);
            _settingsFoldout.Add(autoRefresh);

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

            var moodboardButton = new Button(GuidonMoodboardWindow.ShowWindow) { text = "Moodboard", tooltip = "This project's reference images", style = { marginLeft = 4f } };
            GuidonStyles.StyleSecondaryButton(moodboardButton);
            row.Add(moodboardButton);

            _reportsButton = new Button(ToggleReports) { text = "Reports", tooltip = "Show only bug reports from your game and website, and set up in-game reports", style = { marginLeft = 4f } };
            GuidonStyles.StyleSecondaryButton(_reportsButton);
            row.Add(_reportsButton);

            _busyLabel = new Label("Loading...") { style = { marginLeft = 8f } };
            _busyLabel.style.display = DisplayStyle.None;
            GuidonStyles.StyleMutedLabel(_busyLabel);
            row.Add(_busyLabel);

            parent.Add(row);
        }

        // Labels shown in _projectDropdown, index-aligned with _projects. Kept
        // as a field (not recomputed from _projects.name in the change
        // handler) so both sides agree even when two projects share a name -
        // DropdownField matches by string value, and a plain p.name lookup
        // would make the second same-named project unreachable (its display
        // string never differs from the one already selected, so
        // RegisterValueChangedCallback never fires for it).
        private string[] _projectLabels = Array.Empty<string>();

        private void OnProjectDropdownChanged(ChangeEvent<string> evt)
        {
            int newIndex = Array.IndexOf(_projectLabels, evt.newValue);
            if (newIndex < 0 || newIndex == _selectedProjectIndex) return;

            _selectedProjectIndex = newIndex;
            GuidonSettings.ProjectId = _projects[newIndex].id;
            _ = RefreshTasks();
        }

        private void RebuildProjectDropdown()
        {
            _projectLabels = DisambiguateLabels(_projects.Select(p => p.name).ToArray(), _projects.Select(p => p.id).ToArray());
            _projectDropdown.choices = _projectLabels.ToList();
            if (_selectedProjectIndex >= 0 && _selectedProjectIndex < _projects.Length)
            {
                _projectDropdown.SetValueWithoutNotify(_projectLabels[_selectedProjectIndex]);
            }
        }

        /// <summary>Appends a short id suffix (same 8-hex-char convention as
        /// the git ref) to any label that collides with another, so every
        /// entry is a unique DropdownField value. Labels with no collision
        /// are left untouched.</summary>
        internal static string[] DisambiguateLabels(string[] names, string[] ids)
        {
            var counts = names.GroupBy(n => n).ToDictionary(g => g.Key, g => g.Count());
            var labels = new string[names.Length];
            for (int i = 0; i < names.Length; i++)
            {
                var id = ids[i] ?? "";
                labels[i] = counts[names[i]] > 1
                    ? $"{names[i]} ({id.Substring(0, Math.Min(8, id.Length))})"
                    : names[i];
            }
            return labels;
        }

        private void BuildBoard(VisualElement parent)
        {
            var scroll = new ScrollView(ScrollViewMode.Horizontal) { style = { flexGrow = 1 } };
            _columnsContainer = new VisualElement { style = { flexDirection = FlexDirection.Row } };
            scroll.Add(_columnsContainer);
            parent.Add(scroll);

            BuildColumns();
        }

        /// <summary>(Re)creates the column elements from GuidonVocabulary.CurrentColumns - the project's visible columns, in its order.</summary>
        private void BuildColumns()
        {
            _columnsContainer.Clear();
            _columnCardContainers.Clear();
            _columnCountLabels.Clear();
            _statusByColumnElement.Clear();

            foreach (ColumnDto column in GuidonVocabulary.CurrentColumns)
            {
                BuildColumn(column.status, column.label);
            }
        }

        private void BuildColumn(string status, string label)
        {
            var column = new VisualElement();
            GuidonStyles.StyleColumn(column);
            _statusByColumnElement[column] = status;

            var header = new VisualElement { style = { flexDirection = FlexDirection.Row, alignItems = Align.Center } };
            GuidonStyles.StyleColumnHeader(header);

            var accentDot = new VisualElement();
            GuidonStyles.StyleColumnAccentDot(accentDot, status);
            header.Add(accentDot);

            var titleLabel = new Label(label) { style = { flexGrow = 1 } };
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
            foreach (string status in _columnCardContainers.Keys.ToList())
            {
                VisualElement container = _columnCardContainers[status];
                container.Clear();

                var columnTasks = _tasks
                    .Where(t => string.IsNullOrEmpty(t.parent_task_id) && t.status == status)
                    .Where(t => !_reportsOnly || IsReport(t))
                    // Same order as the web board's taskComparator: sort_order,
                    // then the project's priority rank, then age.
                    .OrderBy(t => t.sort_order)
                    .ThenBy(t => GuidonVocabulary.PriorityRank(t.priority))
                    .ThenBy(t => t.created_at, StringComparer.Ordinal)
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

            string preview = DescriptionPreview(task.description);
            if (preview.Length > 0)
            {
                var descriptionLabel = new Label(preview);
                GuidonStyles.StyleMutedLabel(descriptionLabel);
                descriptionLabel.style.whiteSpace = WhiteSpace.Normal;
                descriptionLabel.style.marginLeft = 14f;
                descriptionLabel.style.marginBottom = 2f;
                card.Add(descriptionLabel);
            }

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

        /// <summary>One plain-text line of a markdown description for a card ("" when there is none) - the same preview the site's card shows under the title.</summary>
        private static string DescriptionPreview(string description)
        {
            if (string.IsNullOrWhiteSpace(description)) return string.Empty;

            string text = Regex.Replace(description, @"```[\s\S]*?```", " ");
            text = Regex.Replace(text, @"(?m)^\s*[-*+]\s+\[[xX]\]\s+", "☑ ");
            text = Regex.Replace(text, @"(?m)^\s*[-*+]\s+\[ \]\s+", "☐ ");
            text = Regex.Replace(text, @"(?m)^\s*[-*+]\s+", "• ");
            text = Regex.Replace(text, @"\[([^\]]*)\]\([^)]*\)", "$1");
            text = Regex.Replace(text, @"[#>*_~`|]", string.Empty);
            text = Regex.Replace(text, @"\s+", " ").Trim();

            return text.Length > 140 ? text.Substring(0, 140).TrimEnd() + "…" : text;
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

            var priorityLabel = new Label(GuidonVocabulary.PriorityLabel(task.priority)) { style = { marginRight = 10f } };
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
                int subtaskDone = _tasks.Count(t => t.parent_task_id == task.id && GuidonVocabulary.IsDone(t));
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
            _actionCount++;
            string previousStatus = task.status;
            bool previousIsDone = task.is_done;
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
            task.is_done = GuidonVocabulary.IsDoneStatus(newStatus);
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
                    task.is_done = previousIsDone;
                    task.sort_order = previousSortOrder;
                    ShowStatusMessage(statusResult.Error);
                    RebuildBoard();
                    return;
                }
                // The server's word on whether that column is a done one.
                if (statusResult.Value != null) task.is_done = statusResult.Value.is_done || GuidonVocabulary.IsDoneStatus(newStatus);
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

        // --- reports ---

        /// <summary>Tasks filed by the in-game reporter or the web widget - the reports route tags them.</summary>
        private static bool IsReport(TaskDto task) =>
            task.tags != null && (task.tags.Contains("in-game") || task.tags.Contains("web"));

        private void BuildReportsBar(VisualElement parent)
        {
            _reportsBar = new VisualElement();
            GuidonStyles.StyleBar(_reportsBar);

            _reportsStatusLabel = new Label();
            GuidonStyles.StyleMutedLabel(_reportsStatusLabel);
            _reportsStatusLabel.style.flexGrow = 1;
            _reportsStatusLabel.style.flexShrink = 1;
            _reportsStatusLabel.style.whiteSpace = WhiteSpace.Normal;
            _reportsStatusLabel.style.marginRight = 8f;
            _reportsBar.Add(_reportsStatusLabel);

            _reportsSetupButton = new Button(() => { _ = SetUpReports(); }) { text = "Set Up In-Game Reports", tooltip = "Create a report key for this project and save it in Resources/GuidonReportsSettings" };
            GuidonStyles.StylePrimaryButton(_reportsSetupButton);
            _reportsBar.Add(_reportsSetupButton);

            _reportsBar.style.display = DisplayStyle.None;
            parent.Add(_reportsBar);
        }

        private void ToggleReports()
        {
            _reportsOnly = !_reportsOnly;
            _reportsButton.text = _reportsOnly ? "All Tasks" : "Reports";
            if (_reportsOnly) GuidonStyles.StylePrimaryButton(_reportsButton);
            else GuidonStyles.StyleSecondaryButton(_reportsButton);
            _reportsBar.style.display = _reportsOnly ? DisplayStyle.Flex : DisplayStyle.None;
            UpdateReportsStatus();
            RebuildBoard();
        }

        /// <summary>Whether the game's reporter (Resources/GuidonReportsSettings) files into the open project.</summary>
        private void UpdateReportsStatus()
        {
            if (_reportsStatusLabel == null) return;
            var settings = GuidonReportsSetup.Find();
            string hotkey = settings != null ? settings.hotkey.ToString() : "F8";
            if (settings == null || !settings.IsConfigured)
            {
                _reportsStatusLabel.text = $"In-game reports are off. Set them up and players or testers can press {hotkey} in a running game to file a bug here, with a screenshot and the log.";
                _reportsSetupButton.text = "Set Up In-Game Reports";
            }
            else if (settings.projectId != CurrentProjectId)
            {
                _reportsStatusLabel.text = $"In-game reports go to another project ({settings.projectId}).";
                _reportsSetupButton.text = "Send Reports Here";
            }
            else
            {
                _reportsStatusLabel.text = $"In-game reports are on: press {hotkey} in Play Mode or a development build. Reports land in Backlog, tagged in-game.";
                _reportsSetupButton.text = "New Report Key";
            }
        }

        /// <summary>
        /// Creates a reports:write key bound to the open project and writes it,
        /// with the server and project, into the reporter's settings asset. That
        /// key ships with the game: it can only file reports into this project.
        /// </summary>
        private async Task SetUpReports()
        {
            string projectId = CurrentProjectId;
            if (string.IsNullOrEmpty(projectId)) return;

            // Builds that already shipped the old key keep reporting with it until it's revoked.
            var existing = GuidonReportsSetup.Find();
            if (existing != null && !string.IsNullOrEmpty(existing.reportKey) && !EditorUtility.DisplayDialog(
                    "Replace Report Key",
                    "Create a new report key and save it in place of the current one?\n\nThe old key keeps working in builds that already shipped it. Revoke it on the website (Project Settings > Bug report widget) once you no longer need it.",
                    "Replace", "Cancel"))
            {
                return;
            }

            SetBusy(true);
            _reportsSetupButton.SetEnabled(false);
            var result = await GuidonApiClient.CreateReportKey(projectId);
            if (this == null) return;
            SetBusy(false);
            _reportsSetupButton.SetEnabled(true);

            if (!result.Ok)
            {
                ShowStatusMessage("Could not set up in-game reports: " + result.Error);
                return;
            }

            ShowStatusMessage(null);
            GuidonReportsSetup.Apply(GuidonSettings.BaseUrl, projectId, result.Value);
            UpdateReportsStatus();
        }

        private void ShowStatusMessage(string message)
        {
            _statusMessageLabel.text = message ?? string.Empty;
            _statusMessageLabel.style.display = string.IsNullOrEmpty(message) ? DisplayStyle.None : DisplayStyle.Flex;
        }

        private void SetBusy(bool busy)
        {
            _busyCount = Math.Max(0, _busyCount + (busy ? 1 : -1));
            _busyLabel.style.display = _busyCount > 0 ? DisplayStyle.Flex : DisplayStyle.None;
        }

        private void AutoRefreshTick()
        {
            if (!GuidonSettings.AutoRefresh || !GuidonSettings.IsConfigured || _busyCount > 0) return;
            if (_pressedTask != null || _draggingTask != null) return;
            // Only while Unity itself is the app in front - no polling from a background editor.
            if (!UnityEditorInternal.InternalEditorUtility.isApplicationActive) return;
            _ = AutoRefresh();
        }

        /// <summary>
        /// Quiet version of RefreshTasks: no busy label, no error banner, and the
        /// board is only rebuilt when the server's tasks or columns actually differ.
        /// </summary>
        private async Task AutoRefresh()
        {
            string projectId = CurrentProjectId;
            if (string.IsNullOrEmpty(projectId)) return;
            int actionsBefore = _actionCount;

            var result = await GuidonApiClient.ListTasks(projectId);
            var columnsResult = result.Ok ? await GuidonApiClient.ListColumns(projectId) : default;
            var prioritiesResult = result.Ok ? await GuidonApiClient.ListPriorities(projectId) : default;
            if (this == null || !result.Ok || projectId != CurrentProjectId) return;
            if (_actionCount != actionsBefore || _busyCount > 0 || _draggingTask != null) return;

            // A failed columns/priorities call keeps what the board already has rather than flickering to the defaults.
            var columns = columnsResult.Ok ? columnsResult.Value : GuidonVocabulary.CurrentColumns;
            var priorities = prioritiesResult.Ok ? prioritiesResult.Value : GuidonVocabulary.CurrentPriorities;
            bool tasksChanged = Fingerprint(result.Value) != Fingerprint(_tasks);
            bool columnsChanged = Fingerprint(columns) != Fingerprint(GuidonVocabulary.CurrentColumns);
            bool prioritiesChanged = Fingerprint(priorities) != Fingerprint(GuidonVocabulary.CurrentPriorities);
            if (!tasksChanged && !columnsChanged && !prioritiesChanged) return;

            _tasks = result.Value;
            GuidonVocabulary.CurrentPriorities = priorities;
            if (columnsChanged)
            {
                GuidonVocabulary.CurrentColumns = columns;
                BuildColumns();
            }
            RebuildBoard();
        }

        private static string Fingerprint(TaskDto[] tasks) =>
            string.Join("|", tasks.Select(t => JsonUtility.ToJson(t)));

        private static string Fingerprint(ColumnDto[] columns) =>
            string.Join("|", columns.Select(c => JsonUtility.ToJson(c)));

        private static string Fingerprint(PriorityDto[] priorities) =>
            string.Join("|", priorities.Select(p => JsonUtility.ToJson(p)));

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

            string projectId = _projects[_selectedProjectIndex].id;
            var result = await GuidonApiClient.ListTasks(projectId);
            // A columns/priorities failure (e.g. an older server without the
            // endpoint - /priorities is a 404 before migration 060) just
            // means the built-in columns/priorities.
            var columnsResult = result.Ok ? await GuidonApiClient.ListColumns(projectId) : default;
            var prioritiesResult = result.Ok ? await GuidonApiClient.ListPriorities(projectId) : default;
            SetBusy(false);

            if (!result.Ok)
            {
                ShowStatusMessage(result.Error);
                return;
            }

            _tasks = result.Value;
            GuidonVocabulary.CurrentColumns = columnsResult.Ok ? columnsResult.Value : GuidonVocabulary.DefaultColumns();
            GuidonVocabulary.CurrentPriorities = prioritiesResult.Ok ? prioritiesResult.Value : GuidonVocabulary.DefaultPriorities();
            BuildColumns();
            RebuildBoard();
            UpdateReportsStatus();
        }
    }
}

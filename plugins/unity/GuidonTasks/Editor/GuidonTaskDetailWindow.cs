using System;
using System.Linq;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace Guidon.Tasks.Editor
{
    /// <summary>
    /// Floating detail/edit window for one task - opened by clicking a
    /// card on the board, or via a column's "+" button (new-task mode).
    /// Built on UI Toolkit (CreateGUI/VisualElement), matching
    /// GuidonTasksWindow's own switch away from IMGUI - see that class's
    /// doc comment for why (real colors/spacing vs. IMGUI's flat boxes,
    /// and no external .uss file since this plugin's folder can be copied
    /// anywhere under Assets/).
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

        private TaskDto[] _subtasks = Array.Empty<TaskDto>();
        private CommentDto[] _comments = Array.Empty<CommentDto>();
        private bool _loadingComments = true;

        private bool _previewingDescription;

        // --- element references ---
        private TextField _titleField;
        private TextField _descriptionField;
        private Label _descriptionPreviewLabel;
        private Button _descriptionToggleButton;
        private DropdownField _priorityDropdown;
        private TextField _dueDateField;
        private DropdownField _statusDropdown;
        private Label _statusMessageLabel;
        private Button _submitButton;
        private Button _deleteButton;
        private VisualElement _subtasksContainer;
        private TextField _newSubtaskField;
        private Button _addSubtaskButton;
        private VisualElement _commentsContainer;
        private TextField _newCommentField;
        private Button _postCommentButton;

        public static void OpenForTask(string projectId, TaskDto task, TaskDto[] allProjectTasks)
        {
            var window = CreateInstance<GuidonTaskDetailWindow>();
            window._projectId = projectId;
            window._task = task;
            window._subtasks = allProjectTasks.Where(t => t.parent_task_id == task.id).ToArray();
            window.titleContent = new GUIContent(task.title);
            window.minSize = new Vector2(380, 440);
            window.ShowUtility();
        }

        public static void OpenForNewTask(string projectId, string status)
        {
            var window = CreateInstance<GuidonTaskDetailWindow>();
            window._projectId = projectId;
            window._newTaskStatus = status;
            window._loadingComments = false; // no comments section in new-task mode
            window.titleContent = new GUIContent("New Task");
            window.minSize = new Vector2(380, 260);
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

        public void CreateGUI()
        {
            VisualElement root = rootVisualElement;
            root.style.flexGrow = 1;
            GuidonStyles.StyleRoot(root);
            GuidonStyles.SetPadding(root, 8f);

            var scroll = new ScrollView { style = { flexGrow = 1 } };
            root.Add(scroll);

            _titleField = new TextField { value = _task?.title ?? string.Empty };
            GuidonStyles.AddLabeledField(scroll, "Title", _titleField);

            BuildDescriptionField(scroll);

            _priorityDropdown = new DropdownField { choices = GuidonVocabulary.Priorities.ToList() };
            _priorityDropdown.SetValueWithoutNotify(_task?.priority ?? "medium");
            GuidonStyles.AddLabeledField(scroll, "Priority", _priorityDropdown);

            _dueDateField = new TextField { value = FormatDueDateForField(_task?.due_date) };
            GuidonStyles.AddLabeledField(scroll, "Due date (yyyy-MM-dd)", _dueDateField);

            if (_task != null) BuildStatusDropdown(scroll);

            BuildActionButtons(scroll);

            _statusMessageLabel = new Label();
            GuidonStyles.StyleErrorBox(_statusMessageLabel);
            _statusMessageLabel.style.display = DisplayStyle.None;
            scroll.Add(_statusMessageLabel);

            if (_task != null)
            {
                BuildSubtasksSection(scroll);
                RebuildSubtasks();

                BuildCommentsSection(scroll);
                _ = RefreshComments();
            }
        }

        private void BuildDescriptionField(VisualElement parent)
        {
            var row = new VisualElement { style = { flexDirection = FlexDirection.Row, alignItems = Align.Center, marginTop = 4f } };
            var label = new Label("Description") { style = { flexGrow = 1 } };
            GuidonStyles.StyleFieldLabel(label);
            row.Add(label);

            _descriptionToggleButton = new Button(ToggleDescriptionPreview) { text = "Preview" };
            GuidonStyles.StyleSecondaryButton(_descriptionToggleButton);
            row.Add(_descriptionToggleButton);
            parent.Add(row);

            _descriptionField = new TextField { multiline = true, value = _task?.description ?? string.Empty };
            _descriptionField.style.minHeight = 60f;
            GuidonStyles.StyleInputBox(_descriptionField);
            parent.Add(_descriptionField);

            _descriptionPreviewLabel = new Label { style = { whiteSpace = WhiteSpace.Normal, minHeight = 60f } };
            _descriptionPreviewLabel.style.display = DisplayStyle.None;
            parent.Add(_descriptionPreviewLabel);
        }

        private void ToggleDescriptionPreview()
        {
            _previewingDescription = !_previewingDescription;
            _descriptionField.style.display = _previewingDescription ? DisplayStyle.None : DisplayStyle.Flex;
            _descriptionPreviewLabel.style.display = _previewingDescription ? DisplayStyle.Flex : DisplayStyle.None;
            _descriptionToggleButton.text = _previewingDescription ? "Edit" : "Preview";

            if (_previewingDescription)
            {
                string content = string.IsNullOrEmpty(_descriptionField.value) ? "(no description)" : _descriptionField.value;
                _descriptionPreviewLabel.text = GuidonMarkdown.ToRichText(content);
            }
        }

        private void BuildStatusDropdown(VisualElement parent)
        {
            // The project's visible columns only (with its labels), so a task can't be moved into a hidden one.
            var columns = GuidonVocabulary.CurrentColumns.ToList();
            if (columns.All(c => c.status != _task.status))
            {
                columns.Add(new ColumnDto { status = _task.status, label = GuidonVocabulary.StatusLabel(_task.status) });
            }
            var labels = columns.Select(c => c.label).ToList();

            _statusDropdown = new DropdownField { choices = labels };
            _statusDropdown.SetValueWithoutNotify(labels[columns.FindIndex(c => c.status == _task.status)]);

            _statusDropdown.RegisterValueChangedCallback(evt =>
            {
                int newIndex = labels.IndexOf(evt.newValue);
                int oldIndex = labels.IndexOf(evt.previousValue);
                if (newIndex >= 0 && newIndex != oldIndex)
                {
                    _ = ChangeStatus(columns[newIndex].status);
                }
            });

            GuidonStyles.AddLabeledField(parent, "Status", _statusDropdown);
        }

        private async Task ChangeStatus(string newStatus)
        {
            ShowStatusMessage(null);
            var result = await GuidonApiClient.SetTaskStatus(_task.id, newStatus);

            if (!result.Ok)
            {
                ShowStatusMessage(result.Error);
            }
            else if (result.Value != null)
            {
                _task = result.Value;
                TaskUpserted?.Invoke(_task);
            }
        }

        private void BuildActionButtons(VisualElement parent)
        {
            var row = new VisualElement { style = { flexDirection = FlexDirection.Row, marginTop = 6f, marginBottom = 6f } };

            _submitButton = new Button(() => { _ = Submit(); }) { text = _task == null ? "✓ Create" : "✓ Save" };
            GuidonStyles.StylePrimaryButton(_submitButton);
            row.Add(_submitButton);

            if (_task != null)
            {
                _deleteButton = new Button(() => { _ = SubmitDelete(); }) { text = "✕ Delete", style = { marginLeft = 4f } };
                GuidonStyles.StyleDestructiveButton(_deleteButton);
                row.Add(_deleteButton);
            }

            var closeButton = new Button(Close) { text = "Close", style = { marginLeft = 4f } };
            GuidonStyles.StyleSecondaryButton(closeButton);
            row.Add(closeButton);

            parent.Add(row);
        }

        private async Task Submit()
        {
            if (string.IsNullOrWhiteSpace(_titleField.value))
            {
                ShowStatusMessage("Title is required.");
                return;
            }

            string priority = _priorityDropdown.value;
            string dueDateIso = ParseDueDateToIso(_dueDateField.value, out string dueDateError);
            if (dueDateError != null)
            {
                ShowStatusMessage(dueDateError);
                return;
            }

            bool creating = _task == null;
            _submitButton.SetEnabled(false);
            _submitButton.text = creating ? "Creating..." : "Saving...";
            ShowStatusMessage(null);

            GuidonResult<TaskDto> result = creating
                ? await GuidonApiClient.CreateTask(
                    _projectId, _titleField.value.Trim(), _descriptionField.value, priority, dueDateIso, status: _newTaskStatus)
                : await GuidonApiClient.UpdateTaskFields(_task.id, _titleField.value.Trim(), _descriptionField.value, priority, dueDateIso);

            if (!result.Ok || result.Value == null)
            {
                _submitButton.SetEnabled(true);
                _submitButton.text = creating ? "✓ Create" : "✓ Save";
                ShowStatusMessage(result.Error);
                return;
            }

            _task = result.Value;
            titleContent = new GUIContent(_task.title);
            TaskUpserted?.Invoke(_task);

            if (creating)
            {
                Close();
            }
            else
            {
                _submitButton.SetEnabled(true);
                _submitButton.text = "✓ Save";
            }
        }

        private async Task SubmitDelete()
        {
            _deleteButton.SetEnabled(false);
            _deleteButton.text = "Deleting...";
            ShowStatusMessage(null);

            var result = await GuidonApiClient.DeleteTask(_task.id);

            if (!result.Ok)
            {
                _deleteButton.SetEnabled(true);
                _deleteButton.text = "✕ Delete";
                ShowStatusMessage(result.Error);
                return;
            }

            TaskRemoved?.Invoke(_task.id);
            Close();
        }

        private void BuildSubtasksSection(VisualElement parent)
        {
            var header = new Label("Subtasks");
            GuidonStyles.StyleSectionHeader(header);
            parent.Add(header);

            _subtasksContainer = new VisualElement();
            parent.Add(_subtasksContainer);

            var addRow = new VisualElement { style = { flexDirection = FlexDirection.Row, alignItems = Align.Center, marginTop = 4f, marginBottom = 8f } };
            _newSubtaskField = new TextField { style = { flexGrow = 1, marginBottom = 0f } };
            GuidonStyles.StyleInputBox(_newSubtaskField);
            _newSubtaskField.style.marginBottom = 0f;
            addRow.Add(_newSubtaskField);
            _addSubtaskButton = new Button(() => { _ = AddSubtask(); }) { text = "Add", style = { marginLeft = 4f } };
            GuidonStyles.StyleSecondaryButton(_addSubtaskButton);
            addRow.Add(_addSubtaskButton);
            parent.Add(addRow);
        }

        private void RebuildSubtasks()
        {
            if (_subtasksContainer == null) return;
            _subtasksContainer.Clear();

            if (_subtasks.Length == 0)
            {
                var empty = new Label("No subtasks yet.");
                GuidonStyles.StyleMutedLabel(empty);
                _subtasksContainer.Add(empty);
                return;
            }

            foreach (var subtask in _subtasks)
            {
                _subtasksContainer.Add(BuildSubtaskRow(subtask));
            }
        }

        private VisualElement BuildSubtaskRow(TaskDto subtask)
        {
            var row = new VisualElement { style = { flexDirection = FlexDirection.Row, alignItems = Align.Center } };

            var toggle = new Toggle { value = subtask.status == "done", text = subtask.title, style = { flexGrow = 1 } };
            toggle.RegisterValueChangedCallback(evt => { _ = ToggleSubtask(subtask, evt.newValue, toggle); });
            GuidonStyles.StyleToggleLabel(toggle);
            row.Add(toggle);

            var deleteButton = new Button(() => { _ = DeleteSubtask(subtask); }) { text = "✕" };
            GuidonStyles.StyleIconButton(deleteButton);
            row.Add(deleteButton);

            return row;
        }

        private async Task ToggleSubtask(TaskDto subtask, bool done, VisualElement rowControl)
        {
            rowControl.SetEnabled(false);
            ShowStatusMessage(null);

            var result = await GuidonApiClient.SetTaskStatus(subtask.id, done ? "done" : "todo");

            if (!result.Ok)
            {
                ShowStatusMessage(result.Error);
                RebuildSubtasks(); // reverts the toggle's visual state back to the unchanged data
                return;
            }

            if (result.Value != null)
            {
                _subtasks = _subtasks.Select(t => t.id == result.Value.id ? result.Value : t).ToArray();
                TaskUpserted?.Invoke(result.Value);
            }

            rowControl.SetEnabled(true);
        }

        private async Task DeleteSubtask(TaskDto subtask)
        {
            ShowStatusMessage(null);
            var result = await GuidonApiClient.DeleteTask(subtask.id);

            if (!result.Ok)
            {
                ShowStatusMessage(result.Error);
                return;
            }

            _subtasks = _subtasks.Where(t => t.id != subtask.id).ToArray();
            TaskRemoved?.Invoke(subtask.id);
            RebuildSubtasks();
        }

        private async Task AddSubtask()
        {
            if (string.IsNullOrWhiteSpace(_newSubtaskField.value)) return;

            _addSubtaskButton.SetEnabled(false);
            ShowStatusMessage(null);

            var result = await GuidonApiClient.CreateTask(
                _projectId, _newSubtaskField.value.Trim(), string.Empty, "medium", string.Empty, parentTaskId: _task.id);

            _addSubtaskButton.SetEnabled(true);

            if (!result.Ok || result.Value == null)
            {
                ShowStatusMessage(result.Error);
                return;
            }

            _subtasks = _subtasks.Append(result.Value).ToArray();
            _newSubtaskField.value = string.Empty;
            TaskUpserted?.Invoke(result.Value);
            RebuildSubtasks();
        }

        private void BuildCommentsSection(VisualElement parent)
        {
            var header = new Label("Comments") { style = { marginTop = 4f } };
            GuidonStyles.StyleSectionHeader(header);
            parent.Add(header);

            _commentsContainer = new VisualElement();
            parent.Add(_commentsContainer);

            var addRow = new VisualElement { style = { flexDirection = FlexDirection.Row, alignItems = Align.Center, marginTop = 4f } };
            _newCommentField = new TextField { style = { flexGrow = 1 } };
            GuidonStyles.StyleInputBox(_newCommentField);
            _newCommentField.style.marginBottom = 0f;
            addRow.Add(_newCommentField);
            _postCommentButton = new Button(() => { _ = PostComment(); }) { text = "Post", style = { marginLeft = 4f } };
            GuidonStyles.StyleSecondaryButton(_postCommentButton);
            addRow.Add(_postCommentButton);
            parent.Add(addRow);
        }

        private void RebuildComments()
        {
            if (_commentsContainer == null) return;
            _commentsContainer.Clear();

            if (_loadingComments)
            {
                var loading = new Label("Loading...");
                GuidonStyles.StyleMutedLabel(loading);
                _commentsContainer.Add(loading);
                return;
            }

            if (_comments.Length == 0)
            {
                var empty = new Label("No comments yet.");
                GuidonStyles.StyleMutedLabel(empty);
                _commentsContainer.Add(empty);
                return;
            }

            foreach (var comment in _comments)
            {
                string author = string.IsNullOrEmpty(comment.actor_label) ? "Someone" : comment.actor_label;

                var meta = new Label($"{author} - {comment.created_at}");
                GuidonStyles.StyleMutedLabel(meta);
                _commentsContainer.Add(meta);

                var content = new Label(comment.content) { style = { marginBottom = 6f } };
                GuidonStyles.StyleBodyLabel(content);
                _commentsContainer.Add(content);
            }
        }

        private async Task RefreshComments()
        {
            _loadingComments = true;
            RebuildComments();

            var result = await GuidonApiClient.ListComments(_task.id);
            _loadingComments = false;

            if (result.Ok) _comments = result.Value;
            else ShowStatusMessage(result.Error);

            RebuildComments();
        }

        private async Task PostComment()
        {
            if (string.IsNullOrWhiteSpace(_newCommentField.value)) return;

            _postCommentButton.SetEnabled(false);
            ShowStatusMessage(null);

            var result = await GuidonApiClient.AddComment(_task.id, _newCommentField.value.Trim());
            _postCommentButton.SetEnabled(true);

            if (!result.Ok)
            {
                ShowStatusMessage(result.Error);
                return;
            }

            _newCommentField.value = string.Empty;
            await RefreshComments();
        }

        private void ShowStatusMessage(string message)
        {
            if (_statusMessageLabel == null) return;
            _statusMessageLabel.text = message ?? string.Empty;
            _statusMessageLabel.style.display = string.IsNullOrEmpty(message) ? DisplayStyle.None : DisplayStyle.Flex;
        }
    }
}

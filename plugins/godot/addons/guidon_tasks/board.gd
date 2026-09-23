@tool
extends VBoxContainer
## The "Guidon" bottom panel: toolbar, the project's board (drag cards
## between columns) and a details panel for the selected task - the same
## feature set as the other Guidon editor plugins.
##
## State lives in plain dictionaries from the API; the board and the details
## are rebuilt from it after every change (deferred, so a control is never
## freed from inside its own signal).

const Api := preload("res://addons/guidon_tasks/api.gd")
const Login := preload("res://addons/guidon_tasks/login.gd")
const Settings := preload("res://addons/guidon_tasks/settings.gd")

const COLUMN_WIDTH := 240
const ACCENT := Color("#4d8dff")
const STATUS_COLORS := {
	"backlog": Color("#8b93a1"), "todo": Color("#60a5fa"), "in_progress": Color("#fbbf24"),
	"ai_working": Color("#60a5fa"), "review": Color("#4d8dff"), "done": Color("#34d399"),
}
const PRIORITY_COLORS := {
	"low": Color("#8b93a1"), "medium": Color("#60a5fa"), "high": Color("#fbbf24"), "critical": Color("#f87171"),
}

# --- state
var projects: Array = []
var tasks: Array = []
var columns: Array = Api.default_columns()
var comments := {}  # task_id -> Array
var current_project_id := ""
var selected_task_id := ""
var adding_in_status := ""
var busy := 0
var _login: RefCounted

# details edit buffers - survive rebuilds, reset when another task is opened
var _edit := {"title": "", "description": "", "priority": "medium", "due": "", "subtask": "", "comment": ""}
var _rebuild_queued := false

# --- widgets
var _project_picker: OptionButton
var _busy_label: Label
var _account_label: Label
var _logged_in_controls: Array[Control] = []
var _error_bar: PanelContainer
var _error_label: Label
var _login_panel: Control
var _login_button: Button
var _cancel_login_button: Button
var _base_url_edit: LineEdit
var _board_area: HSplitContainer
var _columns_box: HBoxContainer
var _details: VBoxContainer
var _confirm: ConfirmationDialog


func _ready() -> void:
	custom_minimum_size = Vector2(0, 280)
	_build()
	current_project_id = Settings.get_value("project_id")
	_update_chrome()
	if Settings.is_logged_in():
		refresh_projects()


# --- construction -------------------------------------------------------------

func _build() -> void:
	var toolbar := HBoxContainer.new()
	add_child(toolbar)
	var brand := Label.new()
	brand.text = "Guidon"
	brand.add_theme_color_override("font_color", ACCENT)
	toolbar.add_child(brand)

	_project_picker = OptionButton.new()
	_project_picker.custom_minimum_size.x = 200
	_project_picker.item_selected.connect(func(index): _select_project(str(_project_picker.get_item_metadata(index))))
	toolbar.add_child(_project_picker)
	_logged_in_controls.append(_project_picker)
	_logged_in_controls.append(_toolbar_button(toolbar, "Refresh", refresh_projects))
	_logged_in_controls.append(_toolbar_button(toolbar, "Open in Browser", func():
		if current_project_id != "":
			OS.shell_open("%s/projects/%s/work" % [Settings.base_url().trim_suffix("/"), current_project_id])))

	_busy_label = Label.new()
	_busy_label.text = "Loading…"
	_busy_label.modulate = Color(1, 1, 1, 0.6)
	toolbar.add_child(_busy_label)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	toolbar.add_child(spacer)
	_account_label = Label.new()
	_account_label.modulate = Color(1, 1, 1, 0.6)
	toolbar.add_child(_account_label)
	_logged_in_controls.append(_toolbar_button(toolbar, "Log Out", log_out))

	_error_bar = PanelContainer.new()
	_error_bar.add_theme_stylebox_override("panel", _box(Color(0.6, 0.1, 0.1, 0.25), Color("#f87171"), 6))
	var error_row := HBoxContainer.new()
	_error_bar.add_child(error_row)
	_error_label = Label.new()
	_error_label.add_theme_color_override("font_color", Color("#f87171"))
	_error_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_error_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	error_row.add_child(_error_label)
	var dismiss := Button.new()
	dismiss.text = "✕"
	dismiss.flat = true
	dismiss.pressed.connect(func(): _show_error(""))
	error_row.add_child(dismiss)
	add_child(_error_bar)

	_build_login_panel()
	_build_board_area()

	_confirm = ConfirmationDialog.new()
	_confirm.title = "Delete Task"
	add_child(_confirm)


func _toolbar_button(parent: Control, text: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.pressed.connect(action)
	parent.add_child(button)
	return button


func _build_login_panel() -> void:
	_login_panel = CenterContainer.new()
	_login_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_login_panel)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _box(Color(0, 0, 0, 0.2), Color(1, 1, 1, 0.1), 8, 16))
	_login_panel.add_child(panel)
	var form := VBoxContainer.new()
	form.custom_minimum_size.x = 340
	panel.add_child(form)
	var title := Label.new()
	title.text = "Log in to Guidon"
	form.add_child(title)
	var help := Label.new()
	help.text = "Logging in opens the Guidon website in your browser. Approve the plugin there and this panel picks up the result automatically."
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	help.modulate = Color(1, 1, 1, 0.6)
	form.add_child(help)
	_base_url_edit = LineEdit.new()
	_base_url_edit.text = Settings.base_url()
	_base_url_edit.placeholder_text = "https://useguidon.com"
	form.add_child(_base_url_edit)
	_login_button = Button.new()
	_login_button.text = "Log In"
	_login_button.pressed.connect(func(): log_in())
	form.add_child(_login_button)
	_cancel_login_button = Button.new()
	_cancel_login_button.text = "Cancel"
	_cancel_login_button.pressed.connect(func():
		if _login:
			_login.cancelled = true)
	form.add_child(_cancel_login_button)


func _build_board_area() -> void:
	_board_area = HSplitContainer.new()
	_board_area.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_board_area)

	var board_scroll := ScrollContainer.new()
	board_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	board_scroll.size_flags_stretch_ratio = 2.5
	_board_area.add_child(board_scroll)
	_columns_box = HBoxContainer.new()
	_columns_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_columns_box.add_theme_constant_override("separation", 8)
	board_scroll.add_child(_columns_box)

	var details_scroll := ScrollContainer.new()
	details_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	details_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_board_area.add_child(details_scroll)
	_details = VBoxContainer.new()
	_details.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	details_scroll.add_child(_details)


static func _box(fill: Color, border: Color, radius: int, padding: int = 8) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.border_color = border
	box.set_border_width_all(1)
	box.set_corner_radius_all(radius)
	box.set_content_margin_all(padding)
	return box


# --- plumbing ------------------------------------------------------------------

func _api() -> RefCounted:
	return Api.new(self, Settings.base_url(), Settings.api_key())


func _begin() -> void:
	busy += 1
	_update_chrome()


func _end() -> void:
	busy = maxi(0, busy - 1)
	_update_chrome()


func _show_error(message: String) -> void:
	_error_label.text = message
	_update_chrome()


func _update_chrome() -> void:
	var logged_in := Settings.is_logged_in()
	for control in _logged_in_controls:
		control.visible = logged_in
	_busy_label.visible = busy > 0
	_account_label.text = ("Logged in as %s" % Settings.get_value("email", "?")) if logged_in else ""
	_error_bar.visible = _error_label.text != ""
	_login_panel.visible = not logged_in
	_board_area.visible = logged_in
	_login_button.disabled = _login != null
	_login_button.text = "Waiting for the browser…" if _login != null else "Log In"
	_cancel_login_button.visible = _login != null


func _schedule_rebuild() -> void:
	if _rebuild_queued:
		return
	_rebuild_queued = true
	_do_rebuild.call_deferred()


func _do_rebuild() -> void:
	_rebuild_queued = false
	_rebuild_board()
	_rebuild_details()


func _find(task_id: String):
	for task in tasks:
		if str(task.get("id")) == task_id:
			return task
	return null


func _replace(task: Dictionary) -> void:
	for i in tasks.size():
		if tasks[i].get("id") == task.get("id"):
			tasks[i] = task
			return
	tasks.append(task)


func _label_for(status: String) -> String:
	for column in columns:
		if column.status == status:
			return column.label
	return Api.STATUS_LABELS.get(status, status)


# --- board ---------------------------------------------------------------------

func _rebuild_board() -> void:
	for child in _columns_box.get_children():
		child.queue_free()
	if current_project_id == "":
		var hint := Label.new()
		hint.text = "No projects loaded yet." if projects.is_empty() else "Pick a project above."
		_columns_box.add_child(hint)
		return
	for column in columns:
		_columns_box.add_child(_build_column(column.status, column.label))


func _build_column(status: String, label: String) -> Control:
	var column_tasks := Api.column_tasks(tasks, status)
	var column := ColumnPanel.new()
	column.board = self
	column.status = status
	column.custom_minimum_size.x = COLUMN_WIDTH
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.normal_style = _box(Color(0, 0, 0, 0.18), Color(1, 1, 1, 0.08), 8)
	column.drop_style = _box(Color(0, 0, 0, 0.18), ACCENT, 8)
	column.add_theme_stylebox_override("panel", column.normal_style)

	var body := VBoxContainer.new()
	column.add_child(body)
	var header := HBoxContainer.new()
	body.add_child(header)
	var dot := ColorRect.new()
	dot.color = STATUS_COLORS.get(status, Color.GRAY)
	dot.custom_minimum_size = Vector2(8, 8)
	dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	header.add_child(dot)
	var title := Label.new()
	title.text = label
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var count := Label.new()
	count.text = str(column_tasks.size())
	count.modulate = Color(1, 1, 1, 0.6)
	header.add_child(count)
	var add := Button.new()
	add.text = "+"
	add.flat = true
	add.tooltip_text = "Create a task in this column"
	add.pressed.connect(func():
		adding_in_status = "" if adding_in_status == status else status
		_schedule_rebuild())
	header.add_child(add)

	for task in column_tasks:
		body.add_child(_build_card(task))
	if adding_in_status == status:
		var field := LineEdit.new()
		field.placeholder_text = "Task title, Enter to create"
		field.text_submitted.connect(func(text):
			if text.strip_edges() != "":
				adding_in_status = ""
				create_task(text.strip_edges(), status, ""))
		field.gui_input.connect(func(event):
			if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
				adding_in_status = ""
				_schedule_rebuild())
		body.add_child(field)
		field.grab_focus.call_deferred()
	elif column_tasks.is_empty():
		var empty := Label.new()
		empty.text = "Drop tasks here"
		empty.modulate = Color(1, 1, 1, 0.45)
		body.add_child(empty)
	return column


func _build_card(task: Dictionary) -> Control:
	var card := CardPanel.new()
	card.board = self
	card.task_id = str(task.id)
	card.task_title = str(task.get("title", ""))
	var selected := card.task_id == selected_task_id
	card.add_theme_stylebox_override("panel", _box(Color(1, 1, 1, 0.04), ACCENT if selected else Color(1, 1, 1, 0.1), 6))
	card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

	var body := VBoxContainer.new()
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(body)
	var title := Label.new()
	title.text = card.task_title
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.custom_minimum_size.x = COLUMN_WIDTH - 40
	body.add_child(title)

	var footer := HBoxContainer.new()
	footer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(footer)
	var priority := str(task.get("priority", "medium"))
	var priority_label := Label.new()
	priority_label.text = priority.capitalize()
	priority_label.add_theme_color_override("font_color", PRIORITY_COLORS.get(priority, Color.GRAY))
	footer.add_child(priority_label)
	var due := Api._str(task.get("due_date"))
	if due != "":
		var due_label := Label.new()
		due_label.text = due.substr(0, 10)
		due_label.modulate = Color(1, 1, 1, 0.6)
		footer.add_child(due_label)
	var subs := Api.subtasks(tasks, card.task_id)
	if not subs.is_empty():
		var done := subs.filter(func(sub): return sub.get("status") == "done").size()
		var progress := Label.new()
		progress.text = "✓ %d/%d" % [done, subs.size()]
		progress.modulate = Color(1, 1, 1, 0.6)
		footer.add_child(progress)
	return card


## A board card: click opens it, dragging hands its id to a column.
class CardPanel extends PanelContainer:
	var board
	var task_id := ""
	var task_title := ""

	func _get_drag_data(_at_position: Vector2) -> Variant:
		var preview := Label.new()
		preview.text = task_title
		set_drag_preview(preview)
		return {"guidon_task": task_id}

	func _gui_input(event: InputEvent) -> void:
		# Release without a drag = click (a finished drag ends in the column's _drop_data).
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
			board.select_task(task_id)
			accept_event()


## A board column that accepts dropped cards and outlines itself while one hovers.
class ColumnPanel extends PanelContainer:
	var board
	var status := ""
	var normal_style: StyleBox
	var drop_style: StyleBox

	func _can_drop_data(_at_position: Vector2, data: Variant) -> bool:
		var ok: bool = data is Dictionary and data.has("guidon_task")
		add_theme_stylebox_override("panel", drop_style if ok else normal_style)
		return ok

	func _drop_data(_at_position: Vector2, data: Variant) -> void:
		add_theme_stylebox_override("panel", normal_style)
		board.move_task(str(data.guidon_task), status)

	func _notification(what: int) -> void:
		if what == NOTIFICATION_MOUSE_EXIT or what == NOTIFICATION_DRAG_END:
			if normal_style:
				add_theme_stylebox_override("panel", normal_style)


# --- details --------------------------------------------------------------------

func _rebuild_details() -> void:
	for child in _details.get_children():
		child.queue_free()
	var task = _find(selected_task_id)
	if task == null:
		var hint := Label.new()
		hint.text = "Click a card to open it here. Drag cards between columns to change their status."
		hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		hint.modulate = Color(1, 1, 1, 0.6)
		_details.add_child(hint)
		return

	var task_id := str(task.id)
	var parent_id := Api._str(task.get("parent_task_id"))
	if parent_id != "":
		_details.add_child(_link("← Back to parent task", func(): select_task(parent_id)))

	_details.add_child(_section("Title"))
	var title := LineEdit.new()
	title.text = _edit.title
	title.text_changed.connect(func(text): _edit.title = text)
	_details.add_child(title)

	var row := HBoxContainer.new()
	_details.add_child(row)
	var status_box := VBoxContainer.new()
	status_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(status_box)
	status_box.add_child(_section("Status"))
	var status_picker := OptionButton.new()
	# The project's visible columns only - a task can't be moved into one the board hides.
	var options := columns.map(func(column): return column.status)
	if not options.has(task.status):
		options.append(task.status)
	for status in options:
		status_picker.add_item(_label_for(status))
		status_picker.set_item_metadata(status_picker.item_count - 1, status)
	status_picker.select(options.find(task.status))
	status_picker.item_selected.connect(func(index): move_task(task_id, str(status_picker.get_item_metadata(index))))
	status_box.add_child(status_picker)

	var priority_box := VBoxContainer.new()
	priority_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(priority_box)
	priority_box.add_child(_section("Priority"))
	var priority_picker := OptionButton.new()
	for priority in Api.PRIORITIES:
		priority_picker.add_item(priority.capitalize())
	priority_picker.select(maxi(0, Api.PRIORITIES.find(_edit.priority)))
	priority_picker.item_selected.connect(func(index): _edit.priority = Api.PRIORITIES[index])
	priority_box.add_child(priority_picker)

	_details.add_child(_section("Due date (YYYY-MM-DD)"))
	var due := LineEdit.new()
	due.text = _edit.due
	due.text_changed.connect(func(text): _edit.due = text.strip_edges())
	_details.add_child(due)

	_details.add_child(_section("Description (Markdown)"))
	var description := TextEdit.new()
	description.text = _edit.description
	description.custom_minimum_size.y = 120
	description.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	description.text_changed.connect(func(): _edit.description = description.text)
	_details.add_child(description)

	var buttons := HBoxContainer.new()
	_details.add_child(buttons)
	_toolbar_button(buttons, "Save", save_selected_task)
	var delete := _toolbar_button(buttons, "Delete", func(): _confirm_delete(task_id, str(task.get("title", ""))))
	delete.add_theme_color_override("font_color", Color("#f87171"))
	_toolbar_button(buttons, "Copy ID", func(): DisplayServer.clipboard_set(task_id)).tooltip_text = "Copy the task id, e.g. for a commit message"

	if parent_id == "":
		_details.add_child(_section("Subtasks"))
		for sub in Api.subtasks(tasks, task_id):
			var sub_id := str(sub.id)
			var sub_row := HBoxContainer.new()
			_details.add_child(sub_row)
			var check := CheckBox.new()
			check.button_pressed = sub.get("status") == "done"
			check.toggled.connect(func(on): move_task(sub_id, "done" if on else "todo"))
			sub_row.add_child(check)
			sub_row.add_child(_link(str(sub.get("title", "")), func(): select_task(sub_id)))
		var new_sub := LineEdit.new()
		new_sub.placeholder_text = "New subtask, Enter to add"
		new_sub.text = _edit.subtask
		new_sub.text_changed.connect(func(text): _edit.subtask = text)
		new_sub.text_submitted.connect(func(text):
			if text.strip_edges() != "":
				_edit.subtask = ""
				create_task(text.strip_edges(), "", task_id))
		_details.add_child(new_sub)

	_details.add_child(_section("Comments"))
	var task_comments = comments.get(task_id)
	if task_comments == null:
		_details.add_child(_muted("Loading…"))
	elif task_comments.is_empty():
		_details.add_child(_muted("No comments yet."))
	else:
		for comment in task_comments:
			var bubble := PanelContainer.new()
			bubble.add_theme_stylebox_override("panel", _box(Color(1, 1, 1, 0.04), Color(1, 1, 1, 0.1), 6, 6))
			var body := VBoxContainer.new()
			bubble.add_child(body)
			var author := Api._str(comment.get("actor_label"))
			body.add_child(_muted("%s - %s" % [author if author != "" else "Someone", Api._str(comment.get("created_at")).substr(0, 16).replace("T", " ")]))
			var text := Label.new()
			text.text = Api._str(comment.get("content"))
			text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			body.add_child(text)
			_details.add_child(bubble)
	var comment_edit := TextEdit.new()
	comment_edit.text = _edit.comment
	comment_edit.custom_minimum_size.y = 60
	comment_edit.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	comment_edit.text_changed.connect(func(): _edit.comment = comment_edit.text)
	_details.add_child(comment_edit)
	var post_row := HBoxContainer.new()
	post_row.alignment = BoxContainer.ALIGNMENT_END
	_details.add_child(post_row)
	_toolbar_button(post_row, "Post", post_comment)


func _section(text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.modulate = Color(1, 1, 1, 0.6)
	return label


func _muted(text: String) -> Label:
	var label := _section(text)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label


func _link(text: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.flat = true
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.pressed.connect(action)
	return button


func _confirm_delete(task_id: String, title: String) -> void:
	_confirm.dialog_text = "Delete \"%s\"? Its subtasks and comments are deleted too." % title
	for connection in _confirm.confirmed.get_connections():
		_confirm.confirmed.disconnect(connection.callable)
	_confirm.confirmed.connect(func(): delete_task(task_id), CONNECT_ONE_SHOT)
	_confirm.popup_centered()


# --- actions (public so the tests can drive them) ------------------------------------

func refresh_projects() -> void:
	_begin()
	var result: Dictionary = await _api().list_projects()
	_end()
	if not result.ok:
		_show_error(result.error)
		return
	_show_error("")
	projects = result.data
	var ids := projects.map(func(project): return str(project.id))
	if not ids.has(current_project_id):
		current_project_id = ids[0] if not ids.is_empty() else ""
		Settings.set_value("project_id", current_project_id)
	_project_picker.clear()
	for project in projects:
		_project_picker.add_item(str(project.get("name", project.id)))
		_project_picker.set_item_metadata(_project_picker.item_count - 1, str(project.id))
	_project_picker.select(ids.find(current_project_id))
	await refresh_tasks()


func _select_project(project_id: String) -> void:
	if project_id == current_project_id:
		return
	current_project_id = project_id
	Settings.set_value("project_id", project_id)
	tasks = []
	columns = Api.default_columns()
	comments = {}
	selected_task_id = ""
	adding_in_status = ""
	_schedule_rebuild()
	await refresh_tasks()


func refresh_tasks() -> void:
	var project_id := current_project_id
	if project_id == "":
		tasks = []
		_schedule_rebuild()
		return
	_begin()
	var api := _api()
	var result: Dictionary = await api.list_tasks(project_id)
	# A columns failure (e.g. an older server without the endpoint) just means the default columns.
	var column_result: Dictionary = await api.list_columns(project_id) if result.ok else {"ok": false}
	_end()
	if project_id != current_project_id:
		return
	if not result.ok:
		_show_error(result.error)
		return
	tasks = result.data
	columns = column_result.data if column_result.ok else Api.default_columns()
	if _find(selected_task_id) == null:
		selected_task_id = ""
	_schedule_rebuild()
	if selected_task_id != "":
		load_comments(selected_task_id)


func load_comments(task_id: String) -> void:
	_begin()
	var result: Dictionary = await _api().list_comments(task_id)
	_end()
	if not result.ok:
		_show_error(result.error)
		return
	comments[task_id] = result.data
	if selected_task_id == task_id:
		_schedule_rebuild()


func select_task(task_id: String) -> void:
	var task = _find(task_id)
	if task == null:
		return
	selected_task_id = task_id
	_edit = {
		"title": str(task.get("title", "")), "description": Api._str(task.get("description")),
		"priority": Api._str(task.get("priority")) if Api._str(task.get("priority")) != "" else "medium",
		"due": Api._str(task.get("due_date")).substr(0, 10), "subtask": "", "comment": "",
	}
	_schedule_rebuild()
	load_comments(task_id)


## Optimistic, like the other plugins: move now, revert if the server refuses.
## A moved top-level card lands at the end of its new column.
func move_task(task_id: String, status: String) -> void:
	var task = _find(task_id)
	if task == null or task.get("status") == status:
		return
	var previous: Dictionary = task.duplicate()
	var reorder := Api._str(task.get("parent_task_id")) == ""
	var sort_order := Api.append_sort_order(Api.column_tasks(tasks, status)) if reorder else Api._num(task.get("sort_order"))
	task.status = status
	task.sort_order = sort_order
	_schedule_rebuild()

	_begin()
	var api := _api()
	var result: Dictionary = await api.set_status(task_id, status)
	if result.ok and reorder:
		var sorted: Dictionary = await api.update_task(task_id, {"sort_order": sort_order})
		if sorted.ok:
			result = sorted
		else:
			_show_error(sorted.error)  # the status change landed - only the position didn't
	_end()
	if result.ok:
		_replace(result.data)
	else:
		_replace(previous)
		_show_error(result.error)
	_schedule_rebuild()


func create_task(title: String, status: String, parent_task_id: String) -> void:
	var project_id := current_project_id
	_begin()
	var result: Dictionary = await _api().create_task(project_id, title, status, parent_task_id)
	_end()
	if not result.ok:
		_show_error(result.error)
		return
	_show_error("")
	if project_id == current_project_id:
		_replace(result.data)
	_schedule_rebuild()


func save_selected_task() -> void:
	var title := str(_edit.title).strip_edges()
	if title == "":
		_show_error("Title is required.")
		return
	var due := str(_edit.due)
	if due != "" and not _is_iso_date(due):
		_show_error("Due date must be YYYY-MM-DD (or empty).")
		return
	var task_id := selected_task_id
	_begin()
	var result: Dictionary = await _api().update_task(task_id, {
		"title": title, "description": _edit.description, "priority": _edit.priority, "due_date": due,
	})
	_end()
	if not result.ok:
		_show_error(result.error)
		return
	_show_error("")
	_replace(result.data)
	_schedule_rebuild()


static func _is_iso_date(value: String) -> bool:
	var regex := RegEx.create_from_string("^\\d{4}-\\d{2}-\\d{2}$")
	if regex.search(value) == null:
		return false
	var parts := value.split("-")
	var month := int(parts[1])
	var day := int(parts[2])
	var days_in_month := [31, 29 if int(parts[0]) % 4 == 0 and (int(parts[0]) % 100 != 0 or int(parts[0]) % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
	return month >= 1 and month <= 12 and day >= 1 and day <= days_in_month[month - 1]


func delete_task(task_id: String) -> void:
	_begin()
	var result: Dictionary = await _api().delete_task(task_id)
	_end()
	if not result.ok:
		_show_error(result.error)
		return
	_show_error("")
	# Subtasks go with their parent (ON DELETE CASCADE, migration 010).
	tasks = tasks.filter(func(task): return str(task.id) != task_id and Api._str(task.get("parent_task_id")) != task_id)
	comments.erase(task_id)
	if selected_task_id == task_id:
		selected_task_id = ""
	_schedule_rebuild()


func post_comment() -> void:
	var content := str(_edit.comment).strip_edges()
	var task_id := selected_task_id
	if content == "" or task_id == "":
		return
	_begin()
	var result: Dictionary = await _api().add_comment(task_id, content)
	_end()
	if not result.ok:
		_show_error(result.error)
		return
	_show_error("")
	var list: Array = comments.get(task_id, [])
	list.append(result.data)
	comments[task_id] = list
	if selected_task_id == task_id:
		_edit.comment = ""
		_schedule_rebuild()


## `open_url` is for the tests; the editor opens the system browser.
func log_in(open_url: Callable = Callable()) -> void:
	_show_error("")
	var base_url := _base_url_edit.text.strip_edges()
	Settings.set_value("base_url", base_url)
	_login = Login.new()
	_update_chrome()
	var result: Dictionary = await _login.login(self, base_url, open_url)
	_login = null
	if not result.ok:
		_update_chrome()
		_show_error(result.error)
		return
	Settings.set_value("api_key", result.api_key)
	Settings.set_value("email", result.email)
	_update_chrome()
	await refresh_projects()


func log_out() -> void:
	if _login:
		_login.cancelled = true
	Settings.set_value("api_key", "")
	Settings.set_value("email", "")
	projects = []
	tasks = []
	comments = {}
	selected_task_id = ""
	adding_in_status = ""
	_project_picker.clear()
	_show_error("")
	_schedule_rebuild()

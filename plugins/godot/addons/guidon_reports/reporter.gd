extends CanvasLayer
## In-game reporter (autoload "GuidonReporter"): press the hotkey (F9 by
## default) or call GuidonReporter.open(); the report becomes a Guidon task
## with a screenshot, the recent log and build/scene details. Games with
## their own UI call GuidonReporter.submit(...) instead.
##
## Runs in debug builds, and in release builds only when
## guidon_reports/enabled_in_release is on. The report key is stored in
## project.godot and ships with the game - use a key with ONLY the
## reports:write scope: it can file reports and nothing else.

signal report_finished(ok: bool, message: String)

## Add your own fields (player position, quest, save slot...): connect and write into the dictionary.
signal collect_metadata(metadata: Dictionary)

const SETTINGS := [
	{"name": "guidon_reports/base_url", "type": TYPE_STRING, "default": "https://useguidon.com"},
	{"name": "guidon_reports/project_id", "type": TYPE_STRING, "default": ""},
	{"name": "guidon_reports/report_key", "type": TYPE_STRING, "default": ""},
	{"name": "guidon_reports/hotkey", "type": TYPE_INT, "default": KEY_F9},
	{"name": "guidon_reports/enabled_in_release", "type": TYPE_BOOL, "default": false},
	{"name": "guidon_reports/pause_while_open", "type": TYPE_BOOL, "default": true},
	{"name": "guidon_reports/log_kilobytes", "type": TYPE_INT, "default": 64},
	{"name": "guidon_reports/screenshot_quality", "type": TYPE_FLOAT, "default": 0.85},
]
const CATEGORIES := ["bug", "crash", "feedback"]

var enabled := false
var _form: PanelContainer
var _title: LineEdit
var _description: TextEdit
var _reporter: LineEdit
var _category: OptionButton
var _attach_screenshot: CheckBox
var _attach_log: CheckBox
var _status: Label
var _send: Button
var _screenshot := PackedByteArray()
var _was_paused := false
var _previous_mouse_mode := Input.MOUSE_MODE_VISIBLE
var _sending := false


static func setting(key: String):
	for entry in SETTINGS:
		if entry.name == "guidon_reports/" + key:
			return ProjectSettings.get_setting(entry.name, entry.default)
	return null


func _ready() -> void:
	layer = 128
	process_mode = Node.PROCESS_MODE_ALWAYS  # the form must work while the tree is paused
	var configured: bool = str(setting("base_url")) != "" and str(setting("project_id")) != "" and str(setting("report_key")) != ""
	enabled = configured and (OS.is_debug_build() or bool(setting("enabled_in_release")))
	if not configured and OS.is_debug_build():
		push_warning("[Guidon] guidon_reports/base_url, project_id or report_key is empty - the reporter is disabled.")
	_build_form()


func _unhandled_input(event: InputEvent) -> void:
	if not enabled:
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == int(setting("hotkey")) and not is_open():
			get_viewport().set_input_as_handled()
			open()
		elif event.keycode == KEY_ESCAPE and is_open() and not _sending:
			get_viewport().set_input_as_handled()
			close()


func is_open() -> bool:
	return _form != null and _form.visible


## Captures the screen first (so the form isn't in it), then shows the form.
func open() -> void:
	if not enabled or is_open():
		return
	_screenshot = await _capture()
	_title.text = ""
	_description.text = ""
	_category.select(0)
	_status.text = ""
	_attach_screenshot.button_pressed = not _screenshot.is_empty()
	_attach_screenshot.disabled = _screenshot.is_empty()
	_attach_log.button_pressed = true
	_was_paused = get_tree().paused
	_previous_mouse_mode = Input.mouse_mode
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	if bool(setting("pause_while_open")):
		get_tree().paused = true
	_form.visible = true
	_title.grab_focus()


func close() -> void:
	if not is_open():
		return
	_form.visible = false
	Input.mouse_mode = _previous_mouse_mode
	if bool(setting("pause_while_open")):
		get_tree().paused = _was_paused


## Sends a report without the built-in form. Returns {"ok", "message"}.
func submit(title: String, description: String = "", category: String = "bug", attach_screenshot: bool = true, extra_metadata: Dictionary = {}) -> Dictionary:
	if not enabled:
		return {"ok": false, "message": "Guidon reporter is disabled (settings missing, or a release build)."}
	var shot := await _capture() if attach_screenshot else PackedByteArray()
	return await _send_report(title, description, category, "", shot, true, extra_metadata)


# --- form -------------------------------------------------------------------------

func _build_form() -> void:
	var backdrop := ColorRect.new()
	backdrop.color = Color(0, 0, 0, 0.55)
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	backdrop.mouse_filter = Control.MOUSE_FILTER_STOP

	_form = PanelContainer.new()
	_form.visible = false
	_form.set_anchors_preset(Control.PRESET_FULL_RECT)
	var style := StyleBoxEmpty.new()
	_form.add_theme_stylebox_override("panel", style)
	add_child(_form)
	_form.add_child(backdrop)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	_form.add_child(center)
	var panel := PanelContainer.new()
	var box := StyleBoxFlat.new()
	box.bg_color = Color("#101317")
	box.set_corner_radius_all(8)
	box.set_content_margin_all(18)
	panel.add_theme_stylebox_override("panel", box)
	center.add_child(panel)
	var column := VBoxContainer.new()
	column.custom_minimum_size = Vector2(480, 0)
	panel.add_child(column)

	var heading := Label.new()
	heading.text = "Report a problem"
	heading.add_theme_font_size_override("font_size", 20)
	column.add_child(heading)
	_category = OptionButton.new()
	for label in ["Bug", "Crash", "Feedback"]:
		_category.add_item(label)
	column.add_child(_category)
	column.add_child(_label("What happened? (short title)"))
	_title = LineEdit.new()
	_title.max_length = 200
	_title.text_submitted.connect(func(_text): _on_send())
	column.add_child(_title)
	column.add_child(_label("Details - what did you do, what did you expect?"))
	_description = TextEdit.new()
	_description.custom_minimum_size.y = 110
	_description.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	column.add_child(_description)
	column.add_child(_label("Your name or email (optional)"))
	_reporter = LineEdit.new()
	_reporter.max_length = 200
	_reporter.text = _load_reporter()
	column.add_child(_reporter)
	var toggles := HBoxContainer.new()
	column.add_child(toggles)
	_attach_screenshot = CheckBox.new()
	_attach_screenshot.text = "Attach screenshot"
	toggles.add_child(_attach_screenshot)
	_attach_log = CheckBox.new()
	_attach_log.text = "Attach log"
	toggles.add_child(_attach_log)
	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_status)
	var buttons := HBoxContainer.new()
	buttons.alignment = BoxContainer.ALIGNMENT_END
	column.add_child(buttons)
	var cancel := Button.new()
	cancel.text = "Cancel"
	cancel.pressed.connect(func():
		if not _sending:
			close())
	buttons.add_child(cancel)
	_send = Button.new()
	_send.text = "Send"
	_send.pressed.connect(_on_send)
	buttons.add_child(_send)


func _label(text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.modulate = Color(1, 1, 1, 0.65)
	return label


func _on_send() -> void:
	var title := _title.text.strip_edges()
	if _sending or title == "":
		return
	_sending = true
	_send.disabled = true
	_send.text = "Sending…"
	_status.text = ""
	_save_reporter(_reporter.text.strip_edges())
	var result := await _send_report(title, _description.text, CATEGORIES[_category.selected], _reporter.text.strip_edges(),
		_screenshot if _attach_screenshot.button_pressed else PackedByteArray(), _attach_log.button_pressed, {})
	_sending = false
	_send.disabled = false
	_send.text = "Send"
	_status.text = result.message
	_status.add_theme_color_override("font_color", Color("#34d399") if result.ok else Color("#f87171"))
	if result.ok:
		await get_tree().create_timer(1.2, true).timeout
		close()


func _load_reporter() -> String:
	var config := ConfigFile.new()
	config.load("user://guidon_reports.cfg")
	return str(config.get_value("reports", "reporter", ""))


func _save_reporter(value: String) -> void:
	var config := ConfigFile.new()
	config.set_value("reports", "reporter", value)
	config.save("user://guidon_reports.cfg")


# --- report contents + HTTP -----------------------------------------------------------

func _capture() -> PackedByteArray:
	await RenderingServer.frame_post_draw
	var texture := get_viewport().get_texture()
	if texture == null:
		return PackedByteArray()
	var image := texture.get_image()
	if image == null or image.is_empty():
		return PackedByteArray()
	return image.save_jpg_to_buffer(float(setting("screenshot_quality")))


func _metadata(extra: Dictionary) -> Dictionary:
	var scene := get_tree().current_scene
	var metadata := {
		"project": str(ProjectSettings.get_setting("application/config/name", "")),
		"version": str(ProjectSettings.get_setting("application/config/version", "")),
		"godot": Engine.get_version_info().string,
		"platform": OS.get_name(),
		"os": OS.get_version(),
		"device": OS.get_model_name(),
		"gpu": RenderingServer.get_video_adapter_name(),
		"memory_mb": str(OS.get_memory_info().get("physical", 0) / (1024 * 1024)),
		"scene": scene.scene_file_path if scene else "",
		"resolution": "%dx%d" % [get_viewport().get_visible_rect().size.x, get_viewport().get_visible_rect().size.y],
		"fps": str(Engine.get_frames_per_second()),
		"play_time_s": str(Time.get_ticks_msec() / 1000),
		"debug_build": "yes" if OS.is_debug_build() else "no",
	}
	collect_metadata.emit(metadata)
	metadata.merge(extra, true)
	return metadata


## The tail of Godot's own log file (user://logs/godot.log, on by default on desktop).
func _recent_log() -> String:
	var path := str(ProjectSettings.get_setting("debug/file_logging/log_path", "user://logs/godot.log"))
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return ""
	var limit := int(setting("log_kilobytes")) * 1024
	var length := file.get_length()
	file.seek(maxi(0, length - limit))
	return file.get_buffer(mini(length, limit)).get_string_from_utf8()


func _send_report(title: String, description: String, category: String, reporter: String, screenshot: PackedByteArray, attach_log: bool, extra: Dictionary) -> Dictionary:
	var boundary := "GuidonBoundary" + Crypto.new().generate_random_bytes(12).hex_encode()
	var body := PackedByteArray()
	var add_field := func(name: String, value: String):
		body.append_array(("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n" % [boundary, name]).to_utf8_buffer())
		body.append_array(value.to_utf8_buffer())
		body.append_array("\r\n".to_utf8_buffer())
	var add_file := func(file_name: String, content_type: String, bytes: PackedByteArray):
		body.append_array(("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\nContent-Type: %s\r\n\r\n" % [boundary, file_name, content_type]).to_utf8_buffer())
		body.append_array(bytes)
		body.append_array("\r\n".to_utf8_buffer())

	var metadata := _metadata(extra)
	var flat := {}
	for key in metadata:
		flat[str(key)] = str(metadata[key])
	add_field.call("title", title)
	add_field.call("description", description)
	add_field.call("category", category)
	add_field.call("metadata", JSON.stringify(flat))
	if reporter != "":
		add_field.call("reporter", reporter)
	if not screenshot.is_empty():
		add_file.call("screenshot.jpg", "image/jpeg", screenshot)
	if attach_log:
		var log := _recent_log()
		if log != "":
			add_file.call("log.txt", "text/plain", log.to_utf8_buffer())
	body.append_array(("--%s--\r\n" % boundary).to_utf8_buffer())

	var http := HTTPRequest.new()
	http.timeout = 30.0
	http.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(http)
	var url := "%s/api/v1/projects/%s/reports" % [str(setting("base_url")).strip_edges().trim_suffix("/"), str(setting("project_id")).strip_edges()]
	var headers := PackedStringArray([
		"Authorization: Bearer " + str(setting("report_key")).strip_edges(),
		"Content-Type: multipart/form-data; boundary=" + boundary,
	])
	var err := http.request_raw(url, headers, HTTPClient.METHOD_POST, body)
	var result := {"ok": false, "message": "Invalid request (%s)." % error_string(err)}
	if err == OK:
		var response: Array = await http.request_completed
		var code: int = response[1]
		if response[0] != HTTPRequest.RESULT_SUCCESS:
			result = {"ok": false, "message": "Could not reach the Guidon server."}
		elif code >= 200 and code < 300:
			result = {"ok": true, "message": "Report sent - thank you!"}
		else:
			var parsed = JSON.parse_string((response[3] as PackedByteArray).get_string_from_utf8())
			var server_error: String = parsed.error if parsed is Dictionary and parsed.get("error") is String else "Report failed."
			result = {"ok": false, "message": "%d %s" % [code, server_error]}
	http.queue_free()
	report_finished.emit(result.ok, result.message)
	return result

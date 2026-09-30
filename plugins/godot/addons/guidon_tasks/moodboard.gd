@tool
extends VBoxContainer
## The selected project's moodboard (reference images / concept art) as a grid
## of thumbnails - shown in place of the board by the toolbar's Moodboard
## button (board.gd). Images are downloaded one after another and decoded into
## textures in memory; nothing is written into the Godot project.

const Api := preload("res://addons/guidon_tasks/api.gd")
const Settings := preload("res://addons/guidon_tasks/settings.gd")

const TILE_SIZE := Vector2(180, 135)

var _p: RefCounted  # Palette, set by board.gd
var _project_id := ""
var _generation := 0
var _references: Array = []
var _textures := {}  # reference id -> Texture2D (missing = still loading, null = failed)
var _tag := ""
var _query := ""

var _status: Label
var _search: LineEdit
var _tags_box: HFlowContainer
var _grid: HFlowContainer
var _preview: AcceptDialog
var _preview_image: TextureRect
var _preview_caption: Label
var _preview_source: Button
var _preview_url := ""


func setup(palette: RefCounted) -> void:
	_p = palette
	add_theme_constant_override("separation", 8)

	var bar := HBoxContainer.new()
	add_child(bar)
	_search = LineEdit.new()
	_search.placeholder_text = "Search captions and tags"
	_search.custom_minimum_size.x = 240
	_p.style_input(_search)
	_search.text_changed.connect(func(text):
		_query = text
		_rebuild())
	bar.add_child(_search)
	var open_web := Button.new()
	open_web.text = "Open in Browser"
	_p.style_button(open_web)
	open_web.tooltip_text = "Add images on the Guidon website"
	open_web.pressed.connect(func():
		if _project_id != "":
			OS.shell_open("%s/projects/%s/references" % [Settings.base_url().trim_suffix("/"), _project_id]))
	bar.add_child(open_web)
	_status = _p.label("", "text_muted")
	bar.add_child(_status)

	_tags_box = HFlowContainer.new()
	add_child(_tags_box)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll)
	_grid = HFlowContainer.new()
	_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_grid.add_theme_constant_override("h_separation", 10)
	_grid.add_theme_constant_override("v_separation", 10)
	scroll.add_child(_grid)

	_preview = AcceptDialog.new()
	_preview.title = "Moodboard"
	_preview.ok_button_text = "Close"
	var body := VBoxContainer.new()
	_preview.add_child(body)
	_preview_image = TextureRect.new()
	_preview_image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_preview_image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_preview_image.custom_minimum_size = Vector2(720, 480)
	_preview_image.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(_preview_image)
	_preview_caption = Label.new()
	_preview_caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.add_child(_preview_caption)
	_preview_source = _preview.add_button("Open source", true, "source")
	_preview.custom_action.connect(func(action):
		if action == "source" and (_preview_url.begins_with("https://") or _preview_url.begins_with("http://")):
			OS.shell_open(_preview_url))
	add_child(_preview)


## Loads `project_id`'s moodboard, dropping anything still arriving for a previous one.
func load_project(project_id: String, api: RefCounted) -> void:
	_generation += 1
	var generation := _generation
	_project_id = project_id
	_references = []
	_textures = {}
	_tag = ""
	_rebuild()
	if project_id == "":
		_status.text = "Pick a project above."
		return
	_status.text = "Loading…"
	var result: Dictionary = await api.list_references(project_id)
	if generation != _generation:
		return
	if not result.ok:
		_status.text = result.error
		return
	_references = result.data.filter(func(r): return r is Dictionary and Api._str(r.get("id")) != "")
	_status.text = "%d image(s)" % _references.size() if not _references.is_empty() else "No images yet - add them on the website."
	_rebuild()
	for reference in _references:
		var id := Api._str(reference.get("id"))
		var download: Dictionary = await api.fetch_image(Api._str(reference.get("image_url")))
		if generation != _generation:
			return
		var image: Image = Api.decode_image(download.data, Api._str(reference.get("mime_type"))) if download.ok else null
		_textures[id] = ImageTexture.create_from_image(image) if image else null
		_rebuild_tile(id)


func _filtered() -> Array:
	var needle := _query.strip_edges().to_lower()
	return _references.filter(func(r):
		var tags: Array = r.get("tags") if r.get("tags") is Array else []
		if _tag != "" and not tags.has(_tag):
			return false
		if needle == "":
			return true
		var haystack := ("%s %s %s" % [Api._str(r.get("caption")), Api._str(r.get("name")), " ".join(PackedStringArray(tags))]).to_lower()
		return haystack.contains(needle))


func _rebuild() -> void:
	for child in _tags_box.get_children():
		child.queue_free()
	var tags := {}
	for reference in _references:
		if reference.get("tags") is Array:
			for tag in reference.tags:
				tags[str(tag)] = true
	if not tags.is_empty():
		var tag_names := [""] + tags.keys()
		tag_names.sort()
		for tag_name in tag_names:
			var chip := Button.new()
			chip.text = tag_name if tag_name != "" else "All"
			_p.style_button(chip, "primary" if tag_name == _tag else "outline")
			chip.pressed.connect(func():
				_tag = tag_name
				_rebuild())
			_tags_box.add_child(chip)

	for child in _grid.get_children():
		child.queue_free()
	for reference in _filtered():
		_grid.add_child(_tile(reference))


func _rebuild_tile(id: String) -> void:
	for child in _grid.get_children():
		if child.get_meta("reference_id", "") == id:
			var reference = _find(id)
			if reference:
				_grid.add_child(_tile(reference))
				_grid.move_child(_grid.get_child(_grid.get_child_count() - 1), child.get_index())
			child.queue_free()
			return


func _find(id: String):
	for reference in _references:
		if Api._str(reference.get("id")) == id:
			return reference
	return null


func _tile(reference: Dictionary) -> Control:
	var id := Api._str(reference.get("id"))
	var caption := Api._str(reference.get("caption"))
	if caption == "":
		caption = Api._str(reference.get("name"))

	var tile := Button.new()
	tile.set_meta("reference_id", id)
	tile.custom_minimum_size = TILE_SIZE + Vector2(0, 26)
	tile.tooltip_text = caption
	_p.style_button(tile)
	tile.pressed.connect(func(): _open(reference))

	var column := VBoxContainer.new()
	column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tile.add_child(column)
	if _textures.get(id) is Texture2D:
		var image := TextureRect.new()
		image.texture = _textures[id]
		image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		image.custom_minimum_size = TILE_SIZE
		image.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.add_child(image)
	else:
		var placeholder: Label = _p.label("Loading…" if not _textures.has(id) else "Image unavailable", "text_muted")
		placeholder.custom_minimum_size = TILE_SIZE
		placeholder.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		placeholder.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		placeholder.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.add_child(placeholder)
	var label: Label = _p.label(caption, "text", 12)
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.custom_minimum_size.x = TILE_SIZE.x
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(label)
	return tile


func _open(reference: Dictionary) -> void:
	var id := Api._str(reference.get("id"))
	var caption := Api._str(reference.get("caption"))
	_preview.title = caption if caption != "" else Api._str(reference.get("name"))
	_preview_image.texture = _textures.get(id) if _textures.get(id) is Texture2D else null
	var tags: Array = reference.get("tags") if reference.get("tags") is Array else []
	_preview_caption.text = ", ".join(PackedStringArray(tags))
	_preview_url = Api._str(reference.get("source_url"))
	_preview_source.visible = _preview_url != ""
	_preview.popup_centered_ratio(0.7)

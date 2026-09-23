@tool
extends RefCounted
## The Guidon website's design tokens (src/app/globals.css), light and dark -
## the same values the web board uses, so the panel looks like the site.
## Which set is used follows the editor theme's brightness.

const LIGHT := {
	"background": "#ffffff", "column": "#f8fafc", "card": "#ffffff", "card_hover": "#f8fafc",
	"border": "#e2e8f0", "border_hover": "#cbd5e1", "muted": "#f1f5f9",
	"text": "#0f172a", "text_muted": "#64748b",
	"primary": "#1d4fd8", "primary_hover": "#1640b0", "primary_fg": "#ffffff",
	"danger": "#dc2626", "danger_bg": "#fef2f2",
	"info": "#2563eb", "warning": "#d97706", "success": "#059669",
	"priority_low": "#64748b", "priority_medium": "#2563eb", "priority_high": "#d97706", "priority_critical": "#dc2626",
}
const DARK := {
	"background": "#0b0d10", "column": "#101317", "card": "#101317", "card_hover": "#16191f",
	"border": "#23272f", "border_hover": "#2f343e", "muted": "#16191f",
	"text": "#e8eaed", "text_muted": "#8b93a1",
	"primary": "#4d8dff", "primary_hover": "#6ea3ff", "primary_fg": "#05142e",
	"danger": "#f87171", "danger_bg": "#2a1215",
	"info": "#60a5fa", "warning": "#fbbf24", "success": "#34d399",
	"priority_low": "#8b93a1", "priority_medium": "#60a5fa", "priority_high": "#fbbf24", "priority_critical": "#f87171",
}

var tokens: Dictionary


func _init(dark: bool) -> void:
	tokens = DARK if dark else LIGHT


## Dark unless the editor theme is light. Outside the editor (tests), dark.
static func for_editor() -> RefCounted:
	var dark := true
	if Engine.is_editor_hint():
		var base = EditorInterface.get_editor_settings().get_setting("interface/theme/base_color")
		if base is Color:
			dark = base.get_luminance() < 0.5
	return load("res://addons/guidon_tasks/palette.gd").new(dark)


func c(name: String) -> Color:
	return Color(tokens[name])


## Column dot colors - BOARD_COLUMNS' accentClass in src/lib/work/task-board.ts.
func status(status: String) -> Color:
	match status:
		"todo", "ai_working": return c("info")
		"in_progress": return c("warning")
		"review": return c("primary")
		"done": return c("success")
		_: return c("text_muted")


func priority(priority: String) -> Color:
	return c("priority_" + priority) if tokens.has("priority_" + priority) else c("text_muted")


func box(fill: String, border: String = "border", radius: int = 8, padding: int = 12) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = c(fill)
	style.border_color = c(border) if border != "" else c(fill)
	style.set_border_width_all(1 if border != "" else 0)
	style.set_corner_radius_all(radius)
	style.set_content_margin_all(padding)
	style.anti_aliasing = true
	return style


## The site's Button variants: "primary" (solid brand blue), "outline", "destructive", "ghost".
func style_button(button: Button, variant: String = "outline") -> void:
	var normal: StyleBoxFlat
	var hover: StyleBoxFlat
	var font := c("text")
	match variant:
		"primary":
			normal = box("primary", "", 6, 6)
			hover = box("primary_hover", "", 6, 6)
			font = c("primary_fg")
		"destructive":
			normal = box("background", "border", 6, 6)
			hover = box("danger_bg", "danger", 6, 6)
			font = c("danger")
		"ghost":
			normal = box("background", "", 6, 4)
			normal.bg_color = Color(0, 0, 0, 0)
			hover = box("muted", "", 6, 4)
			font = c("text_muted")
		_:
			normal = box("background", "border", 6, 6)
			hover = box("muted", "border_hover", 6, 6)
	normal.content_margin_left = 10
	normal.content_margin_right = 10
	hover.content_margin_left = 10
	hover.content_margin_right = 10
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", hover)
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(state, font)


func style_input(control: Control) -> void:
	var normal := box("background", "border", 6, 6)
	var focus := box("background", "primary", 6, 6)
	control.add_theme_stylebox_override("normal", normal)
	control.add_theme_stylebox_override("focus", focus)
	control.add_theme_stylebox_override("read_only", normal)
	control.add_theme_color_override("font_color", c("text"))
	control.add_theme_color_override("font_placeholder_color", c("text_muted"))


func label(text: String, color: String = "text", size: int = 0) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_color_override("font_color", c(color))
	if size > 0:
		l.add_theme_font_size_override("font_size", size)
	return l


## Small filled circle (the site's status/priority dots).
func dot(color: Color, diameter: int = 8) -> Panel:
	var d := Panel.new()
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(diameter)
	d.add_theme_stylebox_override("panel", style)
	d.custom_minimum_size = Vector2(diameter, diameter)
	d.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	d.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return d


## Rounded "pill" - the column count badge and tag chips.
func pill(text: String) -> PanelContainer:
	var p := PanelContainer.new()
	var style := box("muted", "border", 4, 2)
	style.content_margin_left = 6
	style.content_margin_right = 6
	p.add_theme_stylebox_override("panel", style)
	p.add_child(label(text, "text_muted", 11))
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p

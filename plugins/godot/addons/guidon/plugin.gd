@tool
extends EditorPlugin
## Adds the "Guidon" bottom panel (board.gd) and owns the in-game reporter's
## autoload and Project Settings (General > Guidon Reports, with Advanced
## Settings on). The autoload is added only once reports are set up - from
## the panel's Reports view or by hand - so a project that only uses the
## board ships nothing extra in its game.

const Board := preload("res://addons/guidon/board.gd")
const Reporter := preload("res://addons/guidon/reporter.gd")
const AUTOLOAD := "GuidonReporter"
const REPORTER_PATH := "res://addons/guidon/reporter.gd"
## Before 2.0 tasks and reports were two add-ons; their folders must go.
const OLD_ADDONS := ["res://addons/guidon_tasks", "res://addons/guidon_reports"]

var _board: Control


func _enter_tree() -> void:
	_register_settings()
	_migrate_autoload()
	for folder in OLD_ADDONS:
		if DirAccess.dir_exists_absolute(folder):
			push_warning("[Guidon] %s is the old add-on from before 2.0 - its features are now part of addons/guidon. Disable it and delete the folder." % folder)
	_board = Board.new()
	_board.name = "Guidon"
	_board.enable_reporter = enable_reporter
	add_control_to_bottom_panel(_board, "Guidon")


func _exit_tree() -> void:
	if _board:
		remove_control_from_bottom_panel(_board)
		_board.queue_free()
		_board = null


func _disable_plugin() -> void:
	if ProjectSettings.has_setting("autoload/" + AUTOLOAD):
		remove_autoload_singleton(AUTOLOAD)


## Adds the GuidonReporter autoload (called by the panel after it saved the
## report settings). Idempotent.
func enable_reporter() -> void:
	if not _is_our_autoload():
		add_autoload_singleton(AUTOLOAD, REPORTER_PATH)


static func reporter_enabled() -> bool:
	return _is_our_autoload()


static func _is_our_autoload() -> bool:
	var value := str(ProjectSettings.get_setting("autoload/" + AUTOLOAD, ""))
	return value.trim_prefix("*") == REPORTER_PATH


## Settings keys stay "guidon_reports/..." from the old add-on, so a project
## that had reports set up keeps its configuration.
func _register_settings() -> void:
	var changed := false
	for setting in Reporter.SETTINGS:
		if not ProjectSettings.has_setting(setting.name):
			ProjectSettings.set_setting(setting.name, setting.default)
			changed = true
		ProjectSettings.set_initial_value(setting.name, setting.default)
		ProjectSettings.add_property_info(setting)
	if changed:
		ProjectSettings.save()


## A project that used the old guidon_reports add-on has the autoload
## pointing into its folder; point it here so deleting that folder doesn't
## break the game.
func _migrate_autoload() -> void:
	var value := str(ProjectSettings.get_setting("autoload/" + AUTOLOAD, ""))
	if value != "" and value.trim_prefix("*") != REPORTER_PATH:
		add_autoload_singleton(AUTOLOAD, REPORTER_PATH)

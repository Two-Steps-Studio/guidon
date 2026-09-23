@tool
extends EditorPlugin
## Registers the GuidonReporter autoload and its Project Settings
## (Project Settings > General > Guidon Reports, with Advanced Settings on).

const AUTOLOAD := "GuidonReporter"
const Reporter := preload("res://addons/guidon_reports/reporter.gd")


func _enable_plugin() -> void:
	add_autoload_singleton(AUTOLOAD, "res://addons/guidon_reports/reporter.gd")
	for setting in Reporter.SETTINGS:
		if not ProjectSettings.has_setting(setting.name):
			ProjectSettings.set_setting(setting.name, setting.default)
		ProjectSettings.set_initial_value(setting.name, setting.default)
		ProjectSettings.add_property_info(setting)
	ProjectSettings.save()


func _disable_plugin() -> void:
	remove_autoload_singleton(AUTOLOAD)

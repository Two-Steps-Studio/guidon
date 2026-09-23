@tool
extends RefCounted
## Machine-wide settings. In the editor they live in the Editor Settings
## (per user, outside the project), so the API key can't end up committed
## with the game. Outside the editor (the headless tests) a ConfigFile in
## user:// stands in.

const PREFIX := "guidon/"
const TEST_FILE := "user://guidon_test_settings.cfg"

static var _config: ConfigFile


static func get_value(key: String, default: String = "") -> String:
	if Engine.is_editor_hint():
		var settings := EditorInterface.get_editor_settings()
		return str(settings.get_setting(PREFIX + key)) if settings.has_setting(PREFIX + key) else default
	_load_config()
	return str(_config.get_value("guidon", key, default))


static func set_value(key: String, value: String) -> void:
	if Engine.is_editor_hint():
		EditorInterface.get_editor_settings().set_setting(PREFIX + key, value)
		return
	_load_config()
	_config.set_value("guidon", key, value)
	_config.save(TEST_FILE)


static func _load_config() -> void:
	if _config == null:
		_config = ConfigFile.new()
		_config.load(TEST_FILE)


static func base_url() -> String:
	return get_value("base_url", "https://useguidon.com")


static func api_key() -> String:
	return get_value("api_key")


static func is_logged_in() -> bool:
	return api_key() != "" and base_url() != ""

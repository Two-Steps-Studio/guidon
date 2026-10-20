@tool
extends RefCounted
## Thin async client for Guidon's /api/v1 - the same calls as the other
## editor plugins. Every call returns {"ok": bool, "data": Variant,
## "error": String} and never throws; `await` it.

## The built-in statuses and priorities - the fallback for older servers.
## A project can add its own (migration 060): any key matching KEY_PATTERN.
const STATUSES := ["backlog", "todo", "in_progress", "ai_working", "review", "done"]
const STATUS_LABELS := {
	"backlog": "Backlog", "todo": "Todo", "in_progress": "In Progress",
	"ai_working": "AI Working", "review": "Review", "done": "Done",
}
## Most important first, like GET .../priorities.
const PRIORITIES := ["critical", "high", "medium", "low"]
const PRIORITY_LABELS := {"critical": "Critical", "high": "High", "medium": "Medium", "low": "Low"}
const KEY_PATTERN := "^[a-z][a-z0-9_]{0,39}$"
const MAX_IMAGE_BYTES := 20 * 1024 * 1024

var _host: Node
var _base_url: String
var _api_key: String


func _init(host: Node, base_url: String, api_key: String) -> void:
	_host = host
	_base_url = base_url.strip_edges().trim_suffix("/")
	_api_key = api_key


## Columns are {status, label, is_done, color}; color is a hex string or "" (built-in colour).
static func default_columns() -> Array:
	var columns := []
	for status in STATUSES:
		columns.append({"status": status, "label": STATUS_LABELS[status], "is_done": status == "done", "color": ""})
	return columns


## Priorities are {key, label, color}, most important first; color is a hex string or "".
static func default_priorities() -> Array:
	var priorities := []
	for key in PRIORITIES:
		priorities.append({"key": key, "label": PRIORITY_LABELS[key], "color": ""})
	return priorities


## A status/priority key the server can accept (built-in or a project's own).
static func is_valid_key(value) -> bool:
	return value is String and RegEx.create_from_string(KEY_PATTERN).search(value) != null


func list_projects() -> Dictionary:
	return _field(await _send(HTTPClient.METHOD_GET, "/api/v1/projects"), "projects", [])


func list_tasks(project_id: String) -> Dictionary:
	return _field(await _send(HTTPClient.METHOD_GET, "/api/v1/projects/%s/tasks" % project_id), "tasks", [])


## The project's visible columns in board order, custom ones included. Older
## servers send only {status, label}: then "done" is the only done column.
## Malformed entries are skipped; nothing usable -> defaults.
func list_columns(project_id: String) -> Dictionary:
	var result := _field(await _send(HTTPClient.METHOD_GET, "/api/v1/projects/%s/columns" % project_id), "columns", [])
	if not result.ok:
		return result
	var columns := []
	var seen := {}
	for column in (result.data if result.data is Array else []):
		if not column is Dictionary or not is_valid_key(column.get("status")) or seen.has(column.status):
			continue
		var status: String = column.status
		seen[status] = true
		var label = column.get("label")
		var is_done = column.get("is_done")
		columns.append({
			"status": status,
			"label": label if label is String and label != "" else STATUS_LABELS.get(status, status),
			"is_done": is_done if is_done is bool else status == "done",
			"color": _hex(column.get("color")),
		})
	result.data = columns if not columns.is_empty() else default_columns()
	return result


## The project's visible priorities, most important first. Fails (404) on
## servers from before custom priorities - callers fall back to default_priorities().
func list_priorities(project_id: String) -> Dictionary:
	var result := _field(await _send(HTTPClient.METHOD_GET, "/api/v1/projects/%s/priorities" % project_id), "priorities", [])
	if not result.ok:
		return result
	var priorities := []
	var seen := {}
	for priority in (result.data if result.data is Array else []):
		if not priority is Dictionary or not is_valid_key(priority.get("key")) or seen.has(priority.key):
			continue
		var key: String = priority.key
		seen[key] = true
		var label = priority.get("label")
		priorities.append({
			"key": key,
			"label": label if label is String and label != "" else PRIORITY_LABELS.get(key, key),
			"color": _hex(priority.get("color")),
		})
	result.data = priorities if not priorities.is_empty() else default_priorities()
	return result


func create_task(project_id: String, title: String, status: String = "", parent_task_id: String = "") -> Dictionary:
	var body := {"title": title}
	if status != "":
		body.status = status
	if parent_task_id != "":
		body.parent_task_id = parent_task_id
	return _field(await _send(HTTPClient.METHOD_POST, "/api/v1/projects/%s/tasks" % project_id, body), "task", null)


## PATCH title/description/priority/due_date/sort_order - only the keys given are sent.
func update_task(task_id: String, fields: Dictionary) -> Dictionary:
	return _field(await _send(HTTPClient.METHOD_PATCH, "/api/v1/tasks/%s" % task_id, fields), "task", null)


func set_status(task_id: String, status: String) -> Dictionary:
	return _field(await _send(HTTPClient.METHOD_PATCH, "/api/v1/tasks/%s/status" % task_id, {"status": status}), "task", null)


func delete_task(task_id: String) -> Dictionary:
	return await _send(HTTPClient.METHOD_DELETE, "/api/v1/tasks/%s" % task_id)


## The project's moodboard, newest first. Each `image_url` is signed and short-lived.
func list_references(project_id: String) -> Dictionary:
	return _field(await _send(HTTPClient.METHOD_GET, "/api/v1/projects/%s/references" % project_id), "references", [])


## Downloads a signed moodboard image. No API key is sent - the URL carries its
## own signature. data = PackedByteArray on success.
func fetch_image(url: String) -> Dictionary:
	if not (url.begins_with("https://") or url.begins_with("http://")):
		return {"ok": false, "data": null, "error": "No image URL."}
	if not is_instance_valid(_host) or not _host.is_inside_tree():
		return {"ok": false, "data": null, "error": "Guidon panel is closed."}
	var http := HTTPRequest.new()
	http.timeout = 30.0
	http.body_size_limit = MAX_IMAGE_BYTES
	_host.add_child(http)
	var err := http.request(url, PackedStringArray(["User-Agent: Guidon-Godot/2.0"]))
	if err != OK:
		http.queue_free()
		return {"ok": false, "data": null, "error": "Invalid request (%s)." % error_string(err)}
	var response: Array = await http.request_completed
	http.queue_free()
	if response[0] != HTTPRequest.RESULT_SUCCESS:
		return {"ok": false, "data": null, "error": "Download failed (%s)." % _result_name(response[0])}
	if response[1] < 200 or response[1] >= 300:
		return {"ok": false, "data": null, "error": "Download failed (%d)." % response[1]}
	return {"ok": true, "data": response[3], "error": ""}


## Decodes PNG/JPEG/WebP/BMP bytes; null for anything else (GIF, SVG) or corrupt data.
static func decode_image(bytes: PackedByteArray, mime_type: String) -> Image:
	var image := Image.new()
	var err := ERR_FILE_UNRECOGNIZED
	match mime_type.to_lower():
		"image/png": err = image.load_png_from_buffer(bytes)
		"image/jpeg": err = image.load_jpg_from_buffer(bytes)
		"image/webp": err = image.load_webp_from_buffer(bytes)
		"image/bmp": err = image.load_bmp_from_buffer(bytes)
	return image if err == OK else null


func list_comments(task_id: String) -> Dictionary:
	return _field(await _send(HTTPClient.METHOD_GET, "/api/v1/tasks/%s/comment" % task_id), "comments", [])


func add_comment(task_id: String, content: String) -> Dictionary:
	return _field(await _send(HTTPClient.METHOD_POST, "/api/v1/tasks/%s/comment" % task_id, {"content": content}), "comment", null)


## A reports:write key bound to this project, for the in-game reporter (the
## full key comes back once). Needs owner/admin/developer in the project.
func create_report_key(project_id: String) -> Dictionary:
	return _field(await _send(HTTPClient.METHOD_POST, "/api/v1/projects/%s/report-keys" % project_id, {"client": "godot"}), "key", "")


func _send(method: int, path: String, body = null) -> Dictionary:
	if _base_url == "" or _api_key == "":
		return {"ok": false, "data": null, "error": "Log in first."}
	if not is_instance_valid(_host) or not _host.is_inside_tree():
		return {"ok": false, "data": null, "error": "Guidon panel is closed."}

	var http := HTTPRequest.new()
	http.timeout = 20.0
	_host.add_child(http)
	var headers := PackedStringArray(["Authorization: Bearer " + _api_key, "Accept: application/json", "User-Agent: Guidon-Godot/2.0"])
	var payload := ""
	if body != null:
		headers.append("Content-Type: application/json")
		payload = JSON.stringify(body)
	var err := http.request(_base_url + path, headers, method, payload)
	if err != OK:
		http.queue_free()
		return {"ok": false, "data": null, "error": "Invalid request (%s)." % error_string(err)}

	var response: Array = await http.request_completed
	http.queue_free()
	var result: int = response[0]
	var code: int = response[1]
	var text: String = (response[3] as PackedByteArray).get_string_from_utf8()
	if result != HTTPRequest.RESULT_SUCCESS:
		return {"ok": false, "data": null, "error": "Request failed (%s)." % _result_name(result)}

	var parsed = JSON.parse_string(text) if text != "" else {}
	if code < 200 or code >= 300:
		var server_error := ""
		if parsed is Dictionary and parsed.get("error") is String:
			server_error = parsed.error
		return {"ok": false, "data": null, "error": ("%d %s" % [code, server_error]).strip_edges()}
	if not parsed is Dictionary:
		return {"ok": false, "data": null, "error": "Malformed response from the Guidon server."}
	return {"ok": true, "data": parsed, "error": ""}


func _field(result: Dictionary, key: String, default) -> Dictionary:
	if not result.ok:
		return result
	var value = result.data.get(key, default)
	result.data = value if value != null else default
	return result


static func _result_name(result: int) -> String:
	match result:
		HTTPRequest.RESULT_CANT_CONNECT: return "can't connect"
		HTTPRequest.RESULT_CANT_RESOLVE: return "can't resolve host"
		HTTPRequest.RESULT_CONNECTION_ERROR: return "connection error"
		HTTPRequest.RESULT_TLS_HANDSHAKE_ERROR: return "TLS handshake error"
		HTTPRequest.RESULT_TIMEOUT: return "timeout"
		_: return "error %d" % result


## Board order within a column: sort_order, ties keep the API's newest-first order.
static func column_tasks(tasks: Array, status: String) -> Array:
	var out := []
	for task in tasks:
		if task.get("status") == status and not _str(task.get("parent_task_id")):
			out.append(task)
	var indexed := []
	for i in out.size():
		indexed.append([_num(out[i].get("sort_order")), i, out[i]])
	indexed.sort_custom(func(a, b): return a[0] < b[0] or (a[0] == b[0] and a[1] < b[1]))
	return indexed.map(func(entry): return entry[2])


## Whether a task counts as finished: the task's own `is_done` (newer servers),
## else its column's, else status == "done".
static func is_task_done(task: Dictionary, columns: Array) -> bool:
	var is_done = task.get("is_done")
	if is_done is bool:
		return is_done
	var status := _str(task.get("status"))
	for column in columns:
		if column.status == status:
			return column.get("is_done", status == "done")
	return status == "done"


## The column a subtask's checkbox ticks into: the first done column on the board, else "done".
static func done_status(columns: Array) -> String:
	for column in columns:
		if column.get("is_done", false):
			return column.status
	return "done"


## Where unticking a subtask puts it: "todo" if the board shows it, else its first open column.
static func open_status(columns: Array) -> String:
	var first := ""
	for column in columns:
		if column.get("is_done", false):
			continue
		if column.status == "todo":
			return "todo"
		if first == "":
			first = column.status
	return first if first != "" else "todo"


## {key, label, color} for a priority key; unknown keys (hidden, or another
## project's) still render, labelled with the key. Empty -> medium.
static func priority_info(priorities: Array, key: String) -> Dictionary:
	if key == "":
		key = "medium"
	for priority in priorities:
		if priority.key == key:
			return priority
	return {"key": key, "label": PRIORITY_LABELS.get(key, key), "color": ""}


## Importance rank (0 = most important) = position in the project's list;
## unknown keys sort after every known one.
static func priority_rank(priorities: Array, key: String) -> int:
	for i in priorities.size():
		if priorities[i].key == key:
			return i
	return priorities.size()


## Tasks filed by the in-game reporter or the web widget (POST .../reports tags them).
static func is_report(task: Dictionary) -> bool:
	var tags = task.get("tags")
	return tags is Array and (tags.has("in-game") or tags.has("web"))


static func subtasks(tasks: Array, parent_id: String) -> Array:
	var out := tasks.filter(func(task): return _str(task.get("parent_task_id")) == parent_id)
	out.sort_custom(func(a, b): return _str(a.get("created_at")) < _str(b.get("created_at")))
	return out


static func append_sort_order(column: Array) -> float:
	if column.is_empty():
		return 1000.0
	var highest := -INF
	for task in column:
		highest = maxf(highest, _num(task.get("sort_order")))
	return highest + 100.0


## `guidon#1a2b3c4d` - what the GitHub integration recognises in commits, PRs and branch names.
static func git_ref(task_id: String) -> String:
	return "guidon#" + task_id.substr(0, 8).to_lower()


static func _str(value) -> String:
	return "" if value == null else str(value)


## A colour from the API as "#rrggbb" if Godot can parse it, else "".
static func _hex(value) -> String:
	return value if value is String and value != "" and Color.html_is_valid(value) else ""


static func _num(value) -> float:
	return float(value) if value is float or value is int else 0.0

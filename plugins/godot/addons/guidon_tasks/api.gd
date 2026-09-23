@tool
extends RefCounted
## Thin async client for Guidon's /api/v1 - the same calls as the other
## editor plugins. Every call returns {"ok": bool, "data": Variant,
## "error": String} and never throws; `await` it.

const STATUSES := ["backlog", "todo", "in_progress", "ai_working", "review", "done"]
const STATUS_LABELS := {
	"backlog": "Backlog", "todo": "Todo", "in_progress": "In Progress",
	"ai_working": "AI Working", "review": "Review", "done": "Done",
}
const PRIORITIES := ["low", "medium", "high", "critical"]

var _host: Node
var _base_url: String
var _api_key: String


func _init(host: Node, base_url: String, api_key: String) -> void:
	_host = host
	_base_url = base_url.strip_edges().trim_suffix("/")
	_api_key = api_key


static func default_columns() -> Array:
	var columns := []
	for status in STATUSES:
		columns.append({"status": status, "label": STATUS_LABELS[status]})
	return columns


func list_projects() -> Dictionary:
	return _field(await _send(HTTPClient.METHOD_GET, "/api/v1/projects"), "projects", [])


func list_tasks(project_id: String) -> Dictionary:
	return _field(await _send(HTTPClient.METHOD_GET, "/api/v1/projects/%s/tasks" % project_id), "tasks", [])


## The project's visible columns in board order; unknown statuses dropped, empty -> defaults.
func list_columns(project_id: String) -> Dictionary:
	var result := _field(await _send(HTTPClient.METHOD_GET, "/api/v1/projects/%s/columns" % project_id), "columns", [])
	if not result.ok:
		return result
	var columns := []
	var seen := {}
	for column in result.data:
		if column is Dictionary and STATUSES.has(column.get("status")) and not seen.has(column.status):
			seen[column.status] = true
			var label = column.get("label")
			columns.append({"status": column.status, "label": label if label is String and label != "" else STATUS_LABELS[column.status]})
	result.data = columns if not columns.is_empty() else default_columns()
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


func list_comments(task_id: String) -> Dictionary:
	return _field(await _send(HTTPClient.METHOD_GET, "/api/v1/tasks/%s/comment" % task_id), "comments", [])


func add_comment(task_id: String, content: String) -> Dictionary:
	return _field(await _send(HTTPClient.METHOD_POST, "/api/v1/tasks/%s/comment" % task_id, {"content": content}), "comment", null)


func _send(method: int, path: String, body = null) -> Dictionary:
	if _base_url == "" or _api_key == "":
		return {"ok": false, "data": null, "error": "Log in first."}
	if not is_instance_valid(_host) or not _host.is_inside_tree():
		return {"ok": false, "data": null, "error": "Guidon panel is closed."}

	var http := HTTPRequest.new()
	http.timeout = 20.0
	_host.add_child(http)
	var headers := PackedStringArray(["Authorization: Bearer " + _api_key, "Accept: application/json", "User-Agent: GuidonTasks-Godot/1.0"])
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


static func _num(value) -> float:
	return float(value) if value is float or value is int else 0.0

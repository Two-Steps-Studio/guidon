@tool
extends RefCounted
## Browser login - the same loopback flow as the other Guidon plugins
## (and `gh auth login`): listen on 127.0.0.1, open
## /auth/plugin-login?client=godot with that listener as redirect_uri, and
## receive the issued API key once the user clicks Authorize. The plugin
## never sees a password. Returns {"ok", "api_key", "email", "error"}.

const PORT_FIRST := 51820
const PORT_LAST := 51829
const TIMEOUT_MSEC := 5 * 60 * 1000

var cancelled := false


func login(host: Node, base_url: String, open_url: Callable = Callable()) -> Dictionary:
	base_url = base_url.strip_edges().trim_suffix("/")
	if base_url == "":
		return _fail("Set a base URL first.")

	var server := TCPServer.new()
	var port := -1
	for candidate in range(PORT_FIRST, PORT_LAST + 1):
		if server.listen(candidate, "127.0.0.1") == OK:
			port = candidate
			break
	if port < 0:
		return _fail("Could not open a local port for browser login (tried %d-%d). Close any other Guidon login attempt and try again." % [PORT_FIRST, PORT_LAST])

	var state := _random_state()
	var redirect_uri := "http://127.0.0.1:%d/callback" % port
	var url := "%s/auth/plugin-login?redirect_uri=%s&state=%s&client=godot" % [base_url, redirect_uri.uri_encode(), state]
	if open_url.is_valid():
		open_url.call(url)
	elif OS.shell_open(url) != OK:
		server.stop()
		return _fail("Could not open a browser. Open this URL manually: " + url)

	var deadline := Time.get_ticks_msec() + TIMEOUT_MSEC
	var result := {}
	while result.is_empty():
		if cancelled:
			result = _fail("Login cancelled.")
		elif Time.get_ticks_msec() > deadline:
			result = _fail("Login timed out - no response from the browser within 5 minutes.")
		elif server.is_connection_available():
			var peer := server.take_connection()
			var params := await _read_request(host, peer)
			var ok: bool = params.get("apiKey", "") != "" and params.get("state", "") == state
			_respond(peer, ok)
			if params.has("__path") and params.__path != "/callback":
				continue  # e.g. a favicon request - keep waiting
			result = {"ok": true, "api_key": params.apiKey, "email": params.get("email", ""), "error": ""} if ok \
				else _fail("Login was not completed, or the response could not be verified.")
		else:
			await host.get_tree().process_frame
	server.stop()
	return result


func _read_request(host: Node, peer: StreamPeerTCP) -> Dictionary:
	var raw := ""
	var deadline := Time.get_ticks_msec() + 5000
	while Time.get_ticks_msec() < deadline and raw.find("\r\n\r\n") < 0:
		peer.poll()
		var available := peer.get_available_bytes()
		if available > 0:
			raw += peer.get_utf8_string(available)
		else:
			await host.get_tree().process_frame
	# "GET /callback?apiKey=...&state=... HTTP/1.1"
	var target := raw.get_slice("\r\n", 0).get_slice(" ", 1)
	var params := {"__path": target.get_slice("?", 0)}
	var query := target.get_slice("?", 1) if target.contains("?") else ""
	for pair in query.split("&", false):
		params[pair.get_slice("=", 0).uri_decode()] = pair.get_slice("=", 1).replace("+", " ").uri_decode() if pair.contains("=") else ""
	return params


func _respond(peer: StreamPeerTCP, ok: bool) -> void:
	var title := "Logged in" if ok else "Login failed"
	var message := "You're logged in - you can close this tab and return to Godot." if ok \
		else "Something went wrong - return to Godot and try again."
	var html := ("<html><head><title>Guidon</title></head><body style=\"font-family:sans-serif;text-align:center;padding-top:80px;\">"
		+ "<h2>%s</h2><p>%s</p></body></html>") % [title, message]
	var body := html.to_utf8_buffer()
	var head := "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n" % body.size()
	peer.put_data(head.to_utf8_buffer())
	peer.put_data(body)
	peer.disconnect_from_host()


static func _random_state() -> String:
	var crypto := Crypto.new()
	return crypto.generate_random_bytes(16).hex_encode()


static func _fail(message: String) -> Dictionary:
	return {"ok": false, "api_key": "", "email": "", "error": message}

package com.useguidon.tasks.core

import com.sun.net.httpserver.HttpServer
import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets.UTF_8
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicBoolean

data class LoginResult(val apiKey: String, val email: String)

/**
 * Browser login - the same loopback flow as the Unity plugin's
 * GuidonBrowserAuth.cs (and `gh auth login`): bind a short-lived HTTP
 * listener on 127.0.0.1 (the JDK's built-in server, no dependency), open
 * /auth/plugin-login?client=jetbrains with it as redirect_uri, and receive
 * the issued API key back once the user clicks Authorize. The plugin never
 * sees a password.
 *
 * Blocks for up to [timeoutMillis] - call it from a background thread.
 */
object LoopbackLogin {
    val portRange = 51820..51829
    const val DEFAULT_TIMEOUT_MILLIS = 5 * 60 * 1000L

    fun login(
        baseUrl: String,
        openBrowser: (String) -> Unit,
        cancelled: AtomicBoolean = AtomicBoolean(false),
        timeoutMillis: Long = DEFAULT_TIMEOUT_MILLIS,
    ): ApiResult<LoginResult> {
        val base = baseUrl.trim().trimEnd('/')
        if (base.isEmpty()) return ApiResult.Err("Set a base URL first.")

        val server = bind() ?: return ApiResult.Err(
            "Could not open a local port for browser login (tried ${portRange.first}-${portRange.last}). " +
                "Close any other Guidon login attempt and try again."
        )

        try {
            val state = UUID.randomUUID().toString().replace("-", "")
            val received = CompletableFuture<Map<String, String>>()

            server.createContext("/callback") { exchange ->
                val params = parseQuery(exchange.requestURI.rawQuery)
                val ok = !params["apiKey"].isNullOrEmpty() && params["state"] == state
                val (title, message) = if (ok) {
                    "Logged in" to "You're logged in - you can close this tab and return to your IDE."
                } else {
                    "Login failed" to "Something went wrong - return to your IDE and try again."
                }
                val html = "<html><head><title>Guidon</title></head>" +
                    "<body style=\"font-family:sans-serif;text-align:center;padding-top:80px;\">" +
                    "<h2>$title</h2><p>$message</p></body></html>"
                val bytes = html.toByteArray(UTF_8)
                exchange.responseHeaders.add("Content-Type", "text/html; charset=utf-8")
                exchange.sendResponseHeaders(200, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
                received.complete(if (ok) params else emptyMap())
            }
            server.start()

            val redirectUri = "http://127.0.0.1:${server.address.port}/callback"
            val url = "$base/auth/plugin-login?redirect_uri=${encode(redirectUri)}&state=$state&client=jetbrains"
            try {
                openBrowser(url)
            } catch (e: Exception) {
                return ApiResult.Err("Could not open a browser: ${e.message}")
            }

            val deadline = System.currentTimeMillis() + timeoutMillis
            while (true) {
                if (cancelled.get()) return ApiResult.Err("Login cancelled.")
                val remaining = deadline - System.currentTimeMillis()
                if (remaining <= 0) return ApiResult.Err("Login timed out - no response from the browser within ${timeoutMillis / 60000} minutes.")
                val params = try {
                    received.get(minOf(remaining, 250L), TimeUnit.MILLISECONDS)
                } catch (e: TimeoutException) {
                    continue
                }
                return if (params.isEmpty()) {
                    ApiResult.Err("Login was not completed, or the response could not be verified.")
                } else {
                    ApiResult.Ok(LoginResult(params.getValue("apiKey"), params["email"].orEmpty()))
                }
            }
        } finally {
            server.stop(0)
        }
    }

    private fun bind(): HttpServer? {
        for (port in portRange) {
            try {
                return HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), port), 0)
            } catch (e: IOException) {
                // In use (e.g. another editor mid-login) - try the next one.
            }
        }
        return null
    }

    private fun encode(value: String) = URLEncoder.encode(value, UTF_8)

    internal fun parseQuery(raw: String?): Map<String, String> =
        raw.orEmpty().split('&').filter { it.isNotEmpty() }.associate { pair ->
            val key = pair.substringBefore('=')
            val value = pair.substringAfter('=', "")
            URLDecoder.decode(key, UTF_8) to URLDecoder.decode(value, UTF_8)
        }
}

package com.useguidon.tasks.core

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * Thin blocking client for Guidon's /api/v1 - the same calls as the Unity
 * plugin's GuidonApiClient.cs. java.net.http + Gson (bundled with the
 * IntelliJ Platform), so no extra dependency ships with the plugin.
 *
 * Blocking on purpose: the UI calls it from a pooled thread and hands the
 * result back to the EDT. Nothing here throws - every failure (network,
 * non-2xx, malformed JSON) comes back as ApiResult.Err.
 */
class GuidonApi(baseUrl: String, private val apiKey: String, private val http: HttpClient = defaultClient) {
    private val baseUrl = baseUrl.trim().trimEnd('/')

    fun listProjects(): ApiResult<List<GuidonProject>> =
        send("GET", "/api/v1/projects").map { body -> body.array("projects").map { parseProject(it.asJsonObject) } }

    fun listTasks(projectId: String): ApiResult<List<GuidonTask>> =
        send("GET", "/api/v1/projects/$projectId/tasks").map { body -> body.array("tasks").map { parseTask(it.asJsonObject) } }

    /**
     * The project's visible columns in board order (its label/order/hidden
     * overrides applied server-side). Unknown statuses are dropped; an empty
     * answer falls back to the defaults.
     */
    fun listColumns(projectId: String): ApiResult<List<BoardColumn>> =
        send("GET", "/api/v1/projects/$projectId/columns").map { body ->
            body.array("columns")
                .mapNotNull { element ->
                    val column = element.takeIf { it.isJsonObject }?.asJsonObject ?: return@mapNotNull null
                    val status = column.str("status").takeIf { it in Vocabulary.statuses } ?: return@mapNotNull null
                    BoardColumn(status, column.str("label").ifEmpty { Vocabulary.statusLabel(status) })
                }
                .distinctBy { it.status }
                .ifEmpty { Vocabulary.defaultColumns }
        }

    /** Empty parentTaskId creates a top-level task in [status]; a real id creates a subtask (the API ignores status/priority for those). */
    fun createTask(
        projectId: String,
        title: String,
        status: String = "",
        parentTaskId: String = "",
        description: String = "",
        priority: String = "",
        dueDate: String = "",
    ): ApiResult<GuidonTask> {
        val body = JsonObject().apply {
            addProperty("title", title)
            // Empty optionals are simply left out.
            if (description.isNotEmpty()) addProperty("description", description)
            if (priority.isNotEmpty()) addProperty("priority", priority)
            if (dueDate.isNotEmpty()) addProperty("due_date", dueDate)
            if (parentTaskId.isNotEmpty()) addProperty("parent_task_id", parentTaskId)
            if (status.isNotEmpty()) addProperty("status", status)
        }
        return send("POST", "/api/v1/projects/$projectId/tasks", body).map { parseTask(it.obj("task")) }
    }

    /** PATCH title/description/priority/due_date. An empty dueDate clears it. */
    fun updateTaskFields(taskId: String, title: String, description: String, priority: String, dueDate: String): ApiResult<GuidonTask> {
        val body = JsonObject().apply {
            addProperty("title", title)
            addProperty("description", description)
            addProperty("priority", priority)
            addProperty("due_date", dueDate)
        }
        return send("PATCH", "/api/v1/tasks/$taskId", body).map { parseTask(it.obj("task")) }
    }

    /** Commits a drag-and-drop position - only sort_order changes. */
    fun updateSortOrder(taskId: String, sortOrder: Double): ApiResult<GuidonTask> =
        send("PATCH", "/api/v1/tasks/$taskId", JsonObject().apply { addProperty("sort_order", sortOrder) })
            .map { parseTask(it.obj("task")) }

    fun setStatus(taskId: String, status: String): ApiResult<GuidonTask> =
        send("PATCH", "/api/v1/tasks/$taskId/status", JsonObject().apply { addProperty("status", status) })
            .map { parseTask(it.obj("task")) }

    fun deleteTask(taskId: String): ApiResult<Unit> = send("DELETE", "/api/v1/tasks/$taskId").map { }

    fun listComments(taskId: String): ApiResult<List<GuidonComment>> =
        send("GET", "/api/v1/tasks/$taskId/comment").map { body -> body.array("comments").map { parseComment(it.asJsonObject) } }

    fun addComment(taskId: String, content: String): ApiResult<GuidonComment> =
        send("POST", "/api/v1/tasks/$taskId/comment", JsonObject().apply { addProperty("content", content) })
            .map { parseComment(it.obj("comment")) }

    private fun send(verb: String, path: String, body: JsonObject? = null): ApiResult<JsonObject> {
        if (baseUrl.isEmpty() || apiKey.isEmpty()) return ApiResult.Err("Log in first.")

        val request = try {
            HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(Duration.ofSeconds(20))
                .header("Authorization", "Bearer $apiKey")
                .header("Accept", "application/json")
                .header("User-Agent", "GuidonTasks-JetBrains/1.0")
                .apply {
                    if (body != null) header("Content-Type", "application/json")
                    method(verb, body?.let { HttpRequest.BodyPublishers.ofString(it.toString()) } ?: HttpRequest.BodyPublishers.noBody())
                }
                .build()
        } catch (e: IllegalArgumentException) {
            return ApiResult.Err("Invalid base URL: $baseUrl")
        }

        val response = try {
            http.send(request, HttpResponse.BodyHandlers.ofString())
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            return ApiResult.Err("Request interrupted.")
        } catch (e: Exception) {
            return ApiResult.Err("Request failed: ${e.message ?: e.javaClass.simpleName}")
        }

        val json = runCatching { JsonParser.parseString(response.body()).asJsonObject }.getOrNull()
        if (response.statusCode() !in 200..299) {
            val serverError = json?.str("error").orEmpty()
            return ApiResult.Err("${response.statusCode()} $serverError".trim())
        }
        return json?.let { ApiResult.Ok(it) } ?: ApiResult.Err("Malformed response from the Guidon server.")
    }

    companion object {
        val defaultClient: HttpClient = HttpClient.newBuilder()
            // HTTP/1.1 on purpose: over plain http:// (a self-hosted or local
            // Guidon) java.net.http's default HTTP/2 sends an `Upgrade: h2c`
            // request that Node's server - Next.js included - answers by
            // dropping the connection ("header parser received no bytes").
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build()

        fun parseProject(o: JsonObject) = GuidonProject(id = o.str("id"), name = o.str("name"))

        fun parseTask(o: JsonObject) = GuidonTask(
            id = o.str("id"),
            projectId = o.str("project_id"),
            title = o.str("title"),
            description = o.str("description"),
            status = o.str("status"),
            priority = o.str("priority"),
            dueDate = o.str("due_date"),
            parentTaskId = o.str("parent_task_id"),
            createdAt = o.str("created_at"),
            tags = o.array("tags").mapNotNull { runCatching { it.asString }.getOrNull() },
            sortOrder = o.get("sort_order")?.takeUnless { it.isJsonNull }?.let { runCatching { it.asDouble }.getOrNull() } ?: 0.0,
        )

        fun parseComment(o: JsonObject) = GuidonComment(
            id = o.str("id"),
            content = o.str("content"),
            createdAt = o.str("created_at"),
            actorLabel = o.str("actor_label"),
        )
    }
}

private inline fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> = when (this) {
    is ApiResult.Ok -> try {
        ApiResult.Ok(transform(value))
    } catch (e: Exception) {
        // Missing/odd-typed field in an otherwise 2xx response.
        ApiResult.Err("Unexpected response from the Guidon server: ${e.message ?: e.javaClass.simpleName}")
    }
    is ApiResult.Err -> this
}

/** String field, "" for missing or JSON null (the API sends null for empty optional columns). */
internal fun JsonObject.str(key: String): String {
    val element: JsonElement? = get(key)
    return if (element == null || element.isJsonNull || !element.isJsonPrimitive) "" else element.asString
}

internal fun JsonObject.array(key: String): JsonArray {
    val element = get(key)
    return if (element != null && element.isJsonArray) element.asJsonArray else JsonArray()
}

internal fun JsonObject.obj(key: String): JsonObject {
    val element = get(key)
    require(element != null && element.isJsonObject) { "no \"$key\" object" }
    return element.asJsonObject
}

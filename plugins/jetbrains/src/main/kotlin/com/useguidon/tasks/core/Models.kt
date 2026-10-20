package com.useguidon.tasks.core

/** Every API call returns this instead of throwing - see GuidonApi. */
sealed class ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>()
    data class Err(val message: String) : ApiResult<Nothing>()
}

data class GuidonProject(val id: String, val name: String) {
    override fun toString() = name // what JComboBox shows without a custom renderer
}

data class GuidonTask(
    val id: String,
    val projectId: String,
    val title: String,
    val description: String,
    val status: String,
    val priority: String,
    val dueDate: String,
    val parentTaskId: String,
    val createdAt: String,
    val tags: List<String>,
    /** Fractional on purpose - the web board inserts at midpoints (task-board.ts sortOrderForPosition). */
    val sortOrder: Double,
    /**
     * The server's `is_done` (true when the task sits in a done column, which a
     * project can define itself). null when an older server doesn't send it -
     * then Board.isDone falls back to the column list / `status == "done"`.
     */
    val isDone: Boolean? = null,
) {
    val isSubtask get() = parentTaskId.isNotEmpty()
}

/** A moodboard image (GET /api/v1/projects/{id}/references). imageUrl is signed and short-lived - download it right away. */
data class GuidonReference(
    val id: String,
    val name: String,
    val caption: String,
    val tags: List<String>,
    val sourceUrl: String,
    val mimeType: String,
    val imageUrl: String,
) {
    val displayName get() = caption.ifEmpty { name }
}

/**
 * One visible board column (GET /api/v1/projects/{id}/columns): a built-in or
 * project-defined status key with its label. [isDone] marks a column whose
 * tasks count as finished; [color] is the project's "#rrggbb" or "" for the
 * built-in colour. Older servers send only status/label - the defaults then
 * make `done` the only done column.
 */
data class BoardColumn(
    val status: String,
    val label: String,
    val isDone: Boolean = status == "done",
    val custom: Boolean = false,
    val color: String = "",
)

/**
 * One task priority (GET /api/v1/projects/{id}/priorities). The list comes
 * most important first, so its index is the rank. [color] is "#rrggbb" or ""
 * for the plugin's built-in colour of that key.
 */
data class PriorityOption(
    val key: String,
    val label: String,
    val color: String = "",
    val custom: Boolean = false,
)

data class GuidonComment(
    val id: String,
    val content: String,
    val createdAt: String,
    val actorLabel: String,
)

/**
 * Guidon's built-in task vocabulary, mirrored by hand from
 * src/lib/work/task-board.ts (BOARD_COLUMNS / TASK_PRIORITIES) - a
 * manual-sync point, same as the Unity plugin's GuidonVocabulary. Projects can
 * add their own statuses and priorities (migration 060), so these are only
 * the fallback when the server can't say; any other key is kept as-is and
 * shown with its key as label and a neutral colour.
 */
object Vocabulary {
    val statuses = listOf("backlog", "todo", "in_progress", "ai_working", "review", "done")

    /** Built-in priorities, most important first (task-board.ts PRIORITY_RANK). */
    val priorities = listOf("critical", "high", "medium", "low")

    /** What a project-defined status or priority key may look like (the server's own rule). */
    private val customKey = Regex("^[a-z][a-z0-9_]{0,39}$")

    fun isValidKey(key: String): Boolean = customKey.matches(key)

    fun statusLabel(status: String) = when (status) {
        "backlog" -> "Backlog"
        "todo" -> "Todo"
        "in_progress" -> "In Progress"
        "ai_working" -> "AI Working"
        "review" -> "Review"
        "done" -> "Done"
        else -> status
    }

    /** The project's label for [priority]; a built-in's default label; otherwise the raw key. */
    fun priorityLabel(priority: String, options: List<PriorityOption> = defaultPriorities): String =
        options.find { it.key == priority }?.label
            ?: if (priority in priorities) priority.replaceFirstChar { it.uppercase() } else priority

    /** The project's "#rrggbb" for [priority], or "" (built-in / unknown colour). */
    fun priorityColor(priority: String, options: List<PriorityOption>): String =
        options.find { it.key == priority }?.color.orEmpty()

    /** What the board shows when the server can't say (an older Guidon without the columns endpoint). */
    val defaultColumns = statuses.map { BoardColumn(it, statusLabel(it)) }

    /** What the pickers offer when the server can't say (an older Guidon without the priorities endpoint). */
    val defaultPriorities = priorities.map { PriorityOption(it, it.replaceFirstChar { c -> c.uppercase() }) }
}

/** Board ordering rules, shared by the UI and the tests. */
object Board {
    /** Top-level tasks of one column, by sort_order; ties keep the API's newest-first order. */
    fun column(tasks: List<GuidonTask>, status: String): List<GuidonTask> =
        tasks.filter { it.status == status && !it.isSubtask }.sortedBy { it.sortOrder }

    /**
     * Whether [task] counts as finished: the server's `is_done` when it sent
     * one, else its column's `is_done`, else (older servers) `status == "done"`.
     */
    fun isDone(task: GuidonTask, columns: List<BoardColumn>): Boolean =
        task.isDone ?: isDoneStatus(task.status, columns)

    /** Whether [status] is a done column of the project; `done` alone when the column list doesn't know it. */
    fun isDoneStatus(status: String, columns: List<BoardColumn>): Boolean =
        columns.find { it.status == status }?.isDone ?: (status == "done")

    /** Importance rank of [priority] in the project's list (0 = most important); unknown keys sort last. */
    fun priorityRank(priority: String, options: List<PriorityOption>): Int =
        options.indexOfFirst { it.key == priority }.let { if (it < 0) options.size else it }

    /** Filed by the website widget or an in-game reporter - the reports route tags it "web" or "in-game". */
    fun isReport(task: GuidonTask): Boolean = task.tags.any { it == "web" || it == "in-game" }

    fun subtasks(tasks: List<GuidonTask>, parentId: String): List<GuidonTask> =
        tasks.filter { it.parentTaskId == parentId }.sortedBy { it.createdAt }

    /** Append case of sortOrderForPosition: a card dropped at the end of a column goes 100 past the last one. */
    fun appendSortOrder(column: List<GuidonTask>): Double =
        column.maxOfOrNull { it.sortOrder }?.plus(100.0) ?: 1000.0

    /** First non-empty line of a Markdown description with markers stripped - the card preview the site shows. */
    fun descriptionPreview(description: String, maxLength: Int = 90): String {
        for (raw in description.lines()) {
            val line = raw.trim().trimStart('#', '-', '*', '>', ' ').replace("**", "").replace("`", "")
            if (line.isNotEmpty()) return if (line.length > maxLength) line.take(maxLength - 1) + "…" else line
        }
        return ""
    }

    /** `guidon#1a2b3c4d` - what the GitHub integration recognises in commits, PRs and branch names. */
    fun gitRef(taskId: String): String = "guidon#" + taskId.take(8).lowercase()

    private val isoDate = Regex("""\d{4}-\d{2}-\d{2}""")

    /** "" or YYYY-MM-DD - anything else would make the server's `new Date(...)` throw. */
    fun isValidDueDate(value: String): Boolean {
        if (value.isEmpty()) return true
        if (!isoDate.matches(value)) return false
        return runCatching { java.time.LocalDate.parse(value) }.isSuccess
    }
}

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
) {
    val isSubtask get() = parentTaskId.isNotEmpty()
}

/** One visible board column: a fixed status with the project's (possibly renamed) label. */
data class BoardColumn(val status: String, val label: String)

data class GuidonComment(
    val id: String,
    val content: String,
    val createdAt: String,
    val actorLabel: String,
)

/**
 * Guidon's task vocabulary, mirrored by hand from src/lib/work/task-board.ts
 * (BOARD_COLUMNS / TASK_PRIORITIES) - a manual-sync point, same as the
 * Unity plugin's GuidonVocabulary.
 */
object Vocabulary {
    val statuses = listOf("backlog", "todo", "in_progress", "ai_working", "review", "done")
    val priorities = listOf("low", "medium", "high", "critical")

    fun statusLabel(status: String) = when (status) {
        "backlog" -> "Backlog"
        "todo" -> "Todo"
        "in_progress" -> "In Progress"
        "ai_working" -> "AI Working"
        "review" -> "Review"
        "done" -> "Done"
        else -> status
    }

    fun priorityLabel(priority: String) = priority.replaceFirstChar { it.uppercase() }

    /** What the board shows when the server can't say (an older Guidon without the columns endpoint). */
    val defaultColumns = statuses.map { BoardColumn(it, statusLabel(it)) }
}

/** Board ordering rules, shared by the UI and the tests. */
object Board {
    /** Top-level tasks of one column, by sort_order; ties keep the API's newest-first order. */
    fun column(tasks: List<GuidonTask>, status: String): List<GuidonTask> =
        tasks.filter { it.status == status && !it.isSubtask }.sortedBy { it.sortOrder }

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

    private val isoDate = Regex("""\d{4}-\d{2}-\d{2}""")

    /** "" or YYYY-MM-DD - anything else would make the server's `new Date(...)` throw. */
    fun isValidDueDate(value: String): Boolean {
        if (value.isEmpty()) return true
        if (!isoDate.matches(value)) return false
        return runCatching { java.time.LocalDate.parse(value) }.isSuccess
    }
}

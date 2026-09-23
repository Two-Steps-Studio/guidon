package com.useguidon.tasks.ui

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.util.ui.JBUI
import com.useguidon.tasks.GuidonSettings
import com.useguidon.tasks.core.ApiResult
import com.useguidon.tasks.core.Board
import com.useguidon.tasks.core.BoardColumn
import com.useguidon.tasks.core.GuidonApi
import com.useguidon.tasks.core.GuidonComment
import com.useguidon.tasks.core.GuidonProject
import com.useguidon.tasks.core.GuidonTask
import com.useguidon.tasks.core.LoopbackLogin
import com.useguidon.tasks.core.Vocabulary
import java.awt.BorderLayout
import java.awt.CardLayout
import java.awt.Component
import java.awt.Cursor
import java.awt.Dimension
import java.awt.FlowLayout
import java.awt.GridBagLayout
import java.awt.GridLayout
import java.awt.Toolkit
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.StringSelection
import java.awt.dnd.DnDConstants
import java.awt.dnd.DragSource
import java.awt.dnd.DropTarget
import java.awt.dnd.DropTargetAdapter
import java.awt.dnd.DropTargetDragEvent
import java.awt.dnd.DropTargetDropEvent
import java.awt.dnd.DropTargetEvent
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.util.concurrent.atomic.AtomicBoolean
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.DefaultListCellRenderer
import javax.swing.JButton
import javax.swing.JCheckBox
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.JSplitPane
import javax.swing.JTextArea
import javax.swing.JTextField
import javax.swing.ScrollPaneConstants
import javax.swing.SwingUtilities
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener
import javax.swing.text.JTextComponent

/**
 * The whole Guidon tool window: toolbar (project picker, refresh, account),
 * the Kanban board, and a details panel for the selected task - the same
 * feature set as the Unity window.
 *
 * Threading: network calls run on pooled threads through [bg]; everything
 * else, including all state below, is touched on the EDT only. The board and
 * details are rebuilt from that state after each change (coalesced via
 * [scheduleRebuild]), which is simple and cheap at board sizes.
 */
class GuidonPanel(private val project: Project) : JPanel(BorderLayout()), Disposable {
    private companion object {
        const val DND_PREFIX = "guidon-task:"
        const val COLUMN_WIDTH = 270
        const val CARD_TEXT_WIDTH = 220
        const val MODE_LOADING = "loading"
        const val MODE_LOGIN = "login"
        const val MODE_BOARD = "board"
    }

    // --- state (EDT only)
    private var projects: List<GuidonProject> = emptyList()
    private var tasks: MutableList<GuidonTask> = mutableListOf()
    private var columns: List<BoardColumn> = Vocabulary.defaultColumns
    private val comments = mutableMapOf<String, List<GuidonComment>>()
    private var currentProjectId = GuidonSettings.projectId
    private var selectedTaskId = ""
    private var addingInStatus = ""
    private var pending = 0
    private var disposed = false
    private var keyLoaded = false
    private var loginCancel: AtomicBoolean? = null

    // Details edit buffers - survive rebuilds (e.g. comments arriving while you type), reset on selection change.
    private var editTitle = ""
    private var editDescription = ""
    private var editPriority = "medium"
    private var editDueDate = ""
    private var newSubtaskTitle = ""
    private var newComment = ""

    private var boardDirty = false
    private var detailsDirty = false
    private var rebuildQueued = false

    // --- widgets
    private val modes = CardLayout()
    private val modePanel = JPanel(modes)
    private val projectCombo = JComboBox<GuidonProject>()
    private var suppressComboEvents = false
    private val busyLabel = mutedLabel("Loading…")
    private val accountLabel = mutedLabel("")
    private val messageLabel = JLabel()
    private val messageBar = RoundedPanel(BorderLayout(), GuidonColors.errorFill, GuidonColors.destructive)
    private val toolbarControls = mutableListOf<JComponent>()
    private val boardPanel = JPanel().apply { layout = BoxLayout(this, BoxLayout.X_AXIS) }
    private val detailsPanel = JPanel(BorderLayout())
    private val baseUrlField = JTextField(GuidonSettings.baseUrl, 28)
    private val loginButton = GuidonButton("Log In")
    private val cancelLoginButton = JButton("Cancel")
    private var newTaskField: JTextField? = null

    init {
        add(buildHeader(), BorderLayout.NORTH)
        modePanel.add(centered(mutedLabel("Loading…")), MODE_LOADING)
        modePanel.add(buildLoginPanel(), MODE_LOGIN)
        modePanel.add(buildBoardArea(), MODE_BOARD)
        add(modePanel, BorderLayout.CENTER)
        modes.show(modePanel, MODE_LOADING)
        updateChrome()

        // The password safe may be slow (OS keychain) - read it off the EDT once.
        bg({ GuidonSettings.loadApiKey() }) {
            keyLoaded = true
            updateChrome()
            if (GuidonSettings.isLoggedIn) refreshProjects()
        }
    }

    override fun dispose() {
        disposed = true
        loginCancel?.set(true)
    }

    // --- plumbing --------------------------------------------------------------

    private fun api() = GuidonApi(GuidonSettings.baseUrl, GuidonSettings.apiKey)

    /** Runs [work] on a pooled thread, then [done] on the EDT (skipped once the tool window is gone). */
    private fun <T> bg(work: () -> T, done: (T) -> Unit) {
        pending++
        updateChrome()
        ApplicationManager.getApplication().executeOnPooledThread(Runnable {
            val result = work()
            ApplicationManager.getApplication().invokeLater {
                if (disposed) return@invokeLater
                pending--
                done(result)
                updateChrome()
            }
        })
    }

    private fun showError(message: String) {
        messageLabel.text = message
        updateChrome()
    }

    private fun clearError() {
        messageLabel.text = ""
        updateChrome()
    }

    private fun scheduleRebuild(board: Boolean = true, details: Boolean = true) {
        boardDirty = boardDirty || board
        detailsDirty = detailsDirty || details
        if (rebuildQueued) return
        rebuildQueued = true
        // Deferred: most rebuilds are requested from inside a listener of a component the rebuild removes.
        SwingUtilities.invokeLater {
            rebuildQueued = false
            if (disposed) return@invokeLater
            if (boardDirty) {
                boardDirty = false
                rebuildBoard()
            }
            if (detailsDirty) {
                detailsDirty = false
                rebuildDetails()
            }
        }
    }

    private fun updateChrome() {
        val loggedIn = GuidonSettings.isLoggedIn
        toolbarControls.forEach { it.isVisible = loggedIn }
        busyLabel.isVisible = pending > 0
        accountLabel.text = if (loggedIn) "Logged in as ${GuidonSettings.email.ifEmpty { "?" }}" else ""
        messageBar.isVisible = !messageLabel.text.isNullOrEmpty()
        val loggingIn = loginCancel != null
        loginButton.isEnabled = !loggingIn
        loginButton.text = if (loggingIn) "Waiting for the browser…" else "Log In"
        cancelLoginButton.isVisible = loggingIn
        modes.show(modePanel, if (!keyLoaded) MODE_LOADING else if (loggedIn) MODE_BOARD else MODE_LOGIN)
        revalidate()
        repaint()
    }

    private fun onTextChange(component: JTextComponent, update: (String) -> Unit) {
        component.document.addDocumentListener(object : DocumentListener {
            override fun insertUpdate(e: DocumentEvent) = update(component.text)
            override fun removeUpdate(e: DocumentEvent) = update(component.text)
            override fun changedUpdate(e: DocumentEvent) = update(component.text)
        })
    }

    private fun onEnter(field: JTextField, escape: (() -> Unit)? = null, enter: (String) -> Unit) {
        field.addKeyListener(object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                when (e.keyCode) {
                    KeyEvent.VK_ENTER -> field.text.trim().takeIf { it.isNotEmpty() }?.let(enter)
                    KeyEvent.VK_ESCAPE -> escape?.invoke()
                }
            }
        })
    }

    private fun button(text: String, action: () -> Unit) = JButton(text).apply { addActionListener { action() } }

    /** A borderless, hand-cursor text button - for subtask titles and "back to parent". */
    private fun linkButton(text: String, action: () -> Unit) = JButton(text).apply {
        isBorderPainted = false
        isContentAreaFilled = false
        isFocusPainted = false
        horizontalAlignment = JButton.LEFT
        margin = JBUI.emptyInsets()
        cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
        addActionListener { action() }
    }

    private fun centered(component: JComponent) = JPanel(GridBagLayout()).apply { add(component) }

    // --- layout ------------------------------------------------------------------

    private fun buildHeader(): JComponent {
        projectCombo.renderer = object : DefaultListCellRenderer() {
            override fun getListCellRendererComponent(list: JList<*>?, value: Any?, index: Int, selected: Boolean, focus: Boolean): Component =
                super.getListCellRendererComponent(list, (value as? GuidonProject)?.name ?: "Pick a project", index, selected, focus)
        }
        projectCombo.addActionListener {
            if (suppressComboEvents) return@addActionListener
            (projectCombo.selectedItem as? GuidonProject)?.let { selectProject(it.id) }
        }
        projectCombo.preferredSize = Dimension(JBUI.scale(220), projectCombo.preferredSize.height)

        val refresh = button("Refresh") { refreshProjects() }
        val openBrowser = button("Open in Browser") {
            if (currentProjectId.isNotEmpty()) BrowserUtil.browse("${GuidonSettings.baseUrl.trimEnd('/')}/projects/$currentProjectId/work")
        }
        openBrowser.toolTipText = "Open this project's board on the Guidon website"
        val logout = button("Log Out") { logOut() }
        logout.toolTipText = "Forget the key on this machine. It stays under Profile > API Keys until you revoke it there."
        toolbarControls += listOf(projectCombo, refresh, openBrowser, logout)

        val left = JPanel(FlowLayout(FlowLayout.LEFT, JBUI.scale(6), 0)).apply {
            add(JLabel("Guidon").apply {
                foreground = GuidonColors.accent
                font = font.deriveFont(java.awt.Font.BOLD, font.size2D + 2f)
            })
            add(projectCombo)
            add(refresh)
            add(openBrowser)
            add(busyLabel)
        }
        val right = JPanel(FlowLayout(FlowLayout.RIGHT, JBUI.scale(6), 0)).apply {
            add(accountLabel)
            add(logout)
        }
        val toolbar = JPanel(BorderLayout()).apply {
            add(left, BorderLayout.WEST)
            add(right, BorderLayout.EAST)
        }

        messageLabel.foreground = GuidonColors.destructive
        messageBar.border = JBUI.Borders.empty(6, 10)
        messageBar.add(messageLabel, BorderLayout.CENTER)
        messageBar.add(linkButton("✕") { clearError() }, BorderLayout.EAST)

        return JPanel(BorderLayout(0, JBUI.scale(6))).apply {
            border = JBUI.Borders.empty(6, 8)
            add(toolbar, BorderLayout.NORTH)
            add(messageBar, BorderLayout.SOUTH)
        }
    }

    private fun buildLoginPanel(): JComponent {
        loginButton.addActionListener { logIn() }
        cancelLoginButton.addActionListener { loginCancel?.set(true) }

        val form = FormPanel()
            .row(JLabel("Log in to Guidon").apply { font = font.deriveFont(java.awt.Font.BOLD, font.size2D + 3f) }, 0)
            .row(wrappingLabel("Logging in opens the Guidon website in your browser. Approve the plugin there and this window picks up the result automatically.", 320, GuidonColors.muted), 6)
            .row(sectionLabel("Base URL"), 12)
            .row(baseUrlField)
            .row(loginButton, 12)
            .row(cancelLoginButton)
        val box = RoundedPanel(BorderLayout(), GuidonColors.column, GuidonColors.border).apply {
            border = JBUI.Borders.empty(18)
            add(form, BorderLayout.CENTER)
        }
        return centered(box)
    }

    private fun buildBoardArea(): JComponent {
        val boardScroll = JScrollPane(JPanel(BorderLayout()).apply { add(boardPanel, BorderLayout.WEST) }).apply {
            border = JBUI.Borders.empty()
            horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_AS_NEEDED
            verticalScrollBar.unitIncrement = JBUI.scale(16)
            horizontalScrollBar.unitIncrement = JBUI.scale(16)
        }
        val detailsScroll = JScrollPane(detailsPanel).apply {
            border = JBUI.Borders.empty()
            horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
            verticalScrollBar.unitIncrement = JBUI.scale(16)
        }
        detailsPanel.border = JBUI.Borders.empty(8, 12)
        return JSplitPane(JSplitPane.HORIZONTAL_SPLIT, boardScroll, detailsScroll).apply {
            resizeWeight = 0.72
            border = JBUI.Borders.empty()
        }
    }

    // --- board ---------------------------------------------------------------------

    private fun rebuildBoard() {
        boardPanel.removeAll()
        newTaskField = null
        boardPanel.border = JBUI.Borders.empty(0, 8, 8, 8)

        if (currentProjectId.isEmpty()) {
            boardPanel.add(mutedLabel(if (projects.isEmpty()) "No projects loaded yet." else "Pick a project above."))
        } else {
            for (column in columns) {
                boardPanel.add(buildColumn(column.status, column.label))
                boardPanel.add(Box.createHorizontalStrut(JBUI.scale(10)))
            }
        }
        boardPanel.revalidate()
        boardPanel.repaint()
        newTaskField?.requestFocusInWindow()
    }

    private fun buildColumn(status: String, label: String): JComponent {
        val columnTasks = Board.column(tasks, status)
        // The site's column: rounded-xl, background-secondary, header row over a divider.
        val column = RoundedPanel(BorderLayout(0, 0), GuidonColors.column, GuidonColors.border, JBUI.scale(24))
        column.border = JBUI.Borders.empty(1)
        val width = JBUI.scale(COLUMN_WIDTH)
        column.preferredSize = Dimension(width, column.preferredSize.height)
        column.minimumSize = Dimension(width, 0)
        column.maximumSize = Dimension(width, Int.MAX_VALUE)

        val header = JPanel().apply {
            isOpaque = false
            layout = BoxLayout(this, BoxLayout.X_AXIS)
            border = javax.swing.BorderFactory.createCompoundBorder(
                javax.swing.BorderFactory.createMatteBorder(0, 0, 1, 0, GuidonColors.border),
                JBUI.Borders.empty(8, 12),
            )
            add(StatusDot(GuidonColors.status(status)))
            add(Box.createHorizontalStrut(JBUI.scale(6)))
            add(JLabel(label).apply {
                foreground = GuidonColors.text
                font = font.deriveFont(java.awt.Font.BOLD)
            })
            add(Box.createHorizontalGlue())
            add(pillLabel(columnTasks.size.toString()))
            add(Box.createHorizontalStrut(JBUI.scale(4)))
            add(linkButton("+") {
                addingInStatus = if (addingInStatus == status) "" else status
                scheduleRebuild(details = false)
            }.apply { toolTipText = "Create a task in this column" })
        }
        column.add(header, BorderLayout.NORTH)

        val cards = FormPanel()
        columnTasks.forEachIndexed { i, task -> cards.row(buildCard(task), if (i == 0) 0 else 6) }
        if (addingInStatus == status) {
            val field = JTextField()
            field.toolTipText = "Task title - Enter to create, Esc to cancel"
            onEnter(field, escape = {
                addingInStatus = ""
                scheduleRebuild(details = false)
            }) { title ->
                addingInStatus = ""
                createTask(title, status, "")
            }
            newTaskField = field
            cards.row(field, if (columnTasks.isEmpty()) 0 else 6)
        } else if (columnTasks.isEmpty()) {
            cards.row(mutedLabel("Drop tasks here"), 4)
        }
        cards.end()
        cards.border = JBUI.Borders.empty(8)
        column.add(cards, BorderLayout.CENTER)

        installDropTarget(column, status)
        return column
    }

    private fun installDropTarget(column: RoundedPanel, status: String) {
        fun highlight(on: Boolean) {
            column.outline = if (on) GuidonColors.accent else GuidonColors.border
            column.repaint()
        }
        DropTarget(column, DnDConstants.ACTION_MOVE, object : DropTargetAdapter() {
            override fun dragEnter(e: DropTargetDragEvent) = highlight(e.isDataFlavorSupported(DataFlavor.stringFlavor))
            override fun dragExit(e: DropTargetEvent) = highlight(false)
            override fun drop(e: DropTargetDropEvent) {
                highlight(false)
                if (!e.isDataFlavorSupported(DataFlavor.stringFlavor)) {
                    e.rejectDrop()
                    return
                }
                e.acceptDrop(DnDConstants.ACTION_MOVE)
                val data = runCatching { e.transferable.getTransferData(DataFlavor.stringFlavor) as? String }.getOrNull()
                e.dropComplete(true)
                // Only our own cards - anything else dragged in (text from the editor, files) is ignored.
                if (data != null && data.startsWith(DND_PREFIX)) moveTask(data.removePrefix(DND_PREFIX), status)
            }
        }, true)
    }

    private fun buildCard(task: GuidonTask): JComponent {
        val selected = task.id == selectedTaskId
        // The site's TaskCard: rounded-lg, bg-card, 1px border, p-3, hover bg-surface-hover.
        val card = RoundedPanel(BorderLayout(), GuidonColors.card, if (selected) GuidonColors.accent else GuidonColors.border, JBUI.scale(16))
        card.border = JBUI.Borders.empty(12)
        card.cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)

        val body = FormPanel()
        body.row(JPanel(BorderLayout(JBUI.scale(8), 0)).apply {
            isOpaque = false
            add(JPanel(BorderLayout()).apply {
                isOpaque = false
                border = JBUI.Borders.emptyTop(5)
                add(StatusDot(GuidonColors.priority(task.priority), 6), BorderLayout.NORTH)
            }, BorderLayout.WEST)
            add(wrappingLabel(task.title, CARD_TEXT_WIDTH - 14, GuidonColors.text, bold = true), BorderLayout.CENTER)
        }, 0)
        Board.descriptionPreview(task.description).takeIf { it.isNotEmpty() }?.let {
            body.row(wrappingLabel(it, CARD_TEXT_WIDTH, GuidonColors.muted, smaller = true), 3)
        }
        if (task.tags.isNotEmpty()) {
            val tags = JPanel(FlowLayout(FlowLayout.LEFT, JBUI.scale(4), JBUI.scale(2))).apply { isOpaque = false }
            task.tags.take(3).forEach { tag -> tags.add(pillLabel(tag)) }
            if (task.tags.size > 3) tags.add(mutedLabel("+${task.tags.size - 3}"))
            body.row(tags, 4)
        }
        val footer = JPanel(FlowLayout(FlowLayout.LEFT, 0, 0)).apply { isOpaque = false }
        footer.add(mutedLabel(Vocabulary.priorityLabel(task.priority)))
        if (task.dueDate.isNotEmpty()) {
            footer.add(Box.createHorizontalStrut(JBUI.scale(10)))
            footer.add(mutedLabel(task.dueDate.take(10)))
        }
        val subs = Board.subtasks(tasks, task.id)
        if (subs.isNotEmpty()) {
            footer.add(Box.createHorizontalStrut(JBUI.scale(10)))
            footer.add(mutedLabel("✓ ${subs.count { it.status == "done" }}/${subs.size}"))
        }
        body.row(footer, 6)
        card.add(body, BorderLayout.CENTER)

        // Children have no mouse listeners, so clicks and drags anywhere on the card reach the card itself.
        card.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                if (SwingUtilities.isLeftMouseButton(e)) selectTask(task.id)
            }

            override fun mouseEntered(e: MouseEvent) {
                card.fill = GuidonColors.cardHover
                if (!selected) card.outline = GuidonColors.borderHover
                card.repaint()
            }

            override fun mouseExited(e: MouseEvent) {
                card.fill = GuidonColors.card
                if (!selected) card.outline = GuidonColors.border
                card.repaint()
            }
        })
        DragSource.getDefaultDragSource().createDefaultDragGestureRecognizer(card, DnDConstants.ACTION_MOVE) { gesture ->
            gesture.startDrag(DragSource.DefaultMoveDrop, StringSelection(DND_PREFIX + task.id))
        }
        return card
    }

    // --- details -------------------------------------------------------------------

    private fun rebuildDetails() {
        detailsPanel.removeAll()
        val task = tasks.find { it.id == selectedTaskId }
        if (task == null) {
            detailsPanel.add(
                wrappingLabel("Click a card to open it here. Drag cards between columns to change their status.", 260, GuidonColors.muted),
                BorderLayout.NORTH,
            )
            detailsPanel.revalidate()
            detailsPanel.repaint()
            return
        }

        val form = FormPanel()
        if (task.isSubtask) {
            form.row(linkButton("← Back to parent task") { selectTask(task.parentTaskId) }, 0)
        }

        form.row(sectionLabel("Title"), 8)
        form.row(JTextField(editTitle).also { f -> onTextChange(f) { editTitle = it } })

        // Only the project's visible columns, so a task can't be moved into one the board hides.
        val statusOptions = columns.map { it.status }.let { if (task.status in it) it else it + task.status }
        val statusCombo = JComboBox(statusOptions.toTypedArray()).apply {
            selectedItem = task.status
            renderer = labelRenderer { status -> columns.find { it.status == status }?.label ?: Vocabulary.statusLabel(status) }
            // Applied immediately, like dragging the card - Save is for the text fields.
            addActionListener { (selectedItem as? String)?.let { moveTask(task.id, it) } }
        }
        val priorityCombo = JComboBox(Vocabulary.priorities.toTypedArray()).apply {
            selectedItem = editPriority
            renderer = labelRenderer { Vocabulary.priorityLabel(it) }
            addActionListener { (selectedItem as? String)?.let { editPriority = it } }
        }
        form.row(JPanel(GridLayout(1, 2, JBUI.scale(8), 0)).apply {
            isOpaque = false
            add(FormPanel().row(sectionLabel("Status"), 0).row(statusCombo))
            add(FormPanel().row(sectionLabel("Priority"), 0).row(priorityCombo))
        }, 8)

        form.row(sectionLabel("Due date (YYYY-MM-DD)"), 8)
        form.row(JTextField(editDueDate).also { f -> onTextChange(f) { editDueDate = it.trim() } })

        form.row(sectionLabel("Description (Markdown)"), 8)
        val description = JTextArea(editDescription, 8, 20).apply {
            lineWrap = true
            wrapStyleWord = true
        }
        onTextChange(description) { editDescription = it }
        form.row(JScrollPane(description))

        form.row(JPanel(FlowLayout(FlowLayout.LEFT, 0, 0)).apply {
            isOpaque = false
            add(GuidonButton("Save").apply { addActionListener { saveSelectedTask() } })
            add(Box.createHorizontalStrut(JBUI.scale(6)))
            add(GuidonButton("Delete", GuidonButton.Variant.DESTRUCTIVE).apply { addActionListener { deleteSelectedTask() } })
            add(Box.createHorizontalStrut(JBUI.scale(6)))
            add(button("Copy Git ref") {
                Toolkit.getDefaultToolkit().systemClipboard.setContents(StringSelection(Board.gitRef(task.id)), null)
            }.apply { toolTipText = "Copy guidon#<id>: mention it in a commit, PR or branch name and the GitHub integration links and moves this task" })
        }, 10)

        if (!task.isSubtask) {
            form.row(sectionLabel("Subtasks"), 14)
            for (sub in Board.subtasks(tasks, task.id)) {
                form.row(JPanel(BorderLayout()).apply {
                    isOpaque = false
                    add(JCheckBox().apply {
                        isOpaque = false
                        isSelected = sub.status == "done"
                        addActionListener { moveTask(sub.id, if (isSelected) "done" else "todo") }
                    }, BorderLayout.WEST)
                    add(linkButton(sub.title) { selectTask(sub.id) }, BorderLayout.CENTER)
                }, 2)
            }
            val subField = JTextField(newSubtaskTitle)
            subField.toolTipText = "New subtask - Enter to add"
            onTextChange(subField) { newSubtaskTitle = it }
            onEnter(subField) { title ->
                newSubtaskTitle = ""
                createTask(title, "", task.id)
            }
            form.row(subField, 4)
        }

        form.row(sectionLabel("Comments"), 14)
        val taskComments = comments[task.id]
        when {
            taskComments == null -> form.row(mutedLabel("Loading…"))
            taskComments.isEmpty() -> form.row(mutedLabel("No comments yet."))
            else -> taskComments.forEach { comment ->
                val author = comment.actorLabel.ifEmpty { "Someone" }
                val bubble = RoundedPanel(BorderLayout(0, JBUI.scale(3)), GuidonColors.column, GuidonColors.border, JBUI.scale(16)).apply {
                    border = JBUI.Borders.empty(6, 8)
                    add(mutedLabel("$author - ${comment.createdAt.take(16).replace('T', ' ')}"), BorderLayout.NORTH)
                    add(wrappingLabel(comment.content, 240, GuidonColors.text), BorderLayout.CENTER)
                }
                form.row(bubble, 4)
            }
        }
        val commentArea = JTextArea(newComment, 3, 20).apply {
            lineWrap = true
            wrapStyleWord = true
        }
        onTextChange(commentArea) { newComment = it }
        form.row(JScrollPane(commentArea), 6)
        form.row(JPanel(FlowLayout(FlowLayout.RIGHT, 0, 0)).apply {
            isOpaque = false
            add(GuidonButton("Post").apply { addActionListener { postComment() } })
        }, 4)
        form.end()

        detailsPanel.add(form, BorderLayout.CENTER)
        detailsPanel.revalidate()
        detailsPanel.repaint()
    }

    private fun labelRenderer(label: (String) -> String) = object : DefaultListCellRenderer() {
        override fun getListCellRendererComponent(list: JList<*>?, value: Any?, index: Int, selected: Boolean, focus: Boolean): Component =
            super.getListCellRendererComponent(list, (value as? String)?.let(label) ?: "", index, selected, focus)
    }

    // --- actions -------------------------------------------------------------------

    private fun refreshProjects() {
        val api = api()
        bg({ api.listProjects() }) { result ->
            when (result) {
                is ApiResult.Err -> showError(result.message)
                is ApiResult.Ok -> {
                    clearError()
                    projects = result.value
                    val selected = projects.find { it.id == currentProjectId } ?: projects.firstOrNull()
                    currentProjectId = selected?.id.orEmpty()
                    GuidonSettings.projectId = currentProjectId
                    suppressComboEvents = true
                    try {
                        projectCombo.removeAllItems()
                        projects.forEach { projectCombo.addItem(it) }
                        projectCombo.selectedItem = selected
                    } finally {
                        suppressComboEvents = false
                    }
                    refreshTasks()
                }
            }
        }
    }

    private fun selectProject(projectId: String) {
        if (projectId == currentProjectId) return
        currentProjectId = projectId
        GuidonSettings.projectId = projectId
        tasks = mutableListOf()
        columns = Vocabulary.defaultColumns
        comments.clear()
        selectedTaskId = ""
        addingInStatus = ""
        scheduleRebuild()
        refreshTasks()
    }

    private fun refreshTasks() {
        val projectId = currentProjectId
        if (projectId.isEmpty()) {
            tasks = mutableListOf()
            scheduleRebuild()
            return
        }
        val api = api()
        bg({
            // A columns failure (e.g. an older server without the endpoint) just means the default columns.
            val loadedColumns = (api.listColumns(projectId) as? ApiResult.Ok)?.value ?: Vocabulary.defaultColumns
            api.listTasks(projectId) to loadedColumns
        }) { (result, loadedColumns) ->
            if (projectId != currentProjectId) return@bg // switched project meanwhile
            when (result) {
                is ApiResult.Err -> showError(result.message)
                is ApiResult.Ok -> {
                    tasks = result.value.toMutableList()
                    columns = loadedColumns
                    if (tasks.none { it.id == selectedTaskId }) selectedTaskId = ""
                    scheduleRebuild()
                    if (selectedTaskId.isNotEmpty()) loadComments(selectedTaskId)
                }
            }
        }
    }

    private fun loadComments(taskId: String) {
        val api = api()
        bg({ api.listComments(taskId) }) { result ->
            when (result) {
                is ApiResult.Err -> showError(result.message)
                is ApiResult.Ok -> {
                    comments[taskId] = result.value
                    if (selectedTaskId == taskId) scheduleRebuild(board = false)
                }
            }
        }
    }

    private fun selectTask(taskId: String) {
        val task = tasks.find { it.id == taskId } ?: return
        selectedTaskId = taskId
        editTitle = task.title
        editDescription = task.description
        editPriority = task.priority.ifEmpty { "medium" }
        editDueDate = task.dueDate.take(10)
        newSubtaskTitle = ""
        newComment = ""
        scheduleRebuild()
        loadComments(taskId)
    }

    private fun replaceTask(updated: GuidonTask) {
        val index = tasks.indexOfFirst { it.id == updated.id }
        if (index >= 0) tasks[index] = updated else tasks.add(updated)
    }

    /**
     * Optimistic, like the Unity board: move now, revert if the server refuses.
     * A moved top-level card lands at the end of its new column (web board /
     * Unity behaviour); subtasks aren't on the board, so only their status changes.
     */
    private fun moveTask(taskId: String, newStatus: String) {
        val index = tasks.indexOfFirst { it.id == taskId }
        if (index < 0 || tasks[index].status == newStatus) return
        val previous = tasks[index]
        val reorder = !previous.isSubtask
        val newSortOrder = if (reorder) Board.appendSortOrder(Board.column(tasks, newStatus)) else previous.sortOrder
        tasks[index] = previous.copy(status = newStatus, sortOrder = newSortOrder)
        scheduleRebuild()

        val api = api()
        bg({
            when (val status = api.setStatus(taskId, newStatus)) {
                is ApiResult.Err -> status to null
                is ApiResult.Ok -> if (!reorder) status to null else status to api.updateSortOrder(taskId, newSortOrder)
            }
        }) { (statusResult, sortResult) ->
            when (statusResult) {
                is ApiResult.Err -> {
                    replaceTask(previous)
                    showError(statusResult.message)
                }
                is ApiResult.Ok -> when (sortResult) {
                    null -> replaceTask(statusResult.value)
                    is ApiResult.Ok -> replaceTask(sortResult.value)
                    // The status change landed - only the position didn't.
                    is ApiResult.Err -> showError(sortResult.message)
                }
            }
            scheduleRebuild()
        }
    }

    private fun createTask(title: String, status: String, parentTaskId: String) {
        val api = api()
        val projectId = currentProjectId
        bg({ api.createTask(projectId, title, status = status, parentTaskId = parentTaskId) }) { result ->
            when (result) {
                is ApiResult.Err -> showError(result.message)
                is ApiResult.Ok -> {
                    clearError()
                    if (projectId == currentProjectId) replaceTask(result.value)
                    scheduleRebuild()
                }
            }
        }
    }

    private fun saveSelectedTask() {
        val title = editTitle.trim()
        if (title.isEmpty()) return showError("Title is required.")
        if (!Board.isValidDueDate(editDueDate)) return showError("Due date must be YYYY-MM-DD (or empty).")
        val api = api()
        val taskId = selectedTaskId
        val description = editDescription
        val priority = editPriority
        val dueDate = editDueDate
        bg({ api.updateTaskFields(taskId, title, description, priority, dueDate) }) { result ->
            when (result) {
                is ApiResult.Err -> showError(result.message)
                is ApiResult.Ok -> {
                    clearError()
                    replaceTask(result.value)
                    scheduleRebuild(details = false)
                }
            }
        }
    }

    private fun deleteSelectedTask() {
        val task = tasks.find { it.id == selectedTaskId } ?: return
        val answer = Messages.showYesNoDialog(
            project,
            "Delete \"${task.title}\"? Its subtasks and comments are deleted too.",
            "Delete Task",
            Messages.getQuestionIcon(),
        )
        if (answer != Messages.YES) return
        val api = api()
        bg({ api.deleteTask(task.id) }) { result ->
            when (result) {
                is ApiResult.Err -> showError(result.message)
                is ApiResult.Ok -> {
                    clearError()
                    // Subtasks go with their parent (ON DELETE CASCADE, migration 010).
                    tasks.removeAll { it.id == task.id || it.parentTaskId == task.id }
                    comments.remove(task.id)
                    if (selectedTaskId == task.id) selectedTaskId = ""
                    scheduleRebuild()
                }
            }
        }
    }

    private fun postComment() {
        val content = newComment.trim()
        val taskId = selectedTaskId
        if (content.isEmpty() || taskId.isEmpty()) return
        val api = api()
        bg({ api.addComment(taskId, content) }) { result ->
            when (result) {
                is ApiResult.Err -> showError(result.message)
                is ApiResult.Ok -> {
                    clearError()
                    comments[taskId] = comments[taskId].orEmpty() + result.value
                    if (selectedTaskId == taskId) {
                        newComment = ""
                        scheduleRebuild(board = false)
                    }
                }
            }
        }
    }

    private fun logIn() {
        clearError()
        val baseUrl = baseUrlField.text.trim()
        GuidonSettings.baseUrl = baseUrl
        val cancel = AtomicBoolean(false)
        loginCancel = cancel
        bg({
            when (val result = LoopbackLogin.login(baseUrl, { BrowserUtil.browse(it) }, cancel)) {
                is ApiResult.Ok -> {
                    GuidonSettings.storeApiKey(result.value.apiKey) // password safe - still off the EDT
                    result
                }
                is ApiResult.Err -> result
            }
        }) { result ->
            loginCancel = null
            when (result) {
                is ApiResult.Err -> showError(result.message)
                is ApiResult.Ok -> {
                    GuidonSettings.email = result.value.email
                    refreshProjects()
                }
            }
        }
    }

    private fun logOut() {
        loginCancel?.set(true)
        GuidonSettings.email = ""
        projects = emptyList()
        tasks = mutableListOf()
        comments.clear()
        selectedTaskId = ""
        addingInStatus = ""
        suppressComboEvents = true
        try {
            projectCombo.removeAllItems()
        } finally {
            suppressComboEvents = false
        }
        clearError()
        bg({ GuidonSettings.storeApiKey("") }) { scheduleRebuild() }
    }
}

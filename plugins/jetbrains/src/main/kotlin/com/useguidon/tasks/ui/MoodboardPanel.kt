package com.useguidon.tasks.ui

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import com.useguidon.tasks.GuidonSettings
import com.useguidon.tasks.core.ApiResult
import com.useguidon.tasks.core.GuidonApi
import com.useguidon.tasks.core.GuidonReference
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import java.awt.FlowLayout
import java.awt.RenderingHints
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO
import javax.swing.Action
import javax.swing.DefaultListModel
import javax.swing.ImageIcon
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.JTextField
import javax.swing.ListCellRenderer
import javax.swing.SwingConstants
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener
import kotlin.math.max
import kotlin.math.min

/**
 * The project's moodboard (reference images / concept art) - shown instead
 * of the board by the tool window's Moodboard button. Images are downloaded
 * on pooled threads and decoded with ImageIO (PNG, JPEG, BMP, GIF); nothing
 * is written into the IDE project.
 */
class MoodboardPanel(private val project: Project, private val isDisposed: () -> Boolean) : JPanel(BorderLayout()) {
    private companion object {
        const val THUMB_WIDTH = 180
        const val THUMB_HEIGHT = 135
        const val ALL_TAGS = "All tags"
    }

    private var projectId = ""
    private var generation = 0
    private var references: List<GuidonReference> = emptyList()
    private val thumbnails = mutableMapOf<String, ImageIcon>()
    private val fullImages = mutableMapOf<String, BufferedImage>()
    private val failed = mutableSetOf<String>()

    private val status = mutedLabel("")
    private val search = JTextField(18)
    private val tagCombo = JComboBox<String>()
    private var suppressTagEvents = false
    private val model = DefaultListModel<GuidonReference>()
    private val list = JBList(model)

    init {
        border = JBUI.Borders.empty(6, 10)

        search.toolTipText = "Search captions and tags"
        search.document.addDocumentListener(object : DocumentListener {
            override fun insertUpdate(e: DocumentEvent) = applyFilter()
            override fun removeUpdate(e: DocumentEvent) = applyFilter()
            override fun changedUpdate(e: DocumentEvent) = applyFilter()
        })
        tagCombo.addActionListener { if (!suppressTagEvents) applyFilter() }
        val openWeb = javax.swing.JButton("Open in Browser").apply {
            toolTipText = "Add images on the Guidon website"
            addActionListener {
                if (projectId.isNotEmpty()) BrowserUtil.browse("${GuidonSettings.baseUrl.trimEnd('/')}/projects/$projectId/references")
            }
        }
        add(JPanel(FlowLayout(FlowLayout.LEFT, JBUI.scale(6), 0)).apply {
            add(JLabel("Search:"))
            add(search)
            add(tagCombo)
            add(openWeb)
            add(status)
        }, BorderLayout.NORTH)

        // HORIZONTAL_WRAP + visibleRowCount -1: a grid that re-flows with the tool window's width.
        list.layoutOrientation = JList.HORIZONTAL_WRAP
        list.visibleRowCount = -1
        list.fixedCellWidth = JBUI.scale(THUMB_WIDTH + 16)
        list.fixedCellHeight = JBUI.scale(THUMB_HEIGHT + 36)
        list.cellRenderer = TileRenderer()
        list.emptyText.text = "No images"
        list.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                if (e.clickCount < 2) return
                val index = list.locationToIndex(e.point)
                if (index >= 0 && list.getCellBounds(index, index)?.contains(e.point) == true) openPreview(model.get(index))
            }
        })
        list.toolTipText = "Double-click to view"
        add(JBScrollPane(list).apply { border = JBUI.Borders.emptyTop(6) }, BorderLayout.CENTER)
    }

    /** Loads [newProjectId]'s moodboard; anything still arriving for a previous load is dropped. */
    fun load(newProjectId: String, api: GuidonApi) {
        val loadGeneration = ++generation
        projectId = newProjectId
        references = emptyList()
        thumbnails.clear()
        fullImages.clear()
        failed.clear()
        rebuildTags()
        applyFilter()
        if (projectId.isEmpty()) {
            status.text = "Pick a project above."
            return
        }
        status.text = "Loading…"

        ApplicationManager.getApplication().executeOnPooledThread(Runnable {
            val result = api.listReferences(newProjectId)
            onEdt(loadGeneration) {
                when (result) {
                    is ApiResult.Err -> status.text = result.message
                    is ApiResult.Ok -> {
                        references = result.value
                        status.text = if (references.isEmpty()) "No images yet - add them on the website." else "${references.size} image(s)"
                        rebuildTags()
                        applyFilter()
                        downloadAll(loadGeneration, api)
                    }
                }
            }
        })
    }

    private fun downloadAll(loadGeneration: Int, api: GuidonApi) {
        val queue = references.toList()
        ApplicationManager.getApplication().executeOnPooledThread(Runnable {
            for (reference in queue) {
                if (loadGeneration != generation || isDisposed()) return@Runnable
                val image = (api.downloadImage(reference.imageUrl) as? ApiResult.Ok)?.value?.let { bytes ->
                    runCatching { ImageIO.read(ByteArrayInputStream(bytes)) }.getOrNull()
                }
                val thumbnail = image?.let { ImageIcon(cover(it, JBUI.scale(THUMB_WIDTH), JBUI.scale(THUMB_HEIGHT))) }
                onEdt(loadGeneration) {
                    if (image != null && thumbnail != null) {
                        fullImages[reference.id] = image
                        thumbnails[reference.id] = thumbnail
                    } else {
                        failed += reference.id
                    }
                    list.repaint()
                }
            }
        })
    }

    private fun onEdt(loadGeneration: Int, block: () -> Unit) {
        ApplicationManager.getApplication().invokeLater {
            if (!isDisposed() && loadGeneration == generation) block()
        }
    }

    private fun rebuildTags() {
        suppressTagEvents = true
        val previous = tagCombo.selectedItem as? String
        tagCombo.removeAllItems()
        tagCombo.addItem(ALL_TAGS)
        references.flatMap { it.tags }.distinct().sorted().forEach { tagCombo.addItem(it) }
        tagCombo.selectedItem = previous?.takeIf { p -> (0 until tagCombo.itemCount).any { tagCombo.getItemAt(it) == p } } ?: ALL_TAGS
        tagCombo.isVisible = tagCombo.itemCount > 1
        suppressTagEvents = false
    }

    private fun applyFilter() {
        val needle = search.text.trim().lowercase()
        val tag = (tagCombo.selectedItem as? String)?.takeIf { it != ALL_TAGS }
        model.clear()
        references
            .filter { tag == null || tag in it.tags }
            .filter { needle.isEmpty() || "${it.caption} ${it.name} ${it.tags.joinToString(" ")}".lowercase().contains(needle) }
            .forEach { model.addElement(it) }
    }

    private fun openPreview(reference: GuidonReference) {
        val image = fullImages[reference.id]
        object : DialogWrapper(project, false) {
            init {
                title = reference.displayName
                setOKButtonText("Close")
                init()
            }

            override fun createCenterPanel(): JComponent {
                val panel = JPanel(BorderLayout())
                val label = if (image != null) {
                    JLabel(ImageIcon(fit(image, JBUI.scale(1000), JBUI.scale(700))))
                } else {
                    mutedLabel("Image unavailable")
                }
                panel.add(label, BorderLayout.CENTER)
                if (reference.tags.isNotEmpty()) panel.add(mutedLabel(reference.tags.joinToString(", ")), BorderLayout.SOUTH)
                return panel
            }

            override fun createActions(): Array<Action> {
                if (reference.sourceUrl.isEmpty()) return arrayOf(okAction)
                val source = object : DialogWrapperAction("Open source") {
                    override fun doAction(e: java.awt.event.ActionEvent?) {
                        if (reference.sourceUrl.startsWith("https://") || reference.sourceUrl.startsWith("http://")) BrowserUtil.browse(reference.sourceUrl)
                    }
                }
                return arrayOf(source, okAction)
            }
        }.show()
    }

    private inner class TileRenderer : ListCellRenderer<GuidonReference> {
        private val label = JLabel().apply {
            horizontalAlignment = SwingConstants.CENTER
            verticalAlignment = SwingConstants.TOP
            horizontalTextPosition = SwingConstants.CENTER
            verticalTextPosition = SwingConstants.BOTTOM
            iconTextGap = JBUI.scale(4)
            border = JBUI.Borders.empty(4)
            isOpaque = true
        }
        private val placeholder = ImageIcon(BufferedImage(JBUI.scale(THUMB_WIDTH), JBUI.scale(THUMB_HEIGHT), BufferedImage.TYPE_INT_ARGB))

        override fun getListCellRendererComponent(
            list: JList<out GuidonReference>, value: GuidonReference, index: Int, selected: Boolean, focused: Boolean,
        ): Component {
            label.icon = thumbnails[value.id] ?: placeholder
            val caption = when {
                value.id in failed -> "${value.displayName} (unavailable)"
                value.id !in thumbnails -> "Loading…"
                else -> value.displayName
            }
            label.text = truncate(caption, 28)
            label.toolTipText = value.displayName
            label.background = if (selected) list.selectionBackground else list.background
            label.foreground = if (selected) list.selectionForeground else list.foreground
            return label
        }
    }
}

private fun truncate(text: String, max: Int) = if (text.length <= max) text else text.take(max - 1) + "…"

/** Scales [image] to fill [width]x[height], cropping the overflow (a thumbnail "cover"). */
private fun cover(image: BufferedImage, width: Int, height: Int): BufferedImage {
    val scale = max(width.toDouble() / image.width, height.toDouble() / image.height)
    val w = (image.width * scale).toInt().coerceAtLeast(1)
    val h = (image.height * scale).toInt().coerceAtLeast(1)
    return draw(width, height) { g -> g.drawImage(image, (width - w) / 2, (height - h) / 2, w, h, null) }
}

/** Scales [image] down (never up) to fit inside [maxWidth]x[maxHeight]. */
private fun fit(image: BufferedImage, maxWidth: Int, maxHeight: Int): BufferedImage {
    val scale = min(1.0, min(maxWidth.toDouble() / image.width, maxHeight.toDouble() / image.height))
    val w = (image.width * scale).toInt().coerceAtLeast(1)
    val h = (image.height * scale).toInt().coerceAtLeast(1)
    return draw(w, h) { g -> g.drawImage(image, 0, 0, w, h, null) }
}

private fun draw(width: Int, height: Int, paint: (java.awt.Graphics2D) -> Unit): BufferedImage {
    val out = BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB)
    val g = out.createGraphics()
    g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
    g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
    paint(g)
    g.dispose()
    return out
}

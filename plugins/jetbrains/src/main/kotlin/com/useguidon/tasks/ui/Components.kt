package com.useguidon.tasks.ui

import com.intellij.ui.JBColor
import com.intellij.util.ui.JBUI
import java.awt.BasicStroke
import java.awt.Color
import java.awt.Component
import java.awt.Dimension
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.awt.Insets
import java.awt.LayoutManager
import java.awt.RenderingHints
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel

/**
 * Colors copied from the web app's design tokens (src/app/globals.css) - the
 * same light/dark pairs as the Unity plugin's GuidonStyles.cs. JBColor picks
 * the right one for the IDE's current theme and follows theme switches.
 */
object GuidonColors {
    private fun c(light: Int, dark: Int) = JBColor(Color(light), Color(dark))

    val background = c(0xffffff, 0x0b0d10)
    val column = c(0xf8fafc, 0x101317) // background-secondary
    val card = c(0xffffff, 0x101317)
    val cardHover = c(0xf8fafc, 0x16191f) // surface-hover
    val border = c(0xe2e8f0, 0x23272f)
    val borderHover = c(0xcbd5e1, 0x2f343e)
    val text = c(0x0f172a, 0xe8eaed)
    val muted = c(0x64748b, 0x8b93a1) // muted-foreground
    val accent = c(0x1d4fd8, 0x4d8dff) // primary
    val primaryHover = c(0x1640b0, 0x6ea3ff)
    val primaryForeground = c(0xffffff, 0x05142e)
    val pill = c(0xf1f5f9, 0x16191f) // muted
    val destructive = c(0xdc2626, 0xf87171)
    val errorFill = c(0xfef2f2, 0x2a1215)

    private val info = c(0x2563eb, 0x60a5fa)
    private val warning = c(0xd97706, 0xfbbf24)
    private val success = c(0x059669, 0x34d399)

    /** Column dot colors, from BOARD_COLUMNS' accentClass (task-board.ts). */
    fun status(status: String): Color = when (status) {
        "todo", "ai_working" -> info
        "in_progress" -> warning
        "review" -> accent
        "done" -> success
        else -> muted // backlog
    }

    fun priority(priority: String): Color = when (priority) {
        "medium" -> info
        "high" -> warning
        "critical" -> destructive
        else -> muted // low
    }
}

/**
 * The site's primary Button (solid brand blue, rounded-md) - painted here
 * rather than left to the IDE's look-and-feel so it matches the web app in
 * every IDE theme. `destructive` is the red outline variant used for Delete.
 */
class GuidonButton(text: String, private val variant: Variant = Variant.PRIMARY) : javax.swing.JButton(text) {
    enum class Variant { PRIMARY, DESTRUCTIVE }

    private var hovered = false

    init {
        isContentAreaFilled = false
        isBorderPainted = false
        isFocusPainted = false
        isOpaque = false
        border = JBUI.Borders.empty(5, 12)
        foreground = if (variant == Variant.PRIMARY) GuidonColors.primaryForeground else GuidonColors.destructive
        font = font.deriveFont(java.awt.Font.BOLD)
        cursor = java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR)
        addMouseListener(object : java.awt.event.MouseAdapter() {
            override fun mouseEntered(e: java.awt.event.MouseEvent) { hovered = true; repaint() }
            override fun mouseExited(e: java.awt.event.MouseEvent) { hovered = false; repaint() }
        })
    }

    override fun paintComponent(g: Graphics) {
        val g2 = g.create() as Graphics2D
        try {
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            val arc = JBUI.scale(12)
            when (variant) {
                Variant.PRIMARY -> {
                    g2.color = if (!isEnabled) GuidonColors.border else if (hovered) GuidonColors.primaryHover else GuidonColors.accent
                    g2.fillRoundRect(0, 0, width, height, arc, arc)
                }
                Variant.DESTRUCTIVE -> {
                    g2.color = if (hovered) GuidonColors.errorFill else GuidonColors.background
                    g2.fillRoundRect(0, 0, width - 1, height - 1, arc, arc)
                    g2.color = if (hovered) GuidonColors.destructive else GuidonColors.border
                    g2.drawRoundRect(0, 0, width - 1, height - 1, arc, arc)
                }
            }
        } finally {
            g2.dispose()
        }
        super.paintComponent(g)
    }
}

/** Rounded muted chip - the column count badge and tag pills. */
fun pillLabel(text: String): JComponent = object : RoundedPanel(java.awt.BorderLayout(), GuidonColors.pill, GuidonColors.border, JBUI.scale(8)) {
    // Never stretched by BoxLayout rows - a chip is exactly as wide as its text.
    override fun getMaximumSize(): Dimension = preferredSize
}.apply {
    border = JBUI.Borders.empty(0, 6)
    add(mutedLabel(text).apply { font = font.deriveFont(font.size2D - 1f) })
}

/** A panel with a rounded fill and 1px outline - columns, cards, pills. */
open class RoundedPanel(
    layout: LayoutManager?,
    var fill: Color,
    var outline: Color? = null,
    private val arc: Int = JBUI.scale(12),
) : JPanel(layout) {
    init {
        isOpaque = false
    }

    override fun paintComponent(g: Graphics) {
        val g2 = g.create() as Graphics2D
        try {
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            g2.color = fill
            g2.fillRoundRect(0, 0, width - 1, height - 1, arc, arc)
            outline?.let {
                g2.color = it
                g2.stroke = BasicStroke(JBUI.scale(1).toFloat())
                g2.drawRoundRect(0, 0, width - 1, height - 1, arc, arc)
            }
        } finally {
            g2.dispose()
        }
        super.paintComponent(g)
    }
}

/** The small colored circle next to a column's name. */
class StatusDot(private val color: Color, diameter: Int = 8) : JComponent() {
    init {
        val size = JBUI.scale(diameter)
        preferredSize = Dimension(size, size)
        minimumSize = preferredSize
        maximumSize = preferredSize
    }

    override fun paintComponent(g: Graphics) {
        val g2 = g.create() as Graphics2D
        try {
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            g2.color = color
            g2.fillOval(0, 0, width, height)
        } finally {
            g2.dispose()
        }
    }
}

/** Vertical stack of full-width rows (GridBag, since BoxLayout's alignment rules fight you). */
class FormPanel : JPanel(GridBagLayout()) {
    private var nextRow = 0

    init {
        isOpaque = false
    }

    fun row(component: Component, top: Int = 4): FormPanel {
        val c = GridBagConstraints().apply {
            gridx = 0
            gridy = nextRow++
            weightx = 1.0
            fill = GridBagConstraints.HORIZONTAL
            anchor = GridBagConstraints.NORTHWEST
            insets = Insets(JBUI.scale(top), 0, 0, 0)
        }
        super.add(component, c)
        return this
    }

    /** Pushes everything above it to the top. Call last. */
    fun end() {
        val c = GridBagConstraints().apply {
            gridx = 0
            gridy = nextRow++
            weighty = 1.0
            fill = GridBagConstraints.BOTH
        }
        super.add(JPanel().apply { isOpaque = false }, c)
    }
}

fun escapeHtml(text: String): String =
    text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

/** A label that wraps at [widthPx] (unscaled px) - Swing labels only wrap through HTML. */
fun wrappingLabel(text: String, widthPx: Int, color: Color, bold: Boolean = false, smaller: Boolean = false): JLabel {
    val weight = if (bold) "font-weight:bold;" else ""
    val label = JLabel("<html><div style='width:${JBUI.scale(widthPx)}px;$weight'>${escapeHtml(text)}</div></html>")
    label.foreground = color
    if (smaller) label.font = label.font.deriveFont(label.font.size2D - 1f)
    return label
}

fun mutedLabel(text: String): JLabel = JLabel(text).apply {
    foreground = GuidonColors.muted
    font = font.deriveFont(font.size2D - 1f)
}

fun sectionLabel(text: String): JLabel = JLabel(text).apply {
    foreground = GuidonColors.muted
    font = font.deriveFont(java.awt.Font.BOLD, font.size2D - 1f)
}

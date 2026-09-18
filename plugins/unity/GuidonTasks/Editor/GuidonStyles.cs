using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace Guidon.Tasks.Editor
{
    /// <summary>
    /// Shared inline-style helpers standing in for what would otherwise be
    /// USS classes - there is no external .uss file (see
    /// GuidonTasksWindow's own doc comment for why: this plugin is a
    /// "copy the folder anywhere under Assets/" tool, with no reliable
    /// project-relative path to load a stylesheet asset from after that
    /// copy).
    ///
    /// Colors and spacing below are copied verbatim from the actual web
    /// app - src/app/globals.css's design tokens (dark palette for
    /// EditorGUIUtility.isProSkin, the `:root` light palette otherwise),
    /// and the literal Tailwind classes on
    /// src/components/work/kanban-board.tsx / task-card.tsx (rounded-xl =
    /// 12px, rounded-lg = 8px, the priority dot's h-1.5 w-1.5 = 6px, etc.) -
    /// not eyeballed. There is no shared-token pipeline between this plugin
    /// and the Next.js app, so this is a manual-sync point like
    /// GuidonVocabulary's status/priority lists: re-copy from globals.css
    /// if the web app's palette ever changes.
    /// </summary>
    internal static class GuidonStyles
    {
        private static Color HexColor(string hex) =>
            ColorUtility.TryParseHtmlString(hex, out Color color) ? color : Color.magenta;

        // --color-background
        private static Color WindowBackground => EditorGUIUtility.isProSkin ? HexColor("#0b0d10") : HexColor("#ffffff");
        // --color-background-secondary (the Kanban column's own background)
        private static Color ColumnBackground => EditorGUIUtility.isProSkin ? HexColor("#101317") : HexColor("#f8fafc");
        // --color-card (TaskCard's background - the same value as
        // --color-background-secondary in dark mode on the real site, which
        // relies on the border alone to separate a card from its column -
        // kept faithful to that rather than "improved" with an invented
        // contrast difference the site doesn't actually have).
        private static Color CardBackground => EditorGUIUtility.isProSkin ? HexColor("#101317") : HexColor("#ffffff");
        // --color-border
        private static Color BorderColor => EditorGUIUtility.isProSkin ? HexColor("#23272f") : HexColor("#e2e8f0");
        // --color-foreground
        private static Color TextColor => EditorGUIUtility.isProSkin ? HexColor("#e8eaed") : HexColor("#0f172a");
        // --color-muted-foreground
        private static Color MutedTextColor => EditorGUIUtility.isProSkin ? HexColor("#8b93a1") : HexColor("#64748b");
        // --color-primary (the site's own drag-over highlight uses border-primary/40)
        private static Color AccentColor => EditorGUIUtility.isProSkin ? HexColor("#4d8dff") : HexColor("#1d4fd8");

        // --color-priority-*
        private static Color PriorityLow => EditorGUIUtility.isProSkin ? HexColor("#8b93a1") : HexColor("#64748b");
        private static Color PriorityMedium => EditorGUIUtility.isProSkin ? HexColor("#60a5fa") : HexColor("#2563eb");
        private static Color PriorityHigh => EditorGUIUtility.isProSkin ? HexColor("#fbbf24") : HexColor("#d97706");
        private static Color PriorityCritical => EditorGUIUtility.isProSkin ? HexColor("#f87171") : HexColor("#dc2626");

        public static Color PriorityColor(string priority)
        {
            switch (priority)
            {
                case "low": return PriorityLow;
                case "high": return PriorityHigh;
                case "critical": return PriorityCritical;
                default: return PriorityMedium;
            }
        }

        private static void SetBorderRadius(VisualElement element, float radius)
        {
            element.style.borderTopLeftRadius = radius;
            element.style.borderTopRightRadius = radius;
            element.style.borderBottomLeftRadius = radius;
            element.style.borderBottomRightRadius = radius;
        }

        private static void SetBorderWidth(VisualElement element, float width)
        {
            element.style.borderLeftWidth = width;
            element.style.borderRightWidth = width;
            element.style.borderTopWidth = width;
            element.style.borderBottomWidth = width;
        }

        private static void SetBorderColor(VisualElement element, Color color)
        {
            element.style.borderLeftColor = color;
            element.style.borderRightColor = color;
            element.style.borderTopColor = color;
            element.style.borderBottomColor = color;
        }

        public static void SetPadding(VisualElement element, float value)
        {
            element.style.paddingLeft = value;
            element.style.paddingRight = value;
            element.style.paddingTop = value;
            element.style.paddingBottom = value;
        }

        /// <summary>Applied to each window's rootVisualElement - matches the page backdrop (--color-background) the columns sit on, on the real site.</summary>
        public static void StyleRoot(VisualElement root)
        {
            root.style.backgroundColor = WindowBackground;
        }

        public static void StyleColumn(VisualElement column)
        {
            column.style.backgroundColor = ColumnBackground;
            SetBorderColor(column, BorderColor);
            SetBorderWidth(column, 1f);
            SetBorderRadius(column, 12f); // rounded-xl
            column.style.paddingLeft = 8f;
            column.style.paddingRight = 8f;
            column.style.paddingBottom = 8f;
            column.style.marginRight = 12f; // site uses gap-4 (16px); slightly tighter to fit more columns in a narrower Editor window
            column.style.width = 200f;
            column.style.flexShrink = 0;
            column.style.flexDirection = FlexDirection.Column;
        }

        /// <summary>The column header row - border-b border-border px-3 py-2.5 on the site.</summary>
        public static void StyleColumnHeader(VisualElement header)
        {
            header.style.paddingTop = 10f;
            header.style.paddingBottom = 10f;
            header.style.marginBottom = 8f;
            SetBorderColor(header, BorderColor);
            header.style.borderBottomWidth = 1f;
        }

        /// <summary>Called on every hover-target change while dragging - toggles a column's border to indicate it as the drop target (mirrors the site's own border-primary/40 drag-over state).</summary>
        public static void StyleColumnHighlighted(VisualElement column, bool highlighted)
        {
            SetBorderColor(column, highlighted ? AccentColor : BorderColor);
            SetBorderWidth(column, highlighted ? 2f : 1f);
        }

        public static void StyleCard(VisualElement card, bool dragging)
        {
            card.style.backgroundColor = CardBackground;
            SetBorderColor(card, BorderColor);
            SetBorderWidth(card, 1f);
            SetBorderRadius(card, 8f); // rounded-lg
            SetPadding(card, 10f); // site uses p-3 (12px)
            card.style.marginBottom = 8f;
            card.style.opacity = dragging ? 0.45f : 1f;
        }

        /// <summary>The site's priority dot is h-1.5 w-1.5 (6px), coloured per PRIORITY_DOT_CLASSES.</summary>
        public static void StylePriorityDot(VisualElement dot, string priority)
        {
            const float size = 6f;
            dot.style.width = size;
            dot.style.height = size;
            SetBorderRadius(dot, size / 2f);
            dot.style.backgroundColor = PriorityColor(priority);
            dot.style.marginRight = 8f;
            dot.style.marginTop = 4f;
        }

        /// <summary>Secondary text (priority/due-date line, comment timestamps) - text-[11px] text-muted-foreground on the site.</summary>
        public static void StyleMutedLabel(Label label)
        {
            label.style.color = MutedTextColor;
            label.style.fontSize = 11f;
        }

        /// <summary>A card's title - text-sm font-medium text-foreground on the site.</summary>
        public static void StyleTitleLabel(Label label)
        {
            label.style.whiteSpace = WhiteSpace.Normal;
            label.style.color = TextColor;
            label.style.fontSize = 13f;
            label.style.marginBottom = 6f;
        }

        /// <summary>A column/section heading - text-sm font-medium text-foreground on the site.</summary>
        public static void StyleSectionHeader(Label label)
        {
            label.style.color = TextColor;
            label.style.fontSize = 13f;
            label.style.unityFontStyleAndWeight = FontStyle.Bold;
        }
    }
}

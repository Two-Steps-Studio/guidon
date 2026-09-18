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
    /// copy). Colors are approximated by eye against the web app's dark
    /// theme - this plugin has no access to its actual CSS custom
    /// properties - and branch on EditorGUIUtility.isProSkin so the board
    /// doesn't end up illegible under Unity's Light editor skin.
    /// </summary>
    internal static class GuidonStyles
    {
        private static Color ColumnBackground => EditorGUIUtility.isProSkin
            ? new Color(0.20f, 0.20f, 0.22f)
            : new Color(0.85f, 0.85f, 0.87f);

        private static Color CardBackground => EditorGUIUtility.isProSkin
            ? new Color(0.27f, 0.27f, 0.30f)
            : new Color(0.97f, 0.97f, 0.99f);

        private static Color BorderColor => EditorGUIUtility.isProSkin
            ? new Color(0.35f, 0.35f, 0.38f)
            : new Color(0.7f, 0.7f, 0.72f);

        private static Color MutedTextColor => EditorGUIUtility.isProSkin
            ? new Color(0.65f, 0.65f, 0.68f)
            : new Color(0.35f, 0.35f, 0.37f);

        private static readonly Color AccentBlue = new Color(0.30f, 0.55f, 0.95f);

        private static readonly Color PriorityLow = new Color(0.45f, 0.55f, 0.65f);
        private static readonly Color PriorityMedium = new Color(0.85f, 0.70f, 0.25f);
        private static readonly Color PriorityHigh = new Color(0.90f, 0.50f, 0.20f);
        private static readonly Color PriorityCritical = new Color(0.85f, 0.30f, 0.30f);

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

        public static void StyleColumn(VisualElement column)
        {
            column.style.backgroundColor = ColumnBackground;
            SetBorderColor(column, BorderColor);
            SetBorderWidth(column, 1f);
            SetBorderRadius(column, 8f);
            SetPadding(column, 6f);
            column.style.marginRight = 8f;
            column.style.width = 190f;
            column.style.flexShrink = 0;
            column.style.flexDirection = FlexDirection.Column;
        }

        /// <summary>Called on every hover-target change while dragging - toggles a column's border to indicate it as the drop target.</summary>
        public static void StyleColumnHighlighted(VisualElement column, bool highlighted)
        {
            SetBorderColor(column, highlighted ? AccentBlue : BorderColor);
            SetBorderWidth(column, highlighted ? 2f : 1f);
        }

        public static void StyleCard(VisualElement card, bool dragging)
        {
            card.style.backgroundColor = CardBackground;
            SetBorderColor(card, BorderColor);
            SetBorderWidth(card, 1f);
            SetBorderRadius(card, 6f);
            SetPadding(card, 6f);
            card.style.marginBottom = 6f;
            card.style.opacity = dragging ? 0.45f : 1f;
        }

        public static void StylePriorityDot(VisualElement dot, string priority)
        {
            const float size = 8f;
            dot.style.width = size;
            dot.style.height = size;
            SetBorderRadius(dot, size / 2f);
            dot.style.backgroundColor = PriorityColor(priority);
            dot.style.marginRight = 6f;
            dot.style.marginTop = 3f;
        }

        public static void StyleMutedLabel(Label label)
        {
            label.style.color = MutedTextColor;
            label.style.fontSize = 10f;
        }

        public static void StyleTitleLabel(Label label)
        {
            label.style.whiteSpace = WhiteSpace.Normal;
            label.style.marginBottom = 4f;
        }

        public static void StyleSectionHeader(Label label)
        {
            label.style.unityFontStyleAndWeight = FontStyle.Bold;
            label.style.marginTop = 8f;
            label.style.marginBottom = 4f;
        }
    }
}

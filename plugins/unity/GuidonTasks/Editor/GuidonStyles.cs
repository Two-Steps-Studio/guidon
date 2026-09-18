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

        // --color-input (the site's Input/Select border - its own token,
        // equal to --color-border in both palettes today but kept
        // separate since the two are allowed to diverge)
        private static Color InputBorderColor => EditorGUIUtility.isProSkin ? HexColor("#23272f") : HexColor("#e2e8f0");

        // Unity's actual paintable input box is an internal child of the
        // control (TextField/DropdownField), not the control's own outer
        // element - these are the class names it's carried across the
        // Editor versions this plugin targets. Tried in order; if none
        // match on some future Unity version, StyleInputBox falls back to
        // styling the outer element itself rather than throwing, so a
        // version mismatch just degrades to "looks like default Unity."
        private static readonly string[] InputChildClassNames =
        {
            "unity-text-field__input",
            "unity-base-popup-field__input",
            "unity-base-field__input",
        };

        /// <summary>
        /// Restyles a built-in field (TextField, DropdownField, ...) to
        /// look like the site's Input/Select - transparent background,
        /// a --color-input border, rounded-md corners.
        /// </summary>
        public static void StyleInputBox(VisualElement field)
        {
            VisualElement input = field;
            foreach (string className in InputChildClassNames)
            {
                VisualElement found = field.Q(className: className);
                if (found != null)
                {
                    input = found;
                    break;
                }
            }

            input.style.backgroundColor = Color.clear;
            SetBorderColor(input, InputBorderColor);
            SetBorderWidth(input, 1f);
            SetBorderRadius(input, 6f); // rounded-md
            input.style.paddingLeft = 8f;
            input.style.paddingRight = 8f;
            input.style.color = TextColor;

            field.style.marginBottom = 8f;
        }

        /// <summary>
        /// Hides a field's own built-in inline label (Unity's default
        /// "Label: [box]" row) so a separate Label can sit above it
        /// instead, matching the site's stacked Label-then-Input layout.
        /// Best-effort in the same spirit as StyleInputBox - a class-name
        /// miss just leaves the inline label visible instead of throwing.
        /// </summary>
        private static void HideInlineLabel(VisualElement field)
        {
            VisualElement label = field.Q(className: "unity-base-field__label");
            if (label != null)
            {
                label.style.display = DisplayStyle.None;
            }

            field.style.flexDirection = FlexDirection.Column;
            field.style.marginLeft = 0f;
        }

        /// <summary>A field's own label, stacked above it - text-sm font-medium text-foreground on the site's Label. Public so a field with a custom header row (e.g. Description's Preview toggle) can match it exactly.</summary>
        public static void StyleFieldLabel(Label label)
        {
            label.style.color = TextColor;
            label.style.fontSize = 12f;
            label.style.marginBottom = 4f;
            label.style.marginTop = 4f;
        }

        /// <summary>
        /// Builds the site's Label-above-Input layout for a field
        /// constructed with no label of its own: adds a separate Label,
        /// hides the field's built-in inline one, restyles the input box,
        /// and appends both to `parent`.
        /// </summary>
        public static void AddLabeledField(VisualElement parent, string labelText, VisualElement field)
        {
            var label = new Label(labelText);
            StyleFieldLabel(label);
            parent.Add(label);

            HideInlineLabel(field);
            StyleInputBox(field);
            parent.Add(field);
        }

        // --color-primary / --color-primary-foreground
        private static Color PrimaryColor => EditorGUIUtility.isProSkin ? HexColor("#4d8dff") : HexColor("#1d4fd8");
        private static Color PrimaryForeground => HexColor("#ffffff");
        // --color-secondary / --color-secondary-foreground (the site's
        // outline/secondary Button variant)
        private static Color SecondaryColor => EditorGUIUtility.isProSkin ? HexColor("#1c1f26") : HexColor("#f1f5f9");
        private static Color SecondaryForeground => TextColor;
        // --color-destructive / --color-destructive-foreground
        private static Color DestructiveColor => EditorGUIUtility.isProSkin ? HexColor("#f87171") : HexColor("#dc2626");
        private static Color DestructiveForeground => HexColor("#ffffff");

        private static void StyleButtonBase(Button button)
        {
            SetBorderWidth(button, 0f);
            SetBorderRadius(button, 6f); // rounded-md
            button.style.paddingLeft = 12f;
            button.style.paddingRight = 12f;
            button.style.paddingTop = 4f;
            button.style.paddingBottom = 4f;
            button.style.unityFontStyleAndWeight = FontStyle.Bold;
            button.style.fontSize = 12f;
        }

        /// <summary>The site's default Button variant (solid --color-primary) - Log In, Save, Create.</summary>
        public static void StylePrimaryButton(Button button)
        {
            StyleButtonBase(button);
            button.style.backgroundColor = PrimaryColor;
            button.style.color = PrimaryForeground;
        }

        /// <summary>The site's outline/secondary Button variant - Refresh, Log Out, Cancel, Close.</summary>
        public static void StyleSecondaryButton(Button button)
        {
            StyleButtonBase(button);
            button.style.backgroundColor = SecondaryColor;
            button.style.color = SecondaryForeground;
        }

        /// <summary>The site's destructive Button variant - Delete.</summary>
        public static void StyleDestructiveButton(Button button)
        {
            StyleButtonBase(button);
            button.style.backgroundColor = DestructiveColor;
            button.style.color = DestructiveForeground;
        }

        /// <summary>A compact icon-only button (a column's "+", a subtask row's "x") - same secondary coloring, tighter roughly-square padding instead of a wide text button's.</summary>
        public static void StyleIconButton(Button button)
        {
            SetBorderWidth(button, 0f);
            SetBorderRadius(button, 6f);
            button.style.backgroundColor = SecondaryColor;
            button.style.color = SecondaryForeground;
            button.style.paddingLeft = 6f;
            button.style.paddingRight = 6f;
            button.style.paddingTop = 2f;
            button.style.paddingBottom = 2f;
            button.style.unityFontStyleAndWeight = FontStyle.Bold;
        }

        /// <summary>A plain-text "link" - transparent, borderless, accent-colored - used for the header's link to the website.</summary>
        public static void StyleLinkButton(Button button)
        {
            button.style.backgroundColor = Color.clear;
            SetBorderWidth(button, 0f);
            button.style.color = AccentColor;
            button.style.unityFontStyleAndWeight = FontStyle.Bold;
            button.style.fontSize = 13f;
            button.style.paddingLeft = 0f;
            button.style.paddingRight = 0f;
            button.style.marginLeft = 0f;
        }
    }
}

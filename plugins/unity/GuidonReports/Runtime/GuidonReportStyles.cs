using UnityEngine;

namespace Guidon.Reports
{
    /// <summary>
    /// IMGUI styles for the report form in the Guidon website's dark tokens
    /// (src/app/globals.css): a rounded card, bordered inputs, a solid
    /// brand-blue primary button. Textures are generated once at runtime
    /// (rounded 9-slice), so the package ships no image assets.
    /// </summary>
    internal static class GuidonReportStyles
    {
        public static readonly Color Card = Hex(0x101317);
        public static readonly Color Background = Hex(0x0b0d10);
        public static readonly Color Border = Hex(0x23272f);
        public static readonly Color Muted = Hex(0x16191f);
        public static readonly Color Text = Hex(0xe8eaed);
        public static readonly Color TextMuted = Hex(0x8b93a1);
        public static readonly Color Primary = Hex(0x4d8dff);
        public static readonly Color PrimaryHover = Hex(0x6ea3ff);
        public static readonly Color PrimaryForeground = Hex(0x05142e);
        public static readonly Color Danger = Hex(0xf87171);
        public static readonly Color Success = Hex(0x34d399);

        private static bool _built;
        public static GUIStyle Window, Heading, Label, TextField, TextArea, Primary_, Secondary, Tab, TabActive, Toggle, Status;

        private static Color Hex(int rgb) => new Color(((rgb >> 16) & 0xff) / 255f, ((rgb >> 8) & 0xff) / 255f, (rgb & 0xff) / 255f, 1f);

        public static void Ensure()
        {
            if (_built && Window != null && Window.normal.background != null) return;
            _built = true;

            Window = new GUIStyle(GUI.skin.box)
            {
                normal = { background = Rounded(Card, Border, 12), textColor = Text },
                border = new RectOffset(12, 12, 12, 12),
                padding = new RectOffset(20, 20, 18, 18),
            };
            Heading = new GUIStyle(GUI.skin.label) { fontSize = 18, fontStyle = FontStyle.Bold, normal = { textColor = Text } };
            Label = new GUIStyle(GUI.skin.label) { normal = { textColor = TextMuted }, margin = new RectOffset(0, 0, 8, 2) };
            Status = new GUIStyle(GUI.skin.label) { wordWrap = true, normal = { textColor = Success } };
            TextField = Input(GUI.skin.textField);
            TextArea = Input(GUI.skin.textArea);
            TextArea.wordWrap = true;

            Primary_ = Button(Primary, Primary, PrimaryHover, PrimaryForeground);
            Secondary = Button(Card, Border, Muted, Text);
            Tab = Button(Background, Border, Muted, TextMuted);
            TabActive = Button(Muted, Primary, Muted, Text);
            Toggle = new GUIStyle(GUI.skin.toggle) { normal = { textColor = Text }, onNormal = { textColor = Text }, hover = { textColor = Text }, onHover = { textColor = Text } };
        }

        private static GUIStyle Input(GUIStyle source)
        {
            return new GUIStyle(source)
            {
                normal = { background = Rounded(Background, Border, 6), textColor = Text },
                hover = { background = Rounded(Background, Border, 6), textColor = Text },
                focused = { background = Rounded(Background, Primary, 6), textColor = Text },
                border = new RectOffset(6, 6, 6, 6),
                padding = new RectOffset(8, 8, 6, 6),
            };
        }

        private static GUIStyle Button(Color fill, Color border, Color hoverFill, Color text)
        {
            Texture2D normal = Rounded(fill, border, 6);
            Texture2D hover = Rounded(hoverFill, hoverFill == fill ? border : (fill == Primary ? hoverFill : border), 6);
            return new GUIStyle(GUI.skin.button)
            {
                normal = { background = normal, textColor = text },
                hover = { background = hover, textColor = text },
                active = { background = hover, textColor = text },
                focused = { background = normal, textColor = text },
                border = new RectOffset(6, 6, 6, 6),
                padding = new RectOffset(12, 12, 6, 6),
                fontStyle = FontStyle.Bold,
            };
        }

        /// <summary>A rounded rectangle with a 1px outline, sized for 9-slicing with border = radius.</summary>
        private static Texture2D Rounded(Color fill, Color outline, int radius)
        {
            int size = radius * 2 + 2;
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave, filterMode = FilterMode.Bilinear };
            var pixels = new Color[size * size];
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    // Distance outside the rounded corner, per corner quadrant.
                    float cx = x < radius ? radius - 0.5f : x >= size - radius ? size - radius - 0.5f : x;
                    float cy = y < radius ? radius - 0.5f : y >= size - radius ? size - radius - 0.5f : y;
                    float d = Vector2.Distance(new Vector2(x, y), new Vector2(cx, cy));
                    float coverage = Mathf.Clamp01(radius - d + 0.5f);
                    bool edge = d > radius - 1.5f || x == 0 || y == 0 || x == size - 1 || y == size - 1;
                    Color c = edge ? outline : fill;
                    c.a *= coverage;
                    pixels[y * size + x] = c;
                }
            }
            texture.SetPixels(pixels);
            texture.Apply();
            return texture;
        }
    }
}

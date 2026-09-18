using System;
using UnityEngine;

namespace Guidon.Tasks.Editor
{
    /// <summary>
    /// The Guidon icon (from src/app/icon.png, downscaled to 64x64 and
    /// re-encoded), embedded as a Base64 string rather than a separate
    /// image asset - same reasoning as GuidonStyles.cs having no external
    /// .uss file: this plugin can be copied anywhere under Assets/, so
    /// there is no reliable project-relative path to load an image asset
    /// from after that copy. A Texture2D built from embedded bytes at
    /// runtime has no such path dependency at all.
    /// </summary>
    internal static class GuidonLogo
    {
        private const string IconBase64 =
            "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";

        private static Texture2D _cached;

        public static Texture2D GetTexture()
        {
            if (_cached != null) return _cached;

            try
            {
                byte[] bytes = Convert.FromBase64String(IconBase64);
                var texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                if (texture.LoadImage(bytes))
                {
                    _cached = texture;
                }
            }
            catch (Exception)
            {
                // Never worth failing the whole window over a missing logo -
                // GuidonTasksWindow treats a null return as "skip the icon".
            }

            return _cached;
        }
    }
}

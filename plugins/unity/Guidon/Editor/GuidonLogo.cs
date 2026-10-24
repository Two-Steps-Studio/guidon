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
            "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAACqklEQVR4nO2aO2gUYRDHvzx8gKIgSgg3szESmwiCxP6aqMF4MxdkG0GxinbaCTYRbGxtJGIhWNqKhUSIFnYBY0xu5k5FUFFBQXwgGDQr313EKxJNVje3dzs/+Nqbmf/O/L8H55xhGIZhGIZh/BVkuQAkl9K+kOWUSwIg+YCsUfqX3DcBkgCsA8RGABs+3+YBUSpNEEhKQHp17ZaUUiaAjicSdNlcdNwEYOuAyEaAzQMiM0HO4C6ALOeBdGqphSTXWl6AhgAmgFgHYIwRwMLcntprkk4hy0JLXoZghR7Qw7IzKMookN4C0vnMCVAPhLPbAtIQSG4Ay8fMCVBPT/75xoDKg8B6GVleZU6AP/tGBgWoJyhoL5KcAZaJlflGiwlQT/cR3Y4sJ4FlLpMC/MIeRMhehMZTNQLI+gSLpYOJBG4SAaKaF8hdJNmfSALOuf5wdj2SnAbS16kUAGsJLADrzdzw3O7/FXtgdGodUvkEkDxN5TaIS+8M8/4NPxgpdccOOha1++MyslbScBC6giTfV38y0y/IerFvqLJlxcHCqCNgPV71lrScBD25gu4F0jsxRPCJvUPWs31DlQ1uOcaidmA5hqwaL0a18667pAmoPIgk07GSJHnhr8T+K//+xagNWQpI8jBu4Uj62I+LWzPCqKN6t2d9E7MjHuW4fDjHctQnH7twVq0VHrW5RtB1YHpTwHoOWT/9QxFxOulltZPyk50uDcBwOeddP6ZRrqbV33vB/RuCSyMBVfqR5HYChX/2/wLbFT7b6pqBoGqUOvOvhQPpN99ZvYWZLtd05Cc7F43ybYzCqwcpP1qu2dkRzm72T1xI8rURR+nUkBupwKJR/ljyq7NM9FBln2t1gqIMIOm9unZ/AMVS3mUNYC0Cy6FG52EYhmEYhuGyxk8yXmAUvmxJlwAAAABJRU5ErkJggg==";

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

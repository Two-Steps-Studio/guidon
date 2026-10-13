using System.Linq;
using Guidon.Reports;
using UnityEditor;
using UnityEngine;

namespace Guidon.Tasks.Editor
{
    /// <summary>
    /// The board's "Set Up In-Game Reports": finds the project's
    /// GuidonReportsSettings asset (any Resources folder, named as the
    /// reporter loads it) or creates one in Assets/Resources, and writes the
    /// server, project and report key into it. The reporter
    /// (Runtime/GuidonReporter.cs) does nothing until this asset exists, so a
    /// project that only uses the board ships nothing that runs.
    /// </summary>
    internal static class GuidonReportsSetup
    {
        private const string DefaultFolder = "Assets/Resources";
        private const string DefaultPath = DefaultFolder + "/" + GuidonReportsSettings.ResourcePath + ".asset";

        /// <summary>The asset the reporter will load, or null. Only one named GuidonReportsSettings inside a Resources folder counts.</summary>
        public static GuidonReportsSettings Find()
        {
            return AssetDatabase.FindAssets("t:" + nameof(GuidonReportsSettings))
                .Select(AssetDatabase.GUIDToAssetPath)
                .Where(path => path.Contains("/Resources/") && System.IO.Path.GetFileNameWithoutExtension(path) == GuidonReportsSettings.ResourcePath)
                .Select(AssetDatabase.LoadAssetAtPath<GuidonReportsSettings>)
                .FirstOrDefault(asset => asset != null);
        }

        public static void Apply(string baseUrl, string projectId, string reportKey)
        {
            var settings = Find();
            if (settings == null)
            {
                if (!AssetDatabase.IsValidFolder(DefaultFolder)) AssetDatabase.CreateFolder("Assets", "Resources");
                settings = ScriptableObject.CreateInstance<GuidonReportsSettings>();
                AssetDatabase.CreateAsset(settings, DefaultPath);
            }

            Undo.RecordObject(settings, "Set Up Guidon Reports");
            settings.baseUrl = baseUrl.TrimEnd('/');
            settings.projectId = projectId;
            settings.reportKey = reportKey;
            EditorUtility.SetDirty(settings);
            AssetDatabase.SaveAssets();
        }
    }
}

using UnityEditor;

namespace Guidon.Tasks.Editor
{
    /// <summary>
    /// Machine-wide settings for the Guidon Tasks window, backed by
    /// EditorPrefs rather than a project asset - deliberately, so the API
    /// key can never end up committed to the user's own Unity project repo.
    /// Trade-off, stated plainly: the key is shared across every Unity
    /// project on this machine, not scoped per-project.
    /// </summary>
    internal static class GuidonSettings
    {
        private const string BaseUrlKey = "Guidon.Tasks.BaseUrl";
        private const string ApiKeyKey = "Guidon.Tasks.ApiKey";
        private const string ProjectIdKey = "Guidon.Tasks.ProjectId";

        public static string BaseUrl
        {
            get => EditorPrefs.GetString(BaseUrlKey, "https://useguidon.com");
            set => EditorPrefs.SetString(BaseUrlKey, value);
        }

        public static string ApiKey
        {
            get => EditorPrefs.GetString(ApiKeyKey, string.Empty);
            set => EditorPrefs.SetString(ApiKeyKey, value);
        }

        /// <summary>Last-selected Guidon project id, restored on window reopen.</summary>
        public static string ProjectId
        {
            get => EditorPrefs.GetString(ProjectIdKey, string.Empty);
            set => EditorPrefs.SetString(ProjectIdKey, value);
        }

        public static bool IsConfigured => !string.IsNullOrEmpty(ApiKey) && !string.IsNullOrEmpty(BaseUrl);
    }
}

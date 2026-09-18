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
        private const string EmailKey = "Guidon.Tasks.Email";
        private const string ProjectIdKey = "Guidon.Tasks.ProjectId";

        public static string BaseUrl
        {
            get => EditorPrefs.GetString(BaseUrlKey, "https://useguidon.com");
            set => EditorPrefs.SetString(BaseUrlKey, value);
        }

        /// <summary>
        /// The API key obtained by logging in (POST /api/v1/auth/login) -
        /// this plugin never asks for or stores a password. Never rendered
        /// back in the UI once set; only "Logged in as {Email}" is shown.
        /// </summary>
        public static string ApiKey
        {
            get => EditorPrefs.GetString(ApiKeyKey, string.Empty);
            set => EditorPrefs.SetString(ApiKeyKey, value);
        }

        /// <summary>Display-only - the email of whoever last logged in, for the "Logged in as" line.</summary>
        public static string Email
        {
            get => EditorPrefs.GetString(EmailKey, string.Empty);
            set => EditorPrefs.SetString(EmailKey, value);
        }

        /// <summary>Last-selected Guidon project id, restored on window reopen.</summary>
        public static string ProjectId
        {
            get => EditorPrefs.GetString(ProjectIdKey, string.Empty);
            set => EditorPrefs.SetString(ProjectIdKey, value);
        }

        public static bool IsConfigured => !string.IsNullOrEmpty(ApiKey) && !string.IsNullOrEmpty(BaseUrl);

        /// <summary>
        /// Clears the locally-stored key/email. Doesn't revoke the key
        /// server-side (Profile > API Keys still shows "Unity Plugin" as
        /// active) - logging back in reissues one anyway (see the login
        /// route's own doc comment), and adding a revoke-on-logout call is
        /// unnecessary complexity for a personal dev tool's log-out button.
        /// </summary>
        public static void LogOut()
        {
            ApiKey = string.Empty;
            Email = string.Empty;
        }
    }
}

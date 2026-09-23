using UnityEngine;

namespace Guidon.Reports
{
    /// <summary>
    /// Project-wide reporter configuration. Create one with
    /// Assets > Create > Guidon > Report Settings and put it in any
    /// <c>Resources</c> folder, named exactly <c>GuidonReportsSettings</c> -
    /// the reporter loads it from there at startup and does nothing if it's
    /// missing.
    /// </summary>
    [CreateAssetMenu(menuName = "Guidon/Report Settings", fileName = "GuidonReportsSettings")]
    public class GuidonReportsSettings : ScriptableObject
    {
        public const string ResourcePath = "GuidonReportsSettings";

        [Tooltip("Your Guidon instance, e.g. https://useguidon.com")]
        public string baseUrl = "https://useguidon.com";

        [Tooltip("The project reports go to - the id in the project's URL (/projects/<id>/...).")]
        public string projectId = "";

        [Tooltip("An API key with ONLY the reports:write scope (Profile > API Keys). It ships inside your build, so assume players can read it; that scope can file reports and nothing else.")]
        public string reportKey = "";

        [Tooltip("Key that opens the report form.")]
        public KeyCode hotkey = KeyCode.F8;

        [Tooltip("Off by default: only development builds and the Editor get the reporter. Turn on for public playtests/early access.")]
        public bool enabledInReleaseBuilds = false;

        [Tooltip("File a 'crash' report automatically on an unhandled exception (at most one per minute, one per distinct message per session).")]
        public bool autoReportExceptions = false;

        [Tooltip("Pause the game (Time.timeScale = 0) while the form is open.")]
        public bool pauseWhileOpen = true;

        [Tooltip("How many recent log lines to attach as log.txt.")]
        [Range(0, 2000)]
        public int logLines = 300;

        [Tooltip("JPEG quality of the attached screenshot.")]
        [Range(30, 100)]
        public int screenshotQuality = 85;

        public bool IsConfigured =>
            !string.IsNullOrWhiteSpace(baseUrl) && !string.IsNullOrWhiteSpace(projectId) && !string.IsNullOrWhiteSpace(reportKey);
    }
}

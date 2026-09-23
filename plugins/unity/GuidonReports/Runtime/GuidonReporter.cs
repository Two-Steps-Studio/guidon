using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Guidon.Reports
{
    /// <summary>
    /// The in-game reporter: press the hotkey (F8 by default), describe the
    /// problem, and a Guidon task is created with a screenshot, the recent
    /// log and build/device/scene details.
    ///
    /// Starts itself before the first scene loads when a
    /// GuidonReportsSettings asset is found in Resources and the build is
    /// allowed to report (see enabledInReleaseBuilds) - no scene setup needed.
    ///
    /// The form is IMGUI on purpose: it needs no UI package, no Canvas, no
    /// EventSystem and no input-system setting, so it can't clash with the
    /// game's own UI stack. Games with their own report UI can call
    /// <see cref="Submit"/> directly instead.
    /// </summary>
    public class GuidonReporter : MonoBehaviour
    {
        /// <summary>Add your own fields (player position, quest, save slot...) to every report.</summary>
        public static event Action<IDictionary<string, string>> CollectMetadata;

        public static GuidonReporter Instance { get; private set; }

        public static bool IsOpen => Instance != null && Instance._open;

        private static readonly string[] Categories = { "bug", "crash", "feedback" };
        private static readonly string[] CategoryLabels = { "Bug", "Crash", "Feedback" };
        private const string ReporterPrefKey = "Guidon.Reports.Reporter";
        private const float AutoReportCooldownSeconds = 60f;

        private GuidonReportsSettings _settings;
        private readonly Queue<string> _log = new Queue<string>();
        private readonly object _logLock = new object();
        private readonly HashSet<string> _autoReported = new HashSet<string>();
        private float _lastAutoReport = -AutoReportCooldownSeconds;

        private bool _open;
        private bool _sending;
        private string _title = "";
        private string _description = "";
        private string _reporter = "";
        private int _category;
        private bool _includeScreenshot = true;
        private bool _includeLog = true;
        private string _status = "";
        private bool _statusIsError;
        private byte[] _screenshot;
        private Texture2D _thumbnail;
        private Vector2 _scroll;

        private float _previousTimeScale = 1f;
        private bool _previousCursorVisible;
        private CursorLockMode _previousCursorLock;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Bootstrap()
        {
            var settings = Resources.Load<GuidonReportsSettings>(GuidonReportsSettings.ResourcePath);
            if (settings == null) return;
            if (!Application.isEditor && !Debug.isDebugBuild && !settings.enabledInReleaseBuilds) return;
            if (!settings.IsConfigured)
            {
                Debug.LogWarning("[Guidon] GuidonReportsSettings is missing the base URL, project id or report key - the reporter is disabled.");
                return;
            }

            var host = new GameObject("[Guidon Reporter]");
            DontDestroyOnLoad(host);
            host.AddComponent<GuidonReporter>()._settings = settings;
        }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            _reporter = PlayerPrefs.GetString(ReporterPrefKey, "");
            Application.logMessageReceivedThreaded += OnLog;
        }

        private void OnDestroy()
        {
            if (Instance != this) return;
            Application.logMessageReceivedThreaded -= OnLog;
            if (_open) RestoreGameState();
            if (_thumbnail != null) Destroy(_thumbnail);
            Instance = null;
        }

        /// <summary>Opens the form, capturing the screen first so the form itself isn't in the screenshot.</summary>
        public static void Open()
        {
            if (Instance != null && !Instance._open) Instance.StartCoroutine(Instance.CaptureThenOpen());
        }

        /// <summary>
        /// Sends a report without the built-in form - for games with their own UI.
        /// Metadata, log and (when <paramref name="screenshot"/> is null and
        /// <paramref name="captureScreenshot"/> is true) a screenshot are added automatically.
        /// </summary>
        public static void Submit(string title, string description, string category = "bug",
            bool captureScreenshot = true, Action<bool, string> done = null, byte[] screenshot = null)
        {
            if (Instance == null)
            {
                done?.Invoke(false, "Guidon reporter is not running (missing settings, or disabled in release builds).");
                return;
            }
            Instance.StartCoroutine(Instance.SubmitRoutine(title, description, category, captureScreenshot, screenshot, done));
        }

        private IEnumerator SubmitRoutine(string title, string description, string category, bool capture, byte[] screenshot, Action<bool, string> done)
        {
            if (screenshot == null && capture)
            {
                yield return new WaitForEndOfFrame();
                screenshot = CaptureJpeg();
            }
            yield return GuidonReportClient.Send(_settings, BuildReport(title, description, category, "", screenshot, true), done);
        }

        // --- hotkey + form ---------------------------------------------------

        private void OnGUI()
        {
            Event e = Event.current;
            if (!_open)
            {
                // IMGUI key events arrive regardless of the Input Manager / Input System setting.
                if (e.type == EventType.KeyDown && e.keyCode == _settings.hotkey)
                {
                    e.Use();
                    Open();
                }
                return;
            }

            if (e.type == EventType.KeyDown && e.keyCode == KeyCode.Escape && !_sending)
            {
                e.Use();
                Close();
                return;
            }

            GUI.depth = -1000;
            GuidonReportStyles.Ensure();
            float width = Mathf.Min(560f, Screen.width - 40f);
            float height = Mathf.Min(560f, Screen.height - 40f);
            var rect = new Rect((Screen.width - width) / 2f, (Screen.height - height) / 2f, width, height);
            // Dim the game behind the form.
            Color previousColor = GUI.color;
            GUI.color = new Color(0f, 0f, 0f, 0.55f);
            GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), Texture2D.whiteTexture);
            GUI.color = previousColor;
            GUILayout.BeginArea(rect, GuidonReportStyles.Window);
            _scroll = GUILayout.BeginScrollView(_scroll);

            GUILayout.Label("Report a problem", GuidonReportStyles.Heading);
            GUILayout.Space(6);
            GUILayout.BeginHorizontal();
            for (int i = 0; i < CategoryLabels.Length; i++)
            {
                if (GUILayout.Button(CategoryLabels[i], i == _category ? GuidonReportStyles.TabActive : GuidonReportStyles.Tab)) _category = i;
            }
            GUILayout.FlexibleSpace();
            GUILayout.EndHorizontal();
            GUILayout.Label("What happened? (short title)", GuidonReportStyles.Label);
            GUI.SetNextControlName("GuidonTitle");
            _title = GUILayout.TextField(_title, 200, GuidonReportStyles.TextField);
            GUILayout.Label("Details - what did you do, what did you expect?", GuidonReportStyles.Label);
            _description = GUILayout.TextArea(_description, 5000, GuidonReportStyles.TextArea, GUILayout.MinHeight(110));
            GUILayout.Label("Your name or email (optional)", GuidonReportStyles.Label);
            _reporter = GUILayout.TextField(_reporter, 200, GuidonReportStyles.TextField);

            GUILayout.Space(6);
            GUILayout.BeginHorizontal();
            _includeScreenshot = GUILayout.Toggle(_includeScreenshot && _screenshot != null, " Attach screenshot", GuidonReportStyles.Toggle) && _screenshot != null;
            _includeLog = GUILayout.Toggle(_includeLog, " Attach log", GuidonReportStyles.Toggle);
            GUILayout.EndHorizontal();
            if (_thumbnail != null && _includeScreenshot)
            {
                float thumbWidth = Mathf.Min(240f, width - 40f);
                GUILayout.Box(_thumbnail, GUILayout.Width(thumbWidth), GUILayout.Height(thumbWidth * _thumbnail.height / Mathf.Max(1, _thumbnail.width)));
            }

            if (!string.IsNullOrEmpty(_status))
            {
                GuidonReportStyles.Status.normal.textColor = _statusIsError ? GuidonReportStyles.Danger : GuidonReportStyles.Success;
                GUILayout.Label(_status, GuidonReportStyles.Status);
            }

            GUILayout.EndScrollView();
            GUILayout.BeginHorizontal();
            GUILayout.FlexibleSpace();
            GUI.enabled = !_sending;
            if (GUILayout.Button("Cancel", GuidonReportStyles.Secondary, GUILayout.Height(30))) Close();
            GUI.enabled = !_sending && _title.Trim().Length > 0;
            if (GUILayout.Button(_sending ? "Sending\u2026" : "Send", GuidonReportStyles.Primary_, GUILayout.Height(30))) StartCoroutine(SendFromForm());
            GUI.enabled = true;
            GUILayout.EndHorizontal();
            GUILayout.EndArea();

            if (e.type == EventType.Repaint && GUI.GetNameOfFocusedControl() == "" && _title.Length == 0)
            {
                GUI.FocusControl("GuidonTitle");
            }
        }

        private IEnumerator CaptureThenOpen()
        {
            yield return new WaitForEndOfFrame();
            _screenshot = CaptureJpeg();
            if (_thumbnail != null) Destroy(_thumbnail);
            _thumbnail = null;
            if (_screenshot != null)
            {
                _thumbnail = new Texture2D(2, 2);
                _thumbnail.LoadImage(_screenshot);
            }

            _title = "";
            _description = "";
            _category = 0;
            _status = "";
            _includeScreenshot = _screenshot != null;
            _includeLog = true;
            _open = true;

            _previousCursorVisible = Cursor.visible;
            _previousCursorLock = Cursor.lockState;
            Cursor.visible = true;
            Cursor.lockState = CursorLockMode.None;
            if (_settings.pauseWhileOpen)
            {
                _previousTimeScale = Time.timeScale;
                Time.timeScale = 0f;
            }
        }

        private IEnumerator SendFromForm()
        {
            _sending = true;
            _status = "";
            PlayerPrefs.SetString(ReporterPrefKey, _reporter.Trim());

            GuidonReport report = BuildReport(_title, _description, Categories[_category], _reporter,
                _includeScreenshot ? _screenshot : null, _includeLog);
            bool ok = false;
            string message = "";
            yield return GuidonReportClient.Send(_settings, report, (success, text) =>
            {
                ok = success;
                message = text;
            });

            _sending = false;
            _status = message;
            _statusIsError = !ok;
            if (ok)
            {
                // Let the player see the confirmation briefly; realtime because the game may be paused.
                yield return new WaitForSecondsRealtime(1.2f);
                Close();
            }
        }

        private void Close()
        {
            if (!_open) return;
            _open = false;
            RestoreGameState();
        }

        private void RestoreGameState()
        {
            Cursor.visible = _previousCursorVisible;
            Cursor.lockState = _previousCursorLock;
            if (_settings != null && _settings.pauseWhileOpen) Time.timeScale = _previousTimeScale;
        }

        // --- report contents --------------------------------------------------

        private GuidonReport BuildReport(string title, string description, string category, string reporter, byte[] screenshot, bool includeLog)
        {
            var metadata = new Dictionary<string, string>
            {
                ["build"] = Application.version,
                ["unity"] = Application.unityVersion,
                ["platform"] = Application.platform.ToString(),
                ["os"] = SystemInfo.operatingSystem,
                ["device"] = SystemInfo.deviceModel,
                ["gpu"] = SystemInfo.graphicsDeviceName,
                ["memory_mb"] = SystemInfo.systemMemorySize.ToString(CultureInfo.InvariantCulture),
                ["scene"] = SceneManager.GetActiveScene().name,
                ["resolution"] = Screen.width + "x" + Screen.height,
                ["fps"] = (1f / Mathf.Max(0.0001f, Time.smoothDeltaTime)).ToString("0", CultureInfo.InvariantCulture),
                ["play_time_s"] = Time.realtimeSinceStartup.ToString("0", CultureInfo.InvariantCulture),
                ["development_build"] = Debug.isDebugBuild ? "yes" : "no",
            };
            try
            {
                CollectMetadata?.Invoke(metadata);
            }
            catch (Exception exception)
            {
                metadata["metadata_error"] = exception.Message;
            }

            return new GuidonReport
            {
                Title = title,
                Description = description,
                Category = category,
                Reporter = reporter,
                Metadata = metadata,
                Screenshot = screenshot,
                Log = includeLog ? RecentLog() : null,
            };
        }

        /// <summary>Must run after WaitForEndOfFrame. Null if capture isn't possible (e.g. batch mode).</summary>
        private byte[] CaptureJpeg()
        {
            Texture2D texture = null;
            try
            {
                texture = ScreenCapture.CaptureScreenshotAsTexture();
                return texture != null ? texture.EncodeToJPG(_settings.screenshotQuality) : null;
            }
            catch (Exception exception)
            {
                Debug.LogWarning("[Guidon] Screenshot failed: " + exception.Message);
                return null;
            }
            finally
            {
                if (texture != null) Destroy(texture);
            }
        }

        // --- log capture + auto-report ------------------------------------------

        private void OnLog(string message, string stackTrace, LogType type)
        {
            if (_settings == null || _settings.logLines <= 0) return;
            var line = new StringBuilder();
            line.Append(DateTime.Now.ToString("HH:mm:ss.fff", CultureInfo.InvariantCulture)).Append(" [").Append(type).Append("] ").Append(message);
            if ((type == LogType.Exception || type == LogType.Error) && !string.IsNullOrEmpty(stackTrace))
            {
                line.Append('\n').Append(stackTrace.TrimEnd());
            }

            lock (_logLock)
            {
                _log.Enqueue(line.ToString());
                while (_log.Count > _settings.logLines) _log.Dequeue();
            }

            // Threaded callback: hop to the main thread for anything Unity-side.
            if (type == LogType.Exception && _settings.autoReportExceptions && !message.StartsWith("[Guidon]", StringComparison.Ordinal))
            {
                string key = message.Length > 200 ? message.Substring(0, 200) : message;
                lock (_logLock)
                {
                    if (!_pendingAutoReports.Contains(key)) _pendingAutoReports.Enqueue(key);
                }
            }
        }

        private readonly Queue<string> _pendingAutoReports = new Queue<string>();

        private void Update()
        {
            string key = null;
            lock (_logLock)
            {
                if (_pendingAutoReports.Count > 0) key = _pendingAutoReports.Dequeue();
            }
            if (key == null) return;
            if (_autoReported.Contains(key) || Time.realtimeSinceStartup - _lastAutoReport < AutoReportCooldownSeconds) return;

            _autoReported.Add(key);
            _lastAutoReport = Time.realtimeSinceStartup;
            Submit(key, "Filed automatically by the Guidon reporter after an unhandled exception.", "crash", true,
                (ok, text) => { if (!ok) Debug.LogWarning("[Guidon] Automatic crash report failed: " + text); });
        }

        private string RecentLog()
        {
            lock (_logLock)
            {
                return _log.Count == 0 ? null : string.Join("\n", _log.ToArray());
            }
        }
    }
}

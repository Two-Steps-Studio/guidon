using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Guidon.Reports
{
    /// <summary>One report as it will be sent. Build it yourself for a custom UI, or let GuidonReporter's form do it.</summary>
    public class GuidonReport
    {
        public string Title = "";
        public string Description = "";
        /// <summary>"bug", "crash" or "feedback".</summary>
        public string Category = "bug";
        /// <summary>Optional name/email the player typed.</summary>
        public string Reporter = "";
        /// <summary>Shown as a table in the task. Values are flattened to one line server-side.</summary>
        public Dictionary<string, string> Metadata = new Dictionary<string, string>();
        /// <summary>JPEG bytes, or null for no screenshot.</summary>
        public byte[] Screenshot;
        /// <summary>Log text, or null for no log.</summary>
        public string Log;
    }

    /// <summary>
    /// Posts a report to POST /api/v1/projects/{id}/reports as
    /// multipart/form-data. UnityWebRequest only - no package dependency, and
    /// it works on every platform Unity builds for, WebGL included (which
    /// requires the Guidon server to allow the game's origin via CORS).
    /// </summary>
    public static class GuidonReportClient
    {
        public const int TimeoutSeconds = 30;

        /// <summary>Coroutine: <c>StartCoroutine(GuidonReportClient.Send(settings, report, (ok, message) => ...))</c>.</summary>
        public static IEnumerator Send(GuidonReportsSettings settings, GuidonReport report, Action<bool, string> done)
        {
            if (settings == null || !settings.IsConfigured)
            {
                done?.Invoke(false, "Guidon reporting is not configured.");
                yield break;
            }

            var form = new List<IMultipartFormSection>
            {
                new MultipartFormDataSection("title", report.Title ?? ""),
                new MultipartFormDataSection("description", report.Description ?? ""),
                new MultipartFormDataSection("category", string.IsNullOrEmpty(report.Category) ? "bug" : report.Category),
                new MultipartFormDataSection("metadata", ToJsonObject(report.Metadata)),
            };
            if (!string.IsNullOrWhiteSpace(report.Reporter)) form.Add(new MultipartFormDataSection("reporter", report.Reporter));
            if (report.Screenshot != null && report.Screenshot.Length > 0)
                form.Add(new MultipartFormFileSection("file", report.Screenshot, "screenshot.jpg", "image/jpeg"));
            if (!string.IsNullOrEmpty(report.Log))
                form.Add(new MultipartFormFileSection("file", Encoding.UTF8.GetBytes(report.Log), "log.txt", "text/plain"));

            string url = settings.baseUrl.Trim().TrimEnd('/') + "/api/v1/projects/" + settings.projectId.Trim() + "/reports";
            using (UnityWebRequest request = UnityWebRequest.Post(url, form))
            {
                request.SetRequestHeader("Authorization", "Bearer " + settings.reportKey.Trim());
                request.timeout = TimeoutSeconds;
                yield return request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    done?.Invoke(true, "Report sent - thank you!");
                }
                else
                {
                    string serverError = ExtractError(request.downloadHandler?.text);
                    string code = request.responseCode > 0 ? request.responseCode.ToString(CultureInfo.InvariantCulture) + " " : "";
                    done?.Invoke(false, code + (serverError ?? request.error ?? "Request failed."));
                }
            }
        }

        /// <summary>A flat JSON object of strings - what the endpoint's `metadata` field expects.</summary>
        public static string ToJsonObject(IDictionary<string, string> values)
        {
            var sb = new StringBuilder("{");
            bool first = true;
            if (values != null)
            {
                foreach (var pair in values)
                {
                    if (string.IsNullOrEmpty(pair.Key)) continue;
                    if (!first) sb.Append(',');
                    first = false;
                    AppendJsonString(sb, pair.Key);
                    sb.Append(':');
                    AppendJsonString(sb, pair.Value ?? "");
                }
            }
            return sb.Append('}').ToString();
        }

        private static void AppendJsonString(StringBuilder sb, string value)
        {
            sb.Append('"');
            foreach (char c in value)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }

        [Serializable]
        private class ErrorBody
        {
            public string error;
        }

        private static string ExtractError(string body)
        {
            if (string.IsNullOrEmpty(body)) return null;
            try
            {
                string error = JsonUtility.FromJson<ErrorBody>(body)?.error;
                return string.IsNullOrEmpty(error) ? null : error;
            }
            catch (Exception)
            {
                return null;
            }
        }
    }
}

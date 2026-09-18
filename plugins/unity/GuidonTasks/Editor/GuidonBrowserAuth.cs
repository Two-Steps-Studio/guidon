using System;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;

namespace Guidon.Tasks.Editor
{
    /// <summary>
    /// Browser-based login: opens the real Guidon website (login page,
    /// password reset, OAuth - everything it already has) instead of
    /// reimplementing a login form inside the Editor's IMGUI. Same loopback
    /// pattern well-known CLI tools use (gh auth login, gcloud auth login,
    /// Docker Desktop) - start a tiny local HTTP listener, send the browser
    /// to the website with the listener's address as the return target, and
    /// receive the issued API key back on that local port once the user
    /// approves on /auth/plugin-login.
    /// </summary>
    internal static class GuidonBrowserAuth
    {
        private const int PortRangeStart = 51820;
        private const int PortRangeEnd = 51830;
        private static readonly TimeSpan Timeout = TimeSpan.FromMinutes(5);

        public static async Task<GuidonResult<LoginResponse>> LoginAsync(string baseUrl)
        {
            if (string.IsNullOrEmpty(baseUrl))
                return GuidonResult<LoginResponse>.Failure("Set a base URL first.");

            HttpListener listener = null;
            int port = -1;

            for (int candidate = PortRangeStart; candidate < PortRangeEnd; candidate++)
            {
                try
                {
                    var candidateListener = new HttpListener();
                    candidateListener.Prefixes.Add($"http://localhost:{candidate}/");
                    candidateListener.Start();
                    listener = candidateListener;
                    port = candidate;
                    break;
                }
                catch (Exception)
                {
                    // Port already in use (e.g. another Guidon Tasks window
                    // mid-login) or blocked - try the next candidate.
                }
            }

            if (listener == null)
            {
                return GuidonResult<LoginResponse>.Failure(
                    "Could not open a local port for browser login (tried " +
                    $"{PortRangeStart}-{PortRangeEnd - 1}). Close any other Guidon login attempt and try again.");
            }

            try
            {
                string state = Guid.NewGuid().ToString("N");
                string redirectUri = $"http://localhost:{port}/callback";
                string url = $"{baseUrl.TrimEnd('/')}/auth/plugin-login" +
                              $"?redirect_uri={Uri.EscapeDataString(redirectUri)}&state={state}";

                Application.OpenURL(url);

                HttpListenerContext context;
                try
                {
                    Task<HttpListenerContext> contextTask = listener.GetContextAsync();
                    Task timeoutTask = Task.Delay(Timeout);
                    Task completed = await Task.WhenAny(contextTask, timeoutTask);

                    if (completed == timeoutTask)
                    {
                        return GuidonResult<LoginResponse>.Failure(
                            "Login timed out - no response from the browser within 5 minutes.");
                    }

                    context = contextTask.Result;
                }
                catch (Exception e)
                {
                    return GuidonResult<LoginResponse>.Failure("Browser login failed: " + e.Message);
                }

                var query = context.Request.QueryString;
                string returnedState = query["state"];
                string apiKey = query["apiKey"];
                string email = query["email"];

                bool ok = !string.IsNullOrEmpty(apiKey) && returnedState == state;
                RespondToCallback(context, ok);

                return ok
                    ? GuidonResult<LoginResponse>.Success(new LoginResponse { apiKey = apiKey, email = email })
                    : GuidonResult<LoginResponse>.Failure("Login was not completed, or the response could not be verified.");
            }
            finally
            {
                listener.Stop();
                listener.Close();
            }
        }

        private static void RespondToCallback(HttpListenerContext context, bool ok)
        {
            string title = ok ? "Logged in" : "Login failed";
            string message = ok
                ? "You're logged in - you can close this tab and return to Unity."
                : "Something went wrong - return to Unity and try again.";

            string html =
                "<html><head><title>Guidon</title></head>" +
                "<body style=\"font-family:sans-serif;text-align:center;padding-top:80px;\">" +
                $"<h2>{title}</h2><p>{message}</p></body></html>";

            byte[] buffer = Encoding.UTF8.GetBytes(html);

            try
            {
                context.Response.ContentType = "text/html; charset=utf-8";
                context.Response.ContentLength64 = buffer.Length;
                context.Response.OutputStream.Write(buffer, 0, buffer.Length);
                context.Response.OutputStream.Close();
            }
            catch (Exception)
            {
                // The browser tab may already be gone by the time this
                // writes - the login result itself doesn't depend on this
                // response being seen.
            }
        }
    }
}

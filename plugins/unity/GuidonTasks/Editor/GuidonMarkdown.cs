using System;
using System.Text.RegularExpressions;

namespace Guidon.Tasks.Editor
{
    /// <summary>
    /// Converts the common Markdown subset (bold, italic, inline code,
    /// headers, bullet lists, links) to Unity's built-in IMGUI rich-text
    /// tags (&lt;b&gt;, &lt;i&gt;, &lt;size&gt;, &lt;color&gt;) - not a
    /// CommonMark implementation. No tables, code blocks, nested lists, or
    /// clickable links (IMGUI has no per-substring click handling without
    /// significant custom hit-testing - out of scope for a description
    /// viewer); a link renders as coloured text followed by its URL in
    /// parentheses instead of being clickable.
    ///
    /// Unlike the web app (react-markdown + remark-gfm, a real parser),
    /// this is regex-based on purpose: Unity ships no Markdown package,
    /// and adding a third-party one would break this plugin's
    /// zero-extra-dependency principle for what is, in the end, just a
    /// description viewer. Order matters below - each pass runs on the
    /// previous pass's output, so a pattern later in the list never has to
    /// account for raw Markdown a rule above it already consumed.
    /// </summary>
    internal static class GuidonMarkdown
    {
        private static readonly Regex HeaderPattern =
            new Regex(@"^(#{1,6})[ \t]+(.*)$", RegexOptions.Multiline | RegexOptions.Compiled);

        private static readonly Regex BoldPattern = new Regex(@"\*\*(.+?)\*\*", RegexOptions.Compiled);

        private static readonly Regex ItalicStarPattern =
            new Regex(@"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", RegexOptions.Compiled);

        private static readonly Regex ItalicUnderscorePattern =
            new Regex(@"(?<!_)_(?!_)(.+?)(?<!_)_(?!_)", RegexOptions.Compiled);

        private static readonly Regex InlineCodePattern = new Regex(@"`([^`]+?)`", RegexOptions.Compiled);

        private static readonly Regex LinkPattern = new Regex(@"\[(.+?)\]\((\S+?)\)", RegexOptions.Compiled);

        private static readonly Regex BulletPattern =
            new Regex(@"^[ \t]*[-*][ \t]+(.*)$", RegexOptions.Multiline | RegexOptions.Compiled);

        public static string ToRichText(string markdown)
        {
            if (string.IsNullOrEmpty(markdown)) return markdown;

            string text = markdown;

            text = HeaderPattern.Replace(text, match =>
            {
                int level = match.Groups[1].Value.Length;
                int size = Math.Max(11, 17 - (level - 1) * 2);
                return $"<b><size={size}>{match.Groups[2].Value}</size></b>";
            });

            text = BoldPattern.Replace(text, "<b>$1</b>");
            text = ItalicStarPattern.Replace(text, "<i>$1</i>");
            text = ItalicUnderscorePattern.Replace(text, "<i>$1</i>");
            text = InlineCodePattern.Replace(text, "<color=#D19A66>$1</color>");
            text = LinkPattern.Replace(text, "<color=#4A9EFF>$1</color> ($2)");
            text = BulletPattern.Replace(text, "•  $1");

            return text;
        }
    }
}

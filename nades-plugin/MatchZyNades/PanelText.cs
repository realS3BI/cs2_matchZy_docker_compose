using System.Text;

namespace MatchZyNades;

// Bounded, complete pages for the HUD description area.
public static class PanelText
{
    public const int Width = 38;
    public static string[] Wrap(string text)
    {
        text = new string(text.Where(c => !char.IsControl(c) || char.IsWhiteSpace(c)).ToArray());
        var lines = new List<string>();
        var line = "";
        foreach (var word in string.Join(" ", text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
                     .Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            if (line.Length > 0 && line.Length + word.Length + 1 > Width) { lines.Add(line); line = ""; }
            var rest = word;
            while (rest.Length > Width)
            {
                var boundary = char.IsHighSurrogate(rest[Width - 1]) ? Width - 1 : Width;
                lines.Add(rest[..boundary]);
                rest = rest[boundary..];
            }
            line += (line.Length == 0 ? "" : " ") + rest;
        }
        if (line.Length > 0) lines.Add(line);
        return lines.ToArray();
    }

    public static IReadOnlyList<string> DetailPages(string text, int maxLines = 6)
    {
        var pages = new List<string>();
        var page = new List<string>();
        foreach (var line in Wrap(text))
        {
            if (page.Count == maxLines || Encoding.UTF8.GetByteCount(string.Join('\n', page) + "\n" + line) > 420)
            { pages.Add(string.Join('\n', page)); page.Clear(); }
            page.Add(line);
        }
        if (page.Count > 0 || pages.Count == 0) pages.Add(string.Join('\n', page));
        return pages;
    }

}

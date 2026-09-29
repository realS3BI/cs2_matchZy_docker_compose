using System.Text;

namespace MatchZyNades;

public sealed record PanelContent(string Heading, string Options, string Selection, string Details, string Controls);

// Each world-text entity has a 512-byte message buffer, including the terminator.
public static class PanelText
{
    public const int Width = 38;
    public static string Fit(string text, int byteLimit = 480)
    {
        var result = new StringBuilder();
        var bytes = 0;
        foreach (var rune in text.EnumerateRunes())
        {
            if (bytes + rune.Utf8SequenceLength > byteLimit - 3) return result + "...";
            result.Append(rune);
            bytes += rune.Utf8SequenceLength;
        }
        return result.ToString();
    }

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

    public static IReadOnlyList<string> DetailPages(string text)
    {
        var pages = new List<string>();
        var page = new List<string>();
        foreach (var line in Wrap(text))
        {
            if (page.Count == 6 || Encoding.UTF8.GetByteCount(string.Join('\n', page) + "\n" + line) > 420)
            { pages.Add(string.Join('\n', page)); page.Clear(); }
            page.Add(line);
        }
        if (page.Count > 0 || pages.Count == 0) pages.Add(string.Join('\n', page));
        return pages;
    }

    public static PanelContent Render(InGameMenu menu, bool focused, bool practice, int detailPage)
    {
        var options = new List<string>();
        var selection = new List<string>();
        var index = 0;
        foreach (var item in menu.Visible)
        {
            var label = Fit($"{(index == menu.Cursor ? ">" : " ")} {++index}. {MenuRenderer.Plain(item.Label, Width - 7)}{(item.Enabled ? "" : " -")}", 90);
            options.Add(index - 1 == menu.Cursor ? " " : label);
            selection.Add(index - 1 == menu.Cursor ? label : " ");
        }
        if (options.Count == 0) options.Add("Noch keine Lineups vorhanden.");
        var detail = menu.Notice.Length > 0 ? menu.Notice : menu.Selected?.Hint;
        if (string.IsNullOrWhiteSpace(detail)) detail = menu.Current.Description;
        var pages = DetailPages(detail ?? "");
        var page = Math.Clamp(detailPage, 0, pages.Count - 1);
        return new(
            Fit($"TRAINING | {MenuRenderer.Plain(menu.Map, 24)}\n{MenuRenderer.Plain(menu.Current.Title, Width)}\n{(focused ? "BEDIENUNG AKTIV" : "SPIELEN")} | {(practice ? "BEREIT" : "INAKTIV")} | {menu.Page + 1}/{menu.PageCount}"),
            Fit(string.Join('\n', options)), Fit(string.Join('\n', selection)),
            Fit(pages[page] + (pages.Count > 1 ? $"\nDetails {page + 1}/{pages.Count} | R: weiter" : "")),
            focused ? "W/S Auswahl | E bestaetigen\nInspect zurueck | A/D Seite\nF6 Spielen | F7 Ausblenden"
                : "F6 Bedienen | F7 Ausblenden\nR: weitere Details im Bedienmodus");
    }
}

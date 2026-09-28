using System.Net;
using System.Text;

namespace MatchZyNades;

public sealed record MenuEntry(string Label, NadeKind? Category = null, NadeLineup? Lineup = null);

// Pure menu state so pagination and selection can be verified without a running game server.
public sealed class NadeMenu(IReadOnlyList<NadeLineup> library, string map)
{
    public const int PageSize = 5;
    public IReadOnlyList<NadeLineup> Library { get; } = library;
    public string Map { get; } = map;
    public NadeKind? Category { get; private set; }
    public int Page { get; private set; }
    public int Cursor { get; private set; }
    public int PageCount => Math.Max(1, (Entries.Count + PageSize - 1) / PageSize);
    public IReadOnlyList<MenuEntry> Entries { get; private set; } = Categories(library);
    public IEnumerable<MenuEntry> Visible => Entries.Skip(Page * PageSize).Take(PageSize);

    private static MenuEntry[] Categories(IReadOnlyList<NadeLineup> library) =>
        Enum.GetValues<NadeKind>().Where(kind => kind != NadeKind.Other || library.Any(n => n.Kind == kind))
            .Select(kind => new MenuEntry($"{NadeCatalog.Label(kind)} ({library.Count(n => n.Kind == kind)})", kind))
            .ToArray();

    public void OpenCategory(NadeKind kind)
    {
        Category = kind;
        Entries = Library.Where(n => n.Kind == kind)
            .Select(n => new MenuEntry(n.Name + (n.Owner == "default" ? "" : " [privat]"), Lineup: n)).ToArray();
        Page = Cursor = 0;
    }

    public void Back()
    {
        Category = null;
        Entries = Categories(Library);
        Page = Cursor = 0;
    }

    public void ChangePage(int direction)
    {
        Page = Math.Clamp(Page + direction, 0, PageCount - 1);
        Cursor = 0;
    }

    public void Move(int direction)
    {
        if (Entries.Count == 0) return;
        var index = Math.Clamp(Page * PageSize + Cursor + direction, 0, Entries.Count - 1);
        Page = index / PageSize;
        Cursor = index % PageSize;
    }

    public MenuEntry? Select(int key) => key is >= 1 and <= PageSize
        ? Visible.ElementAtOrDefault(key - 1) : null;

    public string Render()
    {
        var text = new StringBuilder("<font color='#8edbff'><b>NADES | ");
        text.Append(Html(Map, 24)).Append(" | ")
            .Append(Category.HasValue ? NadeCatalog.Label(Category.Value) : "Typ auswaehlen")
            .Append($" | {Page + 1}/{PageCount}</b></font><br>");
        var i = 0;
        foreach (var entry in Visible)
        {
            text.Append(i == Cursor ? "<font color='#ffe08a'>&gt; " : "<font color='#ffffff'>")
                .Append(++i).Append(". ").Append(Html(entry.Label, 45)).Append("</font><br>");
        }
        if (!Visible.Any()) text.Append("Noch keine Lineups fuer diesen Typ.<br>");
        text.Append("<font color='#aaaaaa'>6 Typen | 7 Zurueck | 8 Weiter | 9 Schliessen<br>")
            .Append("W/S Auswahl | Linksklick laden | Rechtsklick zurueck | E Ende</font>");
        return text.ToString();
    }

    public static string Plain(string value, int limit) =>
        new(value.Where(c => !char.IsControl(c)).Take(limit).ToArray());
    private static string Html(string value, int limit) => WebUtility.HtmlEncode(Plain(value, limit));
}

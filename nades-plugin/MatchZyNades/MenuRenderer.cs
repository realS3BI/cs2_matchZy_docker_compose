using System.Net;
using System.Text;

namespace MatchZyNades;

public static class MenuRenderer
{
    private const string Accent = "#7DD3FC";
    private const string Focus = "#FDE68A";
    private const string Text = "#F8FAFC";
    private const string Muted = "#CBD5E1";

    // CS2 center HTML supports a small subset of tags, not browser CSS or a mouse cursor.
    public static string Render(InGameMenu menu, bool practice)
    {
        var html = new StringBuilder();
        html.Append($"<font color='{Accent}' class='fontSize-l'><b>TRAINING</b></font>")
            .Append($" <font color='{Muted}'> / {Escape(menu.Map, 24)} / {(practice ? "BEREIT" : "INAKTIV")}</font><br>")
            .Append($"<font color='{Text}' class='fontSize-m'><b>{Escape(menu.Current.Title, 42)}</b></font>")
            .Append($" <font color='{Muted}'> {menu.Page + 1}/{menu.PageCount}</font><br>");
        var row = 0;
        foreach (var item in menu.Visible)
        {
            var selected = row == menu.Cursor;
            html.Append($"<font color='{(selected ? Focus : item.Enabled ? Text : Muted)}'>")
                .Append(selected ? "<b>&gt; " : "&nbsp;&nbsp; ")
                .Append(++row).Append(" &nbsp; ").Append(Escape(item.Label, 46))
                .Append(item.Page != null ? " &rsaquo;" : "")
                .Append(selected ? "</b>" : "").Append("</font><br>");
        }
        if (!menu.Visible.Any()) html.Append($"<font color='{Muted}'>Noch keine Lineups vorhanden.</font><br>");
        var hint = menu.Notice.Length != 0 ? menu.Notice : menu.Selected?.Hint;
        if (string.IsNullOrWhiteSpace(hint)) hint = menu.Current.Description;
        html.Append($"<font color='{Muted}'>{Escape(hint, 100)}</font><br>")
            .Append($"<font color='{Accent}'>W/S Auswahl &nbsp; E / USE Bestätigen<br>")
            .Append("G / INSPECT Zurück &nbsp; A/D Seite</font>");
        return html.ToString();
    }

    public static string Plain(string value, int limit) => new(value.Where(c => !char.IsControl(c)).Take(limit).ToArray());
    private static string Escape(string value, int limit) => WebUtility.HtmlEncode(Plain(value, limit));
}

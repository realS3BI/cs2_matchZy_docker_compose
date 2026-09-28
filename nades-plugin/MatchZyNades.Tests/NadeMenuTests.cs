using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class NadeMenuTests
{
    private static NadeLineup Lineup(string name, NadeKind kind = NadeKind.Smoke, string owner = "default") =>
        new(owner, name, "de_mirage", kind, "", new(1, 2, 3), new(4, 5, 6));

    [Fact]
    public void PaginationKeepsEveryLineupReachableAndRejectsInvalidSelections()
    {
        var library = Enumerable.Range(1, 13).Select(i => Lineup($"nade-{i}")).ToArray();
        var menu = new NadeMenu(library, "de_mirage");
        menu.OpenCategory(NadeKind.Smoke);
        Assert.Equal(3, menu.PageCount);
        var seen = new List<NadeLineup>();
        for (var page = 0; page < 3; page++)
        {
            foreach (var key in Enumerable.Range(1, NadeMenu.PageSize))
                if (menu.Select(key)?.Lineup is { } lineup) seen.Add(lineup);
            menu.ChangePage(1);
        }
        Assert.Equal(library, seen);
        Assert.Equal(2, menu.Page);
        Assert.Null(menu.Select(4));
        Assert.Null(menu.Select(0));
        Assert.Null(menu.Select(6));
        menu.ChangePage(-100);
        Assert.Equal(0, menu.Page);
    }

    [Fact]
    public void WasdCrossesPagesAndBackRestoresCategories()
    {
        var menu = new NadeMenu(Enumerable.Range(1, 12).Select(i => Lineup($"nade-{i}")).ToArray(), "de_mirage");
        menu.OpenCategory(NadeKind.Smoke);
        for (var i = 0; i < 5; i++) menu.Move(1);
        Assert.Equal(1, menu.Page);
        Assert.Equal("nade-6", menu.Select(menu.Cursor + 1)!.Lineup!.Name);
        menu.Move(-1);
        Assert.Equal(0, menu.Page);
        Assert.Equal(4, menu.Cursor);
        menu.Back();
        Assert.Null(menu.Category);
        Assert.Equal(0, menu.Cursor);
        Assert.Equal(NadeKind.Smoke, menu.Select(1)!.Category);
        Assert.Contains("(12)", menu.Select(1)!.Label);
    }

    [Fact]
    public void EmptyCategoryIsUsableAndUnknownTypesAreReachable()
    {
        var menu = new NadeMenu([Lineup("old", NadeKind.Other)], "de_mirage");
        Assert.Equal(2, menu.PageCount);
        menu.ChangePage(1);
        Assert.Equal(NadeKind.Other, menu.Select(1)!.Category);
        menu.OpenCategory(NadeKind.Flash);
        Assert.Empty(menu.Visible);
        Assert.Equal(1, menu.PageCount);
        menu.Move(1);
        Assert.Null(menu.Select(1));
        Assert.Contains("Noch keine Lineups", menu.Render());
    }

    [Fact]
    public void HtmlAndChatControlCharactersCannotBreakMenuAndPrivateNamesAreMarked()
    {
        var menu = new NadeMenu([Lineup("<b>Window</b>\n\u0001", owner: "7656")], "<map>");
        menu.OpenCategory(NadeKind.Smoke);
        var html = menu.Render();
        Assert.Contains("&lt;b&gt;Window&lt;/b&gt;", html);
        Assert.Contains("&lt;map&gt;", html);
        Assert.Contains("[privat]", html);
        Assert.DoesNotContain("\u0001", html, StringComparison.Ordinal);
        Assert.DoesNotContain("\n", html, StringComparison.Ordinal);
        Assert.Equal("abc", NadeMenu.Plain("a\nb\u0001cdef", 3));
    }
}

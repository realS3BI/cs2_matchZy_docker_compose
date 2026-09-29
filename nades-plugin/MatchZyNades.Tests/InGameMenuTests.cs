using CounterStrikeSharp.API;
using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class InGameMenuTests
{
    private static NadeLineup Lineup(string name, NadeKind kind = NadeKind.Smoke, string owner = "default") =>
        new(owner, name, "de_mirage", kind, "Aim at window", new(1, 2, 3), new(4, 5, 6));

    [Fact]
    public void EveryLineupIsReachableAndBackRestoresPageAndSelection()
    {
        var library = Enumerable.Range(1, 13).Select(i => Lineup($"nade-{i}")).ToArray();
        var menu = TrainingMenu.Create(library, "de_mirage", true, null);
        menu.Select(1); // Library
        menu.Select(1); // Smokes
        var seen = new List<NadeLineup>();
        for (var i = 0; i < library.Length; i++)
        {
            menu.Select(menu.Cursor + 1); // Details
            seen.Add(menu.Select(1)!.Lineup!);
            Assert.True(menu.Back());
            Assert.Equal(i / 5, menu.Page);
            Assert.Equal(i % 5, menu.Cursor);
            menu.Move(1);
        }
        Assert.Equal(library, seen);
        Assert.Null(menu.Select(4));
        Assert.Null(menu.Select(0));
        Assert.Null(menu.Select(6));
        menu.ChangePage(-100);
        Assert.Equal(0, menu.Page);
        Assert.True(menu.Back());
        Assert.True(menu.Back());
        Assert.False(menu.Back());
    }

    [Fact]
    public void EmptyLibraryStillOffersTrainingAndEmptyCategoryHasAnExit()
    {
        var menu = TrainingMenu.Create([], "de_mirage", true, null);
        Assert.Contains(menu.Current.Items, item => item.Label == "Neue Nade aufnehmen");
        menu.Select(1);
        menu.Select(1);
        Assert.Empty(menu.Visible);
        menu.ChangePage(100);
        menu.Move(1);
        Assert.Null(menu.Select(1));
        Assert.Contains("Noch keine Lineups", MenuRenderer.Render(menu, true));
        Assert.True(menu.Back());
        Assert.True(menu.Back());
        menu.Select(3);
        Assert.Equal(TrainingAction.Rethrow, menu.Select(1)!.Action);
    }

    [Fact]
    public void PracticeOffGatesTrainingAndStartRemainsAccessible()
    {
        var menu = TrainingMenu.Create([Lineup("window")], "de_mirage", false, null);
        Assert.Equal(TrainingAction.StartPractice, menu.Select(1)!.Action);
        Assert.Null(menu.Select(2));
        Assert.True(menu.IsRoot);
        Assert.Contains("Zuerst Training", menu.Notice);
        Assert.Equal("css_prac", TrainingMenu.Command(TrainingAction.StartPractice));
    }

    [Fact]
    public void SharedActionRequiresExplicitConfirmationAndCancelReturns()
    {
        var menu = TrainingMenu.Create([], "de_mirage", true, null);
        menu.Select(3);
        menu.ChangePage(1);
        Assert.Null(menu.Select(1)); // Clear grenades confirmation
        Assert.Equal(TrainingAction.Back, menu.Select(1)!.Action);
        Assert.Equal(TrainingAction.ClearGrenades, menu.Select(2)!.Action);
        Assert.True(menu.Back());
        Assert.Equal(1, menu.Page);
        Assert.Equal(0, menu.Cursor);
    }

    [Fact]
    public void UserTextIsEncodedAndPrivateLineupsStayMarked()
    {
        var menu = TrainingMenu.Create([Lineup("<b>Window</b>\n\u0001", owner: "7656")], "<map>", true, null);
        menu.Select(1);
        menu.Select(1);
        var html = MenuRenderer.Render(menu, true);
        Assert.Contains("&lt;b&gt;Window&lt;/b&gt;", html);
        Assert.Contains("&lt;map&gt;", html);
        Assert.Contains("[privat]", html);
        Assert.DoesNotContain("\u0001", html, StringComparison.Ordinal);
        Assert.DoesNotContain("\n", html);
        Assert.Equal("abc", MenuRenderer.Plain("a\nb\u0001cdef", 3));
    }

    [Fact]
    public void EveryActionHasAnExplicitHandlerAndNoUserTextBecomesACommand()
    {
        var local = new[] { TrainingAction.Close, TrainingAction.Back, TrainingAction.LoadLineup,
            TrainingAction.RepeatLineup, TrainingAction.CheckPosition, TrainingAction.StartCapture,
            TrainingAction.SaveCapture, TrainingAction.CancelCapture, TrainingAction.RefreshLibrary, TrainingAction.PanelAspect,
            TrainingAction.GiveGrenade };
        foreach (var action in Enum.GetValues<TrainingAction>().Except(local))
            Assert.Matches("^(css_[a-z]+|noclip)$", TrainingMenu.Command(action)!);
        foreach (var action in local) Assert.Null(TrainingMenu.Command(action));
        Assert.Null(TrainingMenu.Command((TrainingAction)999));
    }

    [Fact]
    public void OpeningWithUseHeldDoesNotSelectAndHoldingDoesNotRepeat()
    {
        var input = new MenuInput(PlayerButtons.Use);
        Assert.Equal(MenuInputAction.None, input.Read(0));
        Assert.Equal(MenuInputAction.None, input.Read(PlayerButtons.Use));
        Assert.Equal(MenuInputAction.None, input.Read(PlayerButtons.Use));
        Assert.Equal(MenuInputAction.Select, input.Read(0));
        Assert.Equal(MenuInputAction.None, input.Read(0));
    }

    [Fact]
    public void InspectGoesBackAndWinsOverSelectWhileMouseNeverSelects()
    {
        var input = new MenuInput(0);
        input.Read(PlayerButtons.Use | PlayerButtons.Inspect);
        Assert.Equal(MenuInputAction.Back, input.Read(0));
        input.Read(PlayerButtons.Attack | PlayerButtons.Attack2);
        Assert.Equal(MenuInputAction.None, input.Read(0));
        input.Read(PlayerButtons.Moveright);
        Assert.Equal(MenuInputAction.NextPage, input.Read(0));
    }

    [Fact]
    public void CaptureIsReachableWithoutChatAndRequiresPractice()
    {
        var menu = TrainingMenu.Create([], "de_mirage", true, null);
        menu.Select(5);
        Assert.Equal(TrainingAction.StartCapture, menu.Select(1)!.Action);
        Assert.Equal(TrainingAction.SaveCapture, menu.Select(2)!.Action);
        Assert.Equal(TrainingAction.CancelCapture, menu.Select(3)!.Action);
        Assert.True(menu.Back());
        menu.ChangePage(1);
        Assert.Equal(TrainingAction.RefreshLibrary, menu.Select(1)!.Action);
        Assert.Equal(TrainingAction.PanelAspect, menu.Select(2)!.Action);
        Assert.Equal(TrainingAction.Close, menu.Select(3)!.Action);
        var inactive = TrainingMenu.Create([], "de_mirage", false, null);
        inactive.ChangePage(1);
        Assert.Null(inactive.Select(1));
        Assert.True(inactive.IsRoot);
    }

    [Fact]
    public void ReloadPagesDetailsOnlyAfterFreshPress()
    {
        var input = new MenuInput(PlayerButtons.Reload);
        Assert.Equal(MenuInputAction.None, input.Read(0));
        input.Read(PlayerButtons.Reload);
        Assert.Equal(MenuInputAction.Details, input.Read(0));
        input.Read(PlayerButtons.Reload | PlayerButtons.Inspect);
        Assert.Equal(MenuInputAction.Back, input.Read(0));
    }

    [Fact]
    public void EquipmentMenuUsesTypedActionsForEveryGrenade()
    {
        var menu = TrainingMenu.Create([], "de_mirage", true, null);
        menu.Select(3);
        menu.ChangePage(1);
        menu.Select(4);
        foreach (var (kind, index) in Enum.GetValues<NadeKind>().Where(k => k != NadeKind.Other).Select((k, i) => (k, i)))
        {
            var request = menu.Select(index + 1)!;
            Assert.Equal(TrainingAction.GiveGrenade, request.Action);
            Assert.Equal(kind, request.Kind);
            Assert.NotNull(NadeCatalog.Equipment(kind, counterTerrorist: true));
            Assert.NotNull(NadeCatalog.Equipment(kind, counterTerrorist: false));
        }
    }
}

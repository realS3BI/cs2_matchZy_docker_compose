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
        menu.Select(4); // Alle
        var seen = new List<NadeLineup>();
        for (var i = 0; i < library.Length; i++)
        {
            menu.Select(menu.Cursor + 1); // Details
            seen.Add(menu.Select(1)!.Lineup!);
            Assert.True(menu.Back());
            Assert.Equal(i / 9, menu.Page);
            Assert.Equal(i % 9, menu.Cursor);
            if (i + 1 < library.Length) menu.Move(1);
        }
        Assert.Equal(library, seen);
        Assert.Null(menu.Select(5));
        Assert.Null(menu.Select(0));
        Assert.Null(menu.Select(6));
        menu.ChangePage(-1);
        Assert.Equal(0, menu.Page);
        Assert.True(menu.Back());
        Assert.True(menu.Back());
        Assert.True(menu.Back());
        Assert.False(menu.Back());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(9)]
    [InlineData(10)]
    [InlineData(13)]
    [InlineData(18)]
    [InlineData(19)]
    public void SelectionWrapsAcrossAllPagesWithoutSelectingEmptyRows(int count)
    {
        var items = Enumerable.Range(1, count).Select(i => new MenuItem($"Eintrag {i}")).ToArray();
        var menu = new InGameMenu(new("Liste", "", items), "de_mirage");
        var lastIndex = Math.Max(0, count - 1);

        menu.Move(-1);
        Assert.Equal(lastIndex, menu.Index);
        Assert.Equal(lastIndex / InGameMenu.PageSize, menu.Page);
        Assert.Equal(lastIndex % InGameMenu.PageSize, menu.Cursor);
        menu.Move(1);
        Assert.Equal(0, menu.Index);
        for (var i = 1; i < count; i++)
        {
            menu.Move(1);
            Assert.Equal(i, menu.Index);
        }
        menu.Move(1);
        Assert.Equal(0, menu.Index);
        if (count == 0) Assert.Null(menu.Selected);
        else Assert.NotNull(menu.Selected);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(9)]
    [InlineData(10)]
    [InlineData(13)]
    [InlineData(18)]
    [InlineData(19)]
    public void PagesWrapInBothDirectionsAndSelectTheFirstRow(int count)
    {
        var items = Enumerable.Range(1, count).Select(i => new MenuItem($"Eintrag {i}")).ToArray();
        var menu = new InGameMenu(new("Liste", "", items), "de_mirage");

        menu.ChangePage(-1);
        Assert.Equal(menu.PageCount - 1, menu.Page);
        Assert.Equal(0, menu.Cursor);
        menu.ChangePage(1);
        Assert.Equal(0, menu.Page);
        for (var page = 1; page < menu.PageCount; page++)
        {
            menu.ChangePage(1);
            Assert.Equal(page, menu.Page);
        }
        menu.ChangePage(1);
        Assert.Equal(0, menu.Page);
        Assert.Equal(0, menu.Cursor);
    }

    [Fact]
    public void RepeatedBackStopsAtHomeAndPreservesItsSelection()
    {
        var menu = TrainingMenu.Create([], "de_mirage", true, null);
        menu.Select(3);
        menu.Select(6);
        Assert.True(menu.Back());
        Assert.True(menu.Back());
        var home = menu.Current;
        var index = menu.Index;

        for (var i = 0; i < 10; i++)
        {
            Assert.False(menu.Back());
            Assert.True(menu.IsRoot);
            Assert.Same(home, menu.Current);
            Assert.Equal(index, menu.Index);
        }
    }

    [Fact]
    public void EmptyLibraryStillOffersTrainingAndEmptyCategoryHasAnExit()
    {
        var menu = TrainingMenu.Create([], "de_mirage", true, null);
        Assert.Contains(menu.Current.Items, item => item.Label == "Neue Nade aufnehmen");
        menu.Select(1);
        menu.Select(1);
        menu.Select(4); // Alle
        Assert.Empty(menu.Visible);
        menu.ChangePage(100);
        menu.Move(1);
        Assert.Null(menu.Select(1));
        Assert.Contains("Noch keine Granaten", MenuRenderer.Render(menu, true));
        Assert.True(menu.Back());
        Assert.True(menu.Back());
        Assert.True(menu.Back());
        menu.Select(3);
        Assert.Equal(TrainingAction.Rethrow, menu.Select(1)!.Action);
    }

    [Fact]
    public void PracticeOffGatesTrainingAndCannotStartPracticeFromPanel()
    {
        var menu = TrainingMenu.Create([Lineup("window")], "de_mirage", false, null);
        Assert.Null(menu.Select(1));
        Assert.True(menu.IsRoot);
        Assert.DoesNotContain(menu.Current.Items, item => item.Request?.Action == TrainingAction.StartPractice);
        Assert.All(menu.Current.Items.Take(7), item => Assert.False(item.Enabled));
    }

    [Fact]
    public void ToolsGroupBotsAndTogglesAndExecuteImmediately()
    {
        var menu = TrainingMenu.Create([], "de_mirage", true, null, toggles: new(true, false, true, false));
        menu.Select(3);
        Assert.Equal(TrainingAction.ClearGrenades, menu.Select(5)!.Action);
        menu.Select(6);
        Assert.Equal(TrainingAction.RemoveBots, menu.Select(3)!.Action);
        menu.Back(); menu.Select(7);
        Assert.Equal("Flugbahnvorschau ausschalten", menu.Current.Items[0].Label);
        Assert.Equal("God Mode einschalten", menu.Current.Items[3].Label);
        Assert.Equal(TrainingAction.Trajectory, menu.Select(1)!.Action);
        Assert.Equal(TrainingAction.Impacts, menu.Select(2)!.Action);
    }

    [Fact]
    public void UserTextIsEncodedAndPrivateLineupsStayMarked()
    {
        var menu = TrainingMenu.Create([Lineup("<b>Window</b>\n\u0001", owner: "7656")], "<map>", true, null);
        menu.Select(1);
        menu.Select(1);
        menu.Select(4); // Alle
        var html = MenuRenderer.Render(menu, true);
        Assert.Contains("&lt;b&gt;Window&lt;/b&gt;", html);
        Assert.Contains("&lt;map&gt;", html);
        Assert.DoesNotContain("[privat]", html);
        Assert.DoesNotContain("\u0001", html, StringComparison.Ordinal);
        Assert.DoesNotContain("\n", html);
        Assert.Equal("abc", MenuRenderer.Plain("a\nb\u0001cdef", 3));
    }

    [Fact]
    public void EveryActionHasAnExplicitHandlerAndNoUserTextBecomesACommand()
    {
        var local = new[] { TrainingAction.Close, TrainingAction.Back, TrainingAction.LoadLineup,
            TrainingAction.RepeatLineup, TrainingAction.CheckPosition, TrainingAction.StartCapture,
            TrainingAction.SaveCapture, TrainingAction.CancelCapture, TrainingAction.RefreshLibrary, TrainingAction.ToggleFavorite, TrainingAction.TeleportSpawn,
            TrainingAction.GiveGrenade, TrainingAction.Settings, TrainingAction.BindKey,
            TrainingAction.ReviewPhoto, TrainingAction.ReviewVideoStart, TrainingAction.ReviewVideoStop, TrainingAction.ReviewHelp, TrainingAction.ReviewApprove, TrainingAction.ReviewReject, TrainingAction.ReviewTeleportEffect, TrainingAction.ReviewRethrow,
            TrainingAction.ToggleGameButtons, TrainingAction.ExportBindings, TrainingAction.EditLineup, TrainingAction.EditName, TrainingAction.EditDescription, TrainingAction.EditField, TrainingAction.RequestReview, TrainingAction.DeleteLineup, TrainingAction.StartMapVote, TrainingAction.VoteYes, TrainingAction.VoteNo };
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
        menu.Select(4);
        Assert.Equal(TrainingAction.StartCapture, menu.Select(1)!.Action);
        Assert.Equal(TrainingAction.SaveCapture, menu.Select(2)!.Action);
        Assert.Equal(TrainingAction.CancelCapture, menu.Select(3)!.Action);
        Assert.True(menu.Back());
        Assert.Contains(menu.Current.Items, item => item.Page?.Key == "favorites");
        Assert.Contains(menu.Current.Items, item => item.Page?.Key == "spawns");
        Assert.Equal(TrainingAction.Settings, menu.Select(9)!.Action);
        menu.ChangePage(1);
        Assert.Equal(TrainingAction.Close, menu.Select(1)!.Action);
        var inactive = TrainingMenu.Create([], "de_mirage", false, null);
        Assert.Null(inactive.Select(6));
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
    public void RemovedActionsAreNotOfferedInTools()
    {
        var menu = TrainingMenu.Create([], "de_mirage", true, null);
        menu.Select(3);
        Assert.DoesNotContain(menu.Current.Items, item => item.Request?.Action is TrainingAction.Noclip or TrainingAction.BestSpawn or TrainingAction.WorstSpawn or TrainingAction.GiveGrenade);
        Assert.Equal(8, menu.Current.Items.Count);
    }

    [Fact]
    public void RefreshKeepsRenamedLineupAndBackUsesUpdatedParent()
    {
        var library = Enumerable.Range(0, 12).Select(i => Lineup($"nade-{i}")).ToArray();
        var menu = TrainingMenu.Create(library, "de_mirage", true, null);
        menu.Select(1);
        menu.Select(1);
        menu.Select(4); // Alle
        menu.ChangePage(1);
        menu.Select(3);
        var changed = library[11] with { DisplayName = "New title", Description = "New instructions" };
        var updated = new[] { changed }.Concat(library.Take(11)).ToArray();
        menu.Refresh(TrainingMenu.Create(updated, "de_mirage", true, null).Current);
        Assert.Equal("New title", menu.Current.Title);
        Assert.Equal(changed, menu.Select(1)!.Lineup);
        Assert.True(menu.Back());
        Assert.Equal(0, menu.Index);
        Assert.Equal("New title", menu.Selected!.Label);
        menu.Home();
        Assert.True(menu.IsRoot);
        Assert.Equal(0, menu.Index);
    }

    [Fact]
    public void DeletingOpenLineupReturnsToCategoryAndClampsLastPage()
    {
        var library = Enumerable.Range(0, 10).Select(i => Lineup($"nade-{i}")).ToArray();
        var menu = TrainingMenu.Create(library, "de_mirage", true, null);
        menu.Select(1);
        menu.Select(1);
        menu.Select(4); // Alle
        menu.ChangePage(1);
        menu.Select(1);
        menu.Refresh(TrainingMenu.Create(library.Take(9).ToArray(), "de_mirage", true, null).Current);
        Assert.Equal("Alle", menu.Current.Title);
        Assert.Equal(0, menu.Page);
        Assert.Equal(8, menu.Index);
        Assert.Equal(9, menu.Visible.Count());
        menu.Refresh(TrainingMenu.Create([], "de_mirage", true, null).Current);
        Assert.Empty(menu.Visible);
        Assert.Null(menu.Select(1));
        Assert.Equal(1, menu.PageCount);
        Assert.True(menu.Back());
    }

    [Fact]
    public void RefreshDistinguishesPrivateAndSharedLineupsWithSameName()
    {
        var shared = Lineup("window");
        var own = Lineup("window", owner: "7656");
        var menu = TrainingMenu.Create([shared, own], "de_mirage", true, null);
        menu.Select(1);
        menu.Select(1);
        menu.Select(4); // Alle
        menu.Select(2);
        menu.Refresh(TrainingMenu.Create([own, shared], "de_mirage", true, null).Current);
        Assert.Equal(own, menu.Select(1)!.Lineup);
        Assert.True(menu.Back());
        Assert.Equal(0, menu.Index);
    }
}

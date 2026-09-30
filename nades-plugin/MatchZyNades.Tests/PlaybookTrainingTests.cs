using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class PlaybookTrainingTests
{
    [Theory]
    [InlineData(".ready")]
    [InlineData("!r")]
    [InlineData("/start")]
    [InlineData("css_forcestart")]
    [InlineData("css_exitprac")]
    [InlineData(".match")]
    [InlineData(".prac")]
    [InlineData(".savenade test")]
    [InlineData(".rethrow")]
    [InlineData(".bot")]
    [InlineData("get5_loadmatch fixture.json")]
    [InlineData("matchzy_autostart_mode 1")]
    [InlineData("sm_pause")]
    public void NadesBlocksMatchCommandsAndUnavailableTools(string command) =>
        Assert.True(PlaybookCommands.Blocks("nades", true, command));

    [Theory]
    [InlineData(".loadnade smoke")]
    [InlineData("!loadnade smoke")]
    [InlineData("/loadnade smoke")]
    [InlineData("css_loadnade smoke")]
    [InlineData("noclip")]
    [InlineData(".nades save")]
    [InlineData("css_training_key KP_0")]
    [InlineData("css_training_vote yes")]
    public void NadesAllowsItsImplementedCommands(string command) =>
        Assert.False(PlaybookCommands.Blocks("nades", true, command));

    [Theory]
    [InlineData("matchzy", false, ".ready", false)]
    [InlineData("matchzy", false, ".prac", false)]
    [InlineData("matchzy", false, ".rethrow", true)]
    [InlineData("matchzy", false, ".nades", true)]
    [InlineData("matchzy", true, ".rethrow", false)]
    [InlineData("matchzy", true, ".ready", true)]
    [InlineData("matchzy", true, ".exitprac", false)]
    [InlineData("warmup", false, ".nades", true)]
    [InlineData("vanilla", false, "css_training", true)]
    [InlineData("vanilla", false, "css_ready", true)]
    [InlineData("vanilla", false, "jointeam 2", false)]
    [InlineData("warmup", false, "css_skins", false)]
    public void ModeGuardSeparatesTrainingScrimsAndOtherPlugins(string mode, bool practice, string command, bool blocked) =>
        Assert.Equal(blocked, PlaybookCommands.Blocks(mode, practice, command));

    [Fact]
    public void EveryStandaloneMenuToolHasAnImplementedCommand()
    {
        var menu = TrainingMenu.Create([], "de_mirage", true, null, standalone: true);
        var items = Descendants(menu.Current).ToArray();
        Assert.DoesNotContain(items, item => item.Request?.Action is TrainingAction.Rethrow or TrainingAction.Bot or TrainingAction.CrouchBot);
        foreach (var item in items)
            if (item.Request is { } request && TrainingMenu.Command(request.Action) is { } command)
                Assert.True(command == "noclip" || PlaybookCommands.TrainingCommands.Contains(command), command);
        Assert.Equal("Playbook", menu.Current.Title);
        Assert.Equal(9, InGameMenu.PageSize);
    }

    private static IEnumerable<MenuItem> Descendants(MenuPage page) => page.Items.SelectMany(item =>
        new[] { item }.Concat(item.Page == null ? [] : Descendants(item.Page)));

    [Fact]
    public void ScrimPracticeKeepsItsMatchZyTools()
    {
        var items = Descendants(TrainingMenu.Create([], "de_mirage", true, null).Current).ToArray();
        Assert.Contains(items, item => item.Request?.Action == TrainingAction.Rethrow);
        Assert.Contains(items, item => item.Request?.Action == TrainingAction.Bot);
    }

    [Fact]
    public void PracticeConfigDoesNotInvokeMatchZy()
    {
        Assert.DoesNotContain(PlaybookCommands.PracticeSettings.Keys, key => key.StartsWith("matchzy_"));
        Assert.Equal("1", PlaybookCommands.PracticeSettings["sv_infinite_ammo"]);
        Assert.Equal("1", PlaybookCommands.PracticeSettings["mp_respawn_on_death_ct"]);
        Assert.Equal("1", PlaybookCommands.PracticeSettings["mp_respawn_on_death_t"]);
        Assert.Equal("1", PlaybookCommands.PracticeSettings["mp_ignore_round_win_conditions"]);
    }

    [Fact]
    public void SharedBrandingKeepsCustomPrefixesAndResolvesColors()
    {
        Assert.Equal(PlaybookChat.Prefix(PlaybookChat.DefaultPrefix), PlaybookChat.Prefix(null));
        Assert.Equal(PlaybookChat.Prefix(null), PlaybookChat.Prefix("[{Green}MatchZy{Default}]"));
        Assert.Contains("Mein Team", PlaybookChat.Prefix("[{Red}Mein Team{Default}]"));
        Assert.DoesNotContain("{Green}", PlaybookChat.Prefix(null));
    }
}

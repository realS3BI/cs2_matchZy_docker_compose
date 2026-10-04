using Playbook;
using Xunit;

namespace Playbook.Tests;

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
    [InlineData(".bot")]
    [InlineData("!cbot")]
    [InlineData("/crouchbot")]
    [InlineData("css_nobots")]
    [InlineData(".rethrow")]
    [InlineData("!rethrow")]
    [InlineData("/rethrow")]
    [InlineData("css_rethrow")]
    [InlineData(".rt")]
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
        Assert.Contains(items, item => item.Request?.Action == TrainingAction.Rethrow);
        Assert.Contains(items, item => item.Request?.Action == TrainingAction.Bot);
        Assert.Contains(items, item => item.Request?.Action == TrainingAction.CrouchBot);
        Assert.Contains(items, item => item.Request?.Action == TrainingAction.RemoveBots);
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
    public void PracticeStartsAnUninterruptedHourWithoutAutomaticWarmup()
    {
        foreach (var name in new[] { "mp_warmup_online_enabled", "mp_warmup_offline_enabled", "mp_do_warmup_period", "mp_warmup_pausetimer", "mp_timelimit" })
            Assert.Equal("0", PlaybookCommands.PracticeSettings[name]);
        foreach (var name in new[] { "mp_roundtime", "mp_roundtime_defuse", "mp_roundtime_hostage" })
            Assert.Equal("60", PlaybookCommands.PracticeSettings[name]);
        Assert.Equal("1", PlaybookCommands.PracticeSettings["mp_ignore_round_win_conditions"]);
        Assert.True(int.Parse(PlaybookCommands.PracticeSettings["mp_maxrounds"]) > 1,
            "Competitive must not see a match with zero rounds when the first player joins.");
    }

    [Fact]
    public void JoiningAllowsManualTeamSelectionWithoutAnIntroOrFreeze()
    {
        Assert.Equal("0", PlaybookCommands.PracticeSettings["sv_disable_teamselect_menu"]);
        Assert.Equal("0", PlaybookCommands.PracticeSettings["sv_human_autojoin_team"]);
        Assert.True(int.Parse(PlaybookCommands.PracticeSettings["mp_force_pick_time"]) >= 15);
        Assert.Equal("0", PlaybookCommands.PracticeSettings["mp_team_intro_time"]);
        Assert.Equal("0", PlaybookCommands.PracticeSettings["mp_freezetime"]);
    }

    [Fact]
    public void EmptyServerCanFinishItsStartupBeforeTheFirstPlayerJoins() =>
        Assert.Equal("0", PlaybookCommands.PracticeSettings["sv_hibernate_when_empty"]);

    [Fact]
    public void TrainingKeepsTheChosenSideWithoutCompetitiveHalftimeOrRespawnWaves()
    {
        foreach (var name in new[] { "mp_halftime", "mp_halftime_pausetimer", "mp_halftime_pausematch",
                     "mp_overtime_enable", "mp_match_can_clinch", "mp_respawnwavetime_ct", "mp_respawnwavetime_t" })
            Assert.Equal("0", PlaybookCommands.PracticeSettings[name]);
        Assert.Equal("any", PlaybookCommands.PracticeSettings["mp_humanteam"]);
    }

    [Fact]
    public void SessionMaintenanceDoesNotResetPlayerTrainingTools()
    {
        Assert.DoesNotContain("sv_grenade_trajectory_prac_pipreview", PlaybookCommands.PracticeSessionSettings);
        Assert.DoesNotContain("sv_showimpacts", PlaybookCommands.PracticeSessionSettings);
        Assert.Contains("mp_halftime", PlaybookCommands.PracticeSessionSettings);
        Assert.Contains("mp_warmup_online_enabled", PlaybookCommands.PracticeSessionSettings);
        Assert.All(PlaybookCommands.PracticeSessionSettings, name => Assert.True(PlaybookCommands.PracticeSettings.ContainsKey(name)));
    }

    [Fact]
    public void HumansTakeDamageButResetToFullHealthBeforeDeath()
    {
        Assert.Equal("1", PlaybookCommands.PracticeSettings["buddha"]);
        Assert.Equal("1", PlaybookCommands.PracticeSettings["buddha_ignore_bots"]);
        Assert.Equal("100", PlaybookCommands.PracticeSettings["buddha_reset_hp"]);
    }

    [Fact]
    public void BothTeamsSpawnWithScoutDefaultPistolAndAllGrenades()
    {
        Assert.Equal("weapon_ssg08", PlaybookCommands.PracticeSettings["mp_ct_default_primary"]);
        Assert.Equal("weapon_ssg08", PlaybookCommands.PracticeSettings["mp_t_default_primary"]);
        Assert.Equal("weapon_hkp2000", PlaybookCommands.PracticeSettings["mp_ct_default_secondary"]);
        Assert.Equal("weapon_glock", PlaybookCommands.PracticeSettings["mp_t_default_secondary"]);
        foreach (var team in new[] { "ct", "t" })
        {
            var grenades = PlaybookCommands.PracticeSettings[$"mp_{team}_default_grenades"];
            foreach (var name in new[] { "weapon_hegrenade", "weapon_smokegrenade", "weapon_flashbang", "weapon_decoy", team == "ct" ? "weapon_incgrenade" : "weapon_molotov" })
                Assert.Contains(name, grenades);
        }
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

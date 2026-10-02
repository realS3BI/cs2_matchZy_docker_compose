using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class AccessControlTests
{
    [Theory]
    [InlineData(".nades")]
    [InlineData("!nades")]
    [InlineData("/nades")]
    [InlineData("\".NADES close\"")]
    [InlineData("css_nades last")]
    [InlineData("css_training")]
    [InlineData("css_training_visible")]
    [InlineData("css_tk 0")]
    [InlineData("css_training_binds")]
    [InlineData(".y")]
    [InlineData(".n")]
    [InlineData("css_training_vote yes")]
    [InlineData(".bot")]
    [InlineData("!cbot")]
    [InlineData("/crouchbot")]
    [InlineData("css_nobots")]
    [InlineData(".rethrow")]
    [InlineData(".rt")]
    public void TrainingPlayerCanUsePanelWithoutAdminRights(string command) =>
        Assert.False(PlatformRoles.Blocks("training_player", command));

    [Theory]
    [InlineData(".prac")]
    [InlineData("!exitprac")]
    [InlineData("css_map de_dust2")]
    [InlineData("css_rcon quit")]
    [InlineData("css_savenade test")]
    [InlineData(".sn test")]
    [InlineData(".importnade test")]
    [InlineData("css_dn test")]
    [InlineData("css_globalnades")]
    [InlineData("css_admins_reload")]
    [InlineData("css_training_future_admin_command")]
    [InlineData("matchzy_start")]
    [InlineData("get5_loadmatch match.json")]
    [InlineData("sm_pause")]
    [InlineData("sm_unpause")]
    [InlineData("reload_admins")]
    public void TrainingPlayerCannotAdministerServerOrWriteContent(string command) =>
        Assert.True(PlatformRoles.Blocks("training_player", command));

    [Fact]
    public void TrainingPlayerCanUsePracticeToolsButCannotStartPractice()
    {
        foreach (var action in Enum.GetValues<TrainingAction>())
            if (TrainingMenu.Command(action) is { } command)
                Assert.Equal(action == TrainingAction.StartPractice, PlatformRoles.Blocks("training_player", command));
        Assert.True(PlatformRoles.CanUsePanel("training_player"));
        Assert.False(PlatformRoles.CanUsePanel("player"));
        Assert.False(PlatformRoles.CanUsePanel("unknown"));
    }

    [Theory]
    [InlineData(".ready")]
    [InlineData("!prac")]
    [InlineData("/nades")]
    [InlineData("css_nades")]
    [InlineData("css_training")]
    [InlineData("css_training_visible")]
    [InlineData("css_map de_dust2")]
    [InlineData("noclip")]
    [InlineData(".rethrow")]
    [InlineData(".rt")]
    public void PlayerCannotExecutePluginCommands(string command) => Assert.True(PlatformRoles.Blocks("player", command));

    [Theory]
    [InlineData("css_sn test")]
    [InlineData(".savenade test")]
    [InlineData("css_in test")]
    [InlineData("!importnade test")]
    [InlineData(".dn test")]
    [InlineData("css_delnade test")]
    [InlineData("css_deletenade test")]
    public void MatchAdminCannotWriteNades(string command) => Assert.True(PlatformRoles.Blocks("match_admin", command));

    [Fact]
    public void NormalGameplayAndMatchAdminControlsRemainAvailable()
    {
        Assert.False(PlatformRoles.Blocks("player", "jointeam 2"));
        Assert.False(PlatformRoles.Blocks("player", "hello team"));
        Assert.False(PlatformRoles.Blocks("match_admin", ".prac"));
        Assert.False(PlatformRoles.Blocks("match_admin", "css_training"));
        Assert.False(PlatformRoles.Blocks("match_admin", "css_loadnade smoke"));
        Assert.False(PlatformRoles.Blocks("admin", "css_savenade test"));
    }

    [Fact]
    public void MissingOrMalformedRoleFileDefaultsToPlayerAndDemotionIsImmediate()
    {
        var path = Path.GetTempFileName();
        try
        {
            var roles = new PlatformRoles(path);
            Assert.Equal("player", roles.Role(123));
            File.WriteAllText(path, "{\"123\":\"match_admin\"}");
            Assert.Equal("match_admin", roles.Role(123));
            Assert.Equal("player", roles.Role(456));
            File.WriteAllText(path, "{\"123\":\"training_player\"}");
            Assert.Equal("training_player", roles.Role(123));
            File.WriteAllText(path, "{\"123\":\"player\"}");
            Assert.Equal("player", roles.Role(123));
            File.WriteAllText(path, "{\"123\":\"custom\"}");
            Assert.Equal("player", roles.Role(123));
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void MatchAdminMenuDoesNotOfferRecording()
    {
        var menu = TrainingMenu.Create([], "de_mirage", true, null, canWriteNades: false);
        Assert.DoesNotContain(menu.Current.Items, item => item.Label == "Neue Nade aufnehmen");
    }
}

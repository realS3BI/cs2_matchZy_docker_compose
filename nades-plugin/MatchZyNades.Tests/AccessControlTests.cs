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
        Assert.False(ServerPermissions.Blocks(["training.use"], command));

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
        Assert.True(ServerPermissions.Blocks(["training.use"], command));

    [Fact]
    public void TrainingPlayerCanUsePracticeToolsButCannotStartPractice()
    {
        foreach (var action in Enum.GetValues<TrainingAction>())
            if (TrainingMenu.Command(action) is { } command)
                Assert.Equal(action == TrainingAction.StartPractice, ServerPermissions.Blocks(["training.use"], command));
        Assert.True(ServerPermissions.CanUsePanel(["training.use"]));
        Assert.False(ServerPermissions.CanUsePanel([]));
        Assert.False(ServerPermissions.CanUsePanel([]));
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
    public void PlayerCannotExecutePluginCommands(string command) => Assert.True(ServerPermissions.Blocks([], command));

    [Theory]
    [InlineData("css_sn test")]
    [InlineData(".savenade test")]
    [InlineData("css_in test")]
    [InlineData("!importnade test")]
    [InlineData(".dn test")]
    [InlineData("css_delnade test")]
    [InlineData("css_deletenade test")]
    public void MatchAdminCannotWriteNades(string command) => Assert.True(ServerPermissions.Blocks(["training.use", "commands.control"], command));

    [Fact]
    public void NormalGameplayAndMatchAdminControlsRemainAvailable()
    {
        Assert.False(ServerPermissions.Blocks([], "jointeam 2"));
        Assert.False(ServerPermissions.Blocks([], "hello team"));
        Assert.False(ServerPermissions.Blocks(["training.use", "commands.control"], ".prac"));
        Assert.False(ServerPermissions.Blocks(["training.use", "commands.control"], "css_training"));
        Assert.False(ServerPermissions.Blocks(["training.use", "commands.control"], "css_loadnade smoke"));
        Assert.False(ServerPermissions.Blocks(["training.use", "commands.control", "lineups.capture"], "css_savenade test"));
    }

    [Fact]
    public void MissingOrMalformedRoleFileDefaultsToPlayerAndDemotionIsImmediate()
    {
        var path = Path.GetTempFileName();
        try
        {
            var permissions = new ServerPermissions(path);
            Assert.Empty(permissions.Read().For(123));
            void Publish(string[] grants) => File.WriteAllText(path, System.Text.Json.JsonSerializer.Serialize(new { schemaVersion = 1, serverId = "primary", revision = new string('a', 64), users = new Dictionary<string, string[]> { ["123"] = grants }, cssAdmins = new { } }));
            Publish(["training.use", "commands.control"]);
            Assert.Contains("commands.control", permissions.Read().For(123));
            Assert.Empty(permissions.Read().For(456));
            Publish(["training.use"]);
            Assert.DoesNotContain("commands.control", permissions.Read().For(123));
            Publish(["unknown"]);
            Assert.Empty(permissions.Read().For(123));
            File.WriteAllText(path, "{}");
            Assert.Equal("{}", permissions.Read().CssAdmins);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void MatchAdminMenuDoesNotOfferRecording()
    {
        var menu = TrainingMenu.Create([], "de_mirage", true, null, canWriteNades: false);
        Assert.DoesNotContain(menu.Current.Items, item => item.Label == "Neue Nade aufnehmen");
    }

    [Fact]
    public void CapturingRequiresBothTrainingAndPlatformCapability()
    {
        Assert.True(ServerPermissions.Blocks(["lineups.capture"], ".sn test"));
        Assert.False(ServerPermissions.CanUsePanel(["lineups.capture"]));
        Assert.False(ServerPermissions.Blocks(["training.use", "lineups.capture"], ".sn test"));
        Assert.True(ServerPermissions.Blocks(["training.use", "commands.control"], ".sn test"));
    }

    [Theory]
    [InlineData(2, "primary")]
    [InlineData(1, "other")]
    public void WrongSchemaOrServerCannotGrantPermissions(int schemaVersion, string serverId)
    {
        var path = Path.GetTempFileName();
        try
        {
            File.WriteAllText(path, System.Text.Json.JsonSerializer.Serialize(new { schemaVersion, serverId, revision = new string('a', 64), users = new Dictionary<string, string[]> { ["123"] = ["commands.control"] }, cssAdmins = new { admin = new { flags = new[] { "@css/root" } } } }));
            var snapshot = new ServerPermissions(path).Read();
            Assert.Empty(snapshot.For(123));
            Assert.Equal("{}", snapshot.CssAdmins);
        }
        finally { File.Delete(path); }
    }
}

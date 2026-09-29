using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class PlayerPanelSettingsTests : IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "panel-settings-" + Guid.NewGuid());
    public void Dispose() { if (Directory.Exists(_directory)) Directory.Delete(_directory, true); }

    [Fact]
    public void SettingsSurviveNewStoreAndStayIsolatedBySteamId()
    {
        var store = new PlayerPanelSettingsStore(_directory);
        var first = new PlayerPanelSettings().Bind("focus", "k") with { Favorites = [new("default", "de_mirage", "window")] };
        store.Save(76561198000000001, first);
        store.Save(76561198000000002, new PlayerPanelSettings().Bind("visible", "l") with { GameButtons = true });
        var restarted = new PlayerPanelSettingsStore(_directory);
        Assert.Equal("K", restarted.Load(76561198000000001).Keys["focus"]);
        Assert.Equal(new NadeReference("default", "de_mirage", "window"), Assert.Single(restarted.Load(76561198000000001).Favorites));
        Assert.Equal("F6", restarted.Load(76561198000000002).Keys["focus"]);
        Assert.True(restarted.Load(76561198000000002).GameButtons);
        Assert.Empty(restarted.Load(76561198000000002).Favorites);
        Assert.Empty(restarted.Load(76561198000000003).Favorites);
    }

    [Theory]
    [InlineData("F7")]
    [InlineData("K;quit")]
    [InlineData("\"K\"")]
    [InlineData("../../file")]
    public void InvalidOrConflictingKeysCannotChangeSavedProfile(string key)
    {
        var store = new PlayerPanelSettingsStore(_directory);
        var settings = new PlayerPanelSettings();
        store.Save(1, settings);
        Assert.Throws<InvalidDataException>(() => settings.Bind("focus", key));
        Assert.Equal("F6", store.Load(1).Keys["focus"]);
    }

    [Fact]
    public void RebindingMakesOldKeyInactiveAndExportsOnlyValidatedCommands()
    {
        var settings = new PlayerPanelSettings().Bind("focus", "k");
        Assert.Null(settings.ActionForKey("F6"));
        Assert.Equal("focus", settings.ActionForKey("k"));
        Assert.Contains("bind \"K\" \"css_training_key K\"", settings.Export());
        Assert.DoesNotContain("F6", settings.Export());
        Assert.Equal(10, settings.Export().Split('\n').Length);
        Assert.Equal("F6", new PlayerPanelSettings().Keys["focus"]);
    }

    [Fact]
    public void CorruptSettingsAreReportedAndNotOverwrittenByReading()
    {
        Directory.CreateDirectory(_directory);
        var path = Path.Combine(_directory, "1.json");
        File.WriteAllText(path, "{broken");
        Assert.Throws<System.Text.Json.JsonException>(() => new PlayerPanelSettingsStore(_directory).Load(1));
        Assert.Equal("{broken", File.ReadAllText(path));
        Assert.Throws<InvalidDataException>(() => new PlayerPanelSettingsStore(_directory).Save(0, new()));
    }

    [Fact]
    public void MenuOffersAllActionsAndDisablesConflicts()
    {
        var page = PanelSettingsMenu.Create(new());
        Assert.Equal(PlayerPanelSettings.DefaultKeys.Count + 2, page.Items.Count);
        var focusKeys = page.Items[0].Page!;
        Assert.False(focusKeys.Items.Single(i => i.Label == "F7").Enabled);
        var key = focusKeys.Items.Single(i => i.Label == "K");
        Assert.True(key.Enabled);
        Assert.Equal(new MenuRequest(TrainingAction.BindKey, Setting: "focus", Value: "K"), key.Request);
    }
}

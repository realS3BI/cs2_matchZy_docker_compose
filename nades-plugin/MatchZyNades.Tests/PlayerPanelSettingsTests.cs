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
        var first = new PlayerPanelSettings() with { Favorites = [new("default", "de_mirage", "window")] };
        store.Save(76561198000000001, first);
        store.Save(76561198000000002, new PlayerPanelSettings() with { GameButtons = true, Keys = new() { ["focus"] = "K" } });
        var restarted = new PlayerPanelSettingsStore(_directory);
        Assert.Equal("KP_0", restarted.Load(76561198000000001).Keys["focus"]);
        Assert.Equal(new NadeReference("default", "de_mirage", "window"), Assert.Single(restarted.Load(76561198000000001).Favorites));
        Assert.Equal("KP_0", restarted.Load(76561198000000002).Keys["focus"]);
        Assert.False(restarted.Load(76561198000000002).GameButtons);
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
        Assert.Equal("KP_0", store.Load(1).Keys["focus"]);
    }

    [Fact]
    public void FixedKeysIgnoreLegacyOverridesAndExportOnlyNineCommands()
    {
        var settings = PlayerPanelSettings.Validate(new() { Keys = new() { ["focus"] = "K;quit" }, GameButtons = true });
        Assert.Null(settings.ActionForKey("F6"));
        Assert.Null(settings.ActionForKey("K"));
        Assert.Equal("focus", settings.ActionForKey("kp_0"));
        Assert.Equal("visible", settings.ActionForKey("KP_DEL"));
        Assert.Contains("bind \"KP_0\" \"css_training_key KP_0\"", settings.Export());
        Assert.DoesNotContain("quit", settings.Export());
        Assert.Equal(9, settings.Export().Split('\n').Length);
        Assert.False(settings.GameButtons);
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
    public void KeybindMenuIsReadOnlyExceptForExport()
    {
        var page = PanelSettingsMenu.Create(new());
        Assert.Equal("Keybinds", page.Title);
        Assert.Equal(10, page.Items.Count);
        Assert.All(page.Items.Skip(1), item => { Assert.Null(item.Page); Assert.Null(item.Request); });
        Assert.Equal(TrainingAction.ExportBindings, page.Items.First().Request!.Action);
    }

    [Fact]
    public void ConsoleExportHasOnePanelCommandLineAndSeparateOptionalNoclip()
    {
        var settings = new PlayerPanelSettings();
        var lines = settings.ConsoleExport().Split('\n');
        Assert.Equal(2, lines.Length);
        Assert.Equal(settings.Export().Split('\n'), lines[0].Split("; "));
        Assert.Equal("bind \"n\" \"noclip\"", lines[1]);
    }
}

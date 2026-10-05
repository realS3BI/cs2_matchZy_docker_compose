using Playbook;
using Xunit;

namespace Playbook.Tests;

public sealed class TrainingMapsTests
{
    private const string Catalog = """[{"mapName":"de_mirage","title":"Mirage","category":"active"},{"mapName":"de_thera","title":"Thera","category":"community"}]""";
    [Fact]
    public void InventorySeparatesInstalledMissingAndOtherMapsAndExcludesScenery()
    {
        var maps = TrainingMaps.Build(["de_mirage", "de_mirage_vanity", "warehouse_vanity", "graphics_settings", "workshop_preview_mirage", "aim_test"], Catalog, "{}");
        Assert.Equal(3, maps.Count);
        Assert.Equal("active", maps.Single(m => m.MapName == "de_mirage").Category);
        var missing = maps.Single(m => m.MapName == "de_thera");
        Assert.Equal("unavailable", missing.Category);
        Assert.False(missing.Available);
        Assert.Equal("", missing.Command);
        Assert.Equal("other", maps.Single(m => m.MapName == "aim_test").Category);
    }
    [Fact]
    public void AppliedWorkshopMapRestoresItsCatalogCategoryAndUsesWorkshopCommand()
    {
        var settings = """{"workshopMapsEnabled":true,"workshopMaps":"123,456,789","workshopMapCatalog":"[{\"workshopId\":\"123\",\"mapName\":\"de_thera\",\"title\":\"Thera\"},{\"workshopId\":\"456\",\"mapName\":\"de_thera_vanity\",\"title\":\"Skybox\"}]"}""";
        var maps = TrainingMaps.Build(["de_mirage"], Catalog, settings);
        var thera = maps.Single(m => m.MapName == "de_thera");
        Assert.Equal("reserve", thera.Category);
        Assert.True(thera.Available);
        Assert.Equal("host_workshop_map 123", thera.Command);
        Assert.DoesNotContain(maps, m => m.WorkshopId == "456");
        Assert.Equal("host_workshop_map 789", maps.Single(m => m.WorkshopId == "789").Command);
    }
    [Fact]
    public void SoloVoteRequiresExplicitAnswer()
    {
        var vote = new MajorityVote([42]);
        Assert.False(vote.Passed);
        Assert.Equal(0, vote.Yes);
        vote.Cast(42, true);
        Assert.True(vote.Passed);
    }
}

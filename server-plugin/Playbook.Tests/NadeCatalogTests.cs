using System.Globalization;
using System.Text.Json;
using Playbook;
using Xunit;

namespace Playbook.Tests;

public sealed class NadeCatalogTests
{
    [Fact]
    public void LegacyOverlappingMovementFlagsBecomeOneMovement()
    {
        var json = JsonSerializer.Serialize(new { @default = new { window = Entry() } });
        var metadata = JsonSerializer.Serialize(new[] { new { owner = "default", map = "de_mirage", name = "window",
            is_walking = true, is_running = true, is_stepping = true } });
        var nade = Assert.Single(NadeCatalog.Parse(json, "de_mirage", "7655", metadata));
        Assert.Equal(new ThrowAttributes(IsStepping: true), nade.Attributes);
    }
    [Fact]
    public void DisplayNamesPreserveKeysAndAreScopedByOwnerAndMap()
    {
        var json = JsonSerializer.Serialize(new { @default = new { window = Entry() }, @private = new { window = Entry() } });
        var metadata = JsonSerializer.Serialize(new[] {
            new { owner = "default", map = "de_mirage", name = "window", displayName = "Fenster vom T-Spawn" },
            new { owner = "private", map = "de_mirage", name = "window", displayName = "Privates Fenster" }
        });
        var entry = NadeCatalog.Parse(json, "de_mirage", "7656", metadata).Single(n => n.Owner == "default");
        Assert.Equal("window", entry.Name);
        Assert.Equal("Fenster vom T-Spawn", entry.Title);
        Assert.All(NadeCatalog.Parse(json, "de_mirage", "7656"), nade => Assert.Equal("window", nade.Title));
    }

    private static object Entry(string map = "de_mirage", string type = "Smoke", string position = "1.5 -2 3") =>
        new { Map = map, Type = type, LineupPos = position, LineupAng = "-12.5 90 0", Desc = "Jumpthrow" };

    [Fact]
    public void PanelMetadataSuppliesTypedAttributesSideLocationsAndMeasuredTimeAfterMatchZyStripsThem()
    {
        var json = JsonSerializer.Serialize(new { @default = new { window = Entry() } });
        var metadata = JsonSerializer.Serialize(new[] { new {
            owner = "default", map = "de_mirage", name = "window", team = "ct", throwFromTitle = "Über T-Spawn", throwToTitle = "Fenster",
            throwTechnique = "Ein Schritt", is_jumpthrow = true, is_crouch = false, is_walking = false, is_running = false,
            is_stepping = true, click_type = "both", flightDuration = 3.125f, landingPos = "100.5 -20 30"
        } });
        var nade = Assert.Single(NadeCatalog.Parse(json, "de_mirage", "7655", metadata));
        Assert.Equal("ct", nade.Team);
        Assert.Equal("Über T-Spawn", nade.ThrowFromTitle);
        Assert.Equal("Fenster", nade.ThrowToTitle);
        Assert.Equal("Ein Schritt", nade.Technique);
        Assert.Equal(new ThrowAttributes(IsJumpthrow: true, IsStepping: true, ClickType: "both"), nade.Attributes);
        Assert.Equal(3.125f, nade.FlightDuration);
        Assert.Equal(new Coordinates(100.5f, -20, 30), nade.LandingPosition);
        var legacy = Assert.Single(NadeCatalog.Parse(json, "de_mirage", "7655"));
        Assert.Null(legacy.Attributes);
        Assert.Null(legacy.FlightDuration);
        Assert.Null(legacy.LandingPosition);
    }

    [Fact]
    public void LandingPointsRespectOwnerAndMapAndReadMatchZysExtendedField()
    {
        var json = JsonSerializer.Serialize(new {
            @default = new { window = new { Map = "de_mirage", Type = "Smoke", LineupPos = "1 2 3", LineupAng = "4 5 6", LandingPos = "10 20 30" } },
            @private = new { window = Entry() }
        });
        var metadata = JsonSerializer.Serialize(new[] {
            new { owner = "private", map = "de_mirage", name = "window", landingPos = "40 50 60" },
            new { owner = "default", map = "de_nuke", name = "window", landingPos = "70 80 90" }
        });
        var nades = NadeCatalog.Parse(json, "de_mirage", "7655", metadata);
        Assert.Equal(new Coordinates(10, 20, 30), nades.Single(n => n.Owner == "default").LandingPosition);
        Assert.Equal(new Coordinates(40, 50, 60), nades.Single(n => n.Owner == "private").LandingPosition);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("1 2")]
    [InlineData("NaN 2 3")]
    [InlineData("Infinity 2 3")]
    public void ClearedOrMalformedMetadataNeverUsesAnOldLandingPoint(string? target)
    {
        var json = JsonSerializer.Serialize(new { @default = new { window = new {
            Map = "de_mirage", Type = "Smoke", LineupPos = "1 2 3", LineupAng = "4 5 6", LandingPos = "10 20 30"
        } } });
        var metadata = JsonSerializer.Serialize(new[] { new { owner = "default", map = "de_mirage", name = "window", landingPos = target } });
        Assert.Null(Assert.Single(NadeCatalog.Parse(json, "de_mirage", "7655", metadata)).LandingPosition);
    }

    [Fact]
    public void UsesPanelFormatAndAllOwnersOnCurrentMap()
    {
        var json = JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["default"] = new { window = Entry(), elsewhere = Entry("de_nuke") },
            ["76561198000000001"] = new { window = Entry(type: "Flash") },
            ["76561198000000002"] = new { secret = Entry() }
        });
        var nades = NadeCatalog.Parse(json, "de_mirage", "76561198000000001");
        Assert.Equal(3, nades.Count);
        Assert.Contains(nades, n => n.Owner == "76561198000000002" && n.Name == "secret");
        Assert.Contains(nades, n => n.Owner == "default" && n.Kind == NadeKind.Smoke);
        Assert.Contains(nades, n => n.Owner == "76561198000000001" && n.Kind == NadeKind.Flash);
        Assert.All(nades, n => Assert.Equal("Jumpthrow", n.Description));
    }

    [Fact]
    public void SkipsMalformedEntriesWithoutLosingValidNades()
    {
        var json = JsonSerializer.Serialize(new
        {
            @default = new { valid = Entry(), broken = Entry(position: "NaN 2 3"), truncated = Entry(position: "1 2"), missing = new { Map = "de_mirage" }, scalar = "bad" },
            someone = "bad owner"
        });
        Assert.Equal("valid", Assert.Single(NadeCatalog.Parse(json, "de_mirage", "7656")).Name);
    }

    [Fact]
    public void InvalidFileFailsInsteadOfPretendingLibraryIsEmpty()
    {
        Assert.ThrowsAny<JsonException>(() => NadeCatalog.Parse("{", "de_mirage", "7656"));
        Assert.Throws<JsonException>(() => NadeCatalog.Parse("[]", "de_mirage", "7656"));
    }

    [Fact]
    public void CoordinatesUseInvariantCultureAndRejectNonFiniteValues()
    {
        var previous = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("de-AT");
            Assert.True(Coordinates.TryParse("1.5\t-2.75 3e2", out var value));
            Assert.Equal(new Coordinates(1.5f, -2.75f, 300), value);
            foreach (var text in new[] { "NaN 0 0", "Infinity 0 0", "1e100 0 0", "1,5 0 0", "0 0", "0 0 0 0" })
                Assert.False(Coordinates.TryParse(text, out _));
        }
        finally { CultureInfo.CurrentCulture = previous; }
    }

    [Theory]
    [InlineData("Smoke", NadeKind.Smoke, "weapon_smokegrenade", "slot8")]
    [InlineData("HE", NadeKind.HE, "weapon_hegrenade", "slot6")]
    [InlineData("Flash", NadeKind.Flash, "weapon_flashbang", "slot7")]
    [InlineData("Molly", NadeKind.Fire, "weapon_molotov", "slot10")]
    [InlineData("Decoy", NadeKind.Decoy, "weapon_decoy", "slot9")]
    public void MapsMatchZyTypesToEquipment(string type, NadeKind kind, string weapon, string slot)
    {
        Assert.Equal(kind, NadeCatalog.Kind(type));
        Assert.Equal((weapon, slot), NadeCatalog.Equipment(kind, false));
    }

    [Fact]
    public void UntypedNadesRemainAvailableWithoutInventingGrenadeType()
    {
        Assert.Equal(NadeKind.Other, NadeCatalog.Kind(""));
        Assert.Null(NadeCatalog.Equipment(NadeKind.Other, false));
        Assert.Equal(("weapon_incgrenade", "slot10"), NadeCatalog.Equipment(NadeKind.Fire, true));
    }
}

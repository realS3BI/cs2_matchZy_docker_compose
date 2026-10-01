using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class LineupEditTests
{
    [Theory]
    [InlineData("team", "CT", "ct")]
    [InlineData("team", "beide", "both")]
    [InlineData("click_type", "rechts", "right")]
    [InlineData("click_type", "beide", "both")]
    [InlineData("throwFromTitle", "Über T-Spawn", "Über T-Spawn")]
    [InlineData("throwToTitle", "Fenster", "Fenster")]
    [InlineData("throwToTitle", "-", "")]
    [InlineData("type", "molotov", "Molly")]
    [InlineData("lineupPos", "1  2 3", "1 2 3")]
    [InlineData("movement", "gehen", "walk")]
    [InlineData("movement", "laufen", "run")]
    [InlineData("movement", "schrittwurf", "step")]
    [InlineData("movement", "stand", "stand")]
    public void ChatInputMapsToCanonicalValues(string field, string input, string expected)
    {
        Assert.True(LineupEditFields.TryParse(field, input, out var value));
        Assert.Equal(expected, value);
    }

    [Theory]
    [InlineData("ja", true)] [InlineData("nein", false)] [InlineData("true", true)] [InlineData("0", false)]
    public void ChatBooleansRemainTyped(string input, bool expected)
    {
        Assert.True(LineupEditFields.TryParse("is_jumpthrow", input, out var value));
        Assert.Equal(expected, Assert.IsType<bool>(value));
    }

    [Theory]
    [InlineData("official", "true")] [InlineData("throwTechnique", "Jumpthrow")]
    [InlineData("flightDuration", "-1")] [InlineData("flightDuration", "NaN")]
    [InlineData("movement", "gehen laufen")]
    [InlineData("team", "xyz")] [InlineData("click_type", "middle")]
    [InlineData("is_crouch", "vielleicht")] [InlineData("lineupPos", "1 2 NaN")]
    [InlineData("throwFromTitle", "a\nb")]
    public void UnsupportedFieldsAndInvalidValuesAreRejected(string field, string value) =>
        Assert.False(LineupEditFields.TryParse(field, value, out _));

    [Theory]
    [InlineData("3.125", 3.125f)] [InlineData("3,125", 3.125f)] [InlineData("0", 0)]
    public void ParsesManualFlightSeconds(string input, float expected)
    {
        Assert.True(LineupEditFields.TryParse("flightDuration", input, out var value));
        Assert.Equal(expected, Assert.IsType<float>(value));
        Assert.True(LineupEditFields.TryParse("flightDuration", "-", out var cleared));
        Assert.Null(cleared);
    }

    [Fact]
    public void EveryAttributeIsReachableInTheCompactPanelWithCurrentValues()
    {
        var nade = new NadeLineup("76561198000000001", "window", "de_mirage", NadeKind.Smoke, "", new(1, 2, 3), new(0, 90, 0),
            Team: "ct", ThrowFromTitle: "Über T-Spawn", ThrowToTitle: "Fenster", Attributes: new(IsJumpthrow: true, ClickType: "both"), FlightDuration: 3.5f);
        var menu = TrainingMenu.Create([nade], nade.Map, true, null, steamId: nade.Owner);
        menu.Select(1); menu.Select(1); menu.Select(4); menu.Select(1);
        Assert.Contains("Flugzeit 3.50 s", menu.Current.Description);
        Assert.Contains(menu.Current.Items, item => item.Label == "Flugzeit: 3.50 s" && item.Request == null);
        var settings = menu.Current.Items.Single(i => i.Page?.Key.StartsWith("attributes:") == true).Page!;
        menu.Enter(settings);
        Assert.Equal(9, menu.Visible.Count());
        Assert.Equal(2, menu.PageCount);
        foreach (var field in new[] { "team", "throwFromTitle", "throwToTitle", "movement", "flightDuration", "click_type", "type", "is_jumpthrow", "is_crouch" })
            Assert.Contains(settings.Items, i => i.Request?.Action == TrainingAction.EditField && i.Request.Setting == field);
        Assert.Contains(settings.Items, i => i.Label == "Seite: CT");
        Assert.Contains(settings.Items, i => i.Label == "Jumpthrow: Ja");
        Assert.Contains(settings.Items, i => i.Label == "Bewegung: Stand");
        Assert.Contains(settings.Items, i => i.Label == "Flugzeit: 3.50 s");
        Assert.DoesNotContain(settings.Items, i => i.Request?.Setting == "throwTechnique");
        Assert.DoesNotContain(settings.Items, i => new[] { "is_walking", "is_running", "is_stepping" }.Contains(i.Request?.Setting));
        var coordinates = settings.Items.Single(i => i.Page?.Key.StartsWith("coordinates:") == true).Page!;
        Assert.Equal(new[] { "lineupPos", "lineupAng", "landingPos" }, coordinates.Items.Select(i => i.Request!.Setting));
        var changed = nade with { Attributes = new(IsCrouch: true, IsRunning: true, ClickType: "right"), FlightDuration = 2.25f };
        menu.Refresh(TrainingMenu.Create([changed], nade.Map, true, null, steamId: nade.Owner).Current);
        Assert.Contains(menu.Current.Items, i => i.Label == "Bewegung: Laufen");
        Assert.Contains(menu.Current.Items, i => i.Label == "Jumpthrow: Nein");
        Assert.Contains(menu.Current.Items, i => i.Label == "Geduckt: Ja");
        Assert.Contains(menu.Current.Items, i => i.Label == "Maustaste: Rechts");
        Assert.Contains(menu.Current.Items, i => i.Label == "Flugzeit: 2.25 s");
    }
}

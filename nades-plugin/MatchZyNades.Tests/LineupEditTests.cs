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
    [InlineData("official", "true")] [InlineData("flightDuration", "3")]
    [InlineData("team", "xyz")] [InlineData("click_type", "middle")]
    [InlineData("is_crouch", "vielleicht")] [InlineData("lineupPos", "1 2 NaN")]
    [InlineData("throwFromTitle", "a\nb")]
    public void UnsupportedFieldsAndInvalidValuesAreRejected(string field, string value) =>
        Assert.False(LineupEditFields.TryParse(field, value, out _));

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
        foreach (var field in new[] { "team", "throwFromTitle", "throwToTitle", "throwTechnique", "click_type", "type" }.Concat(ThrowAttributes.Flags))
            Assert.Contains(settings.Items, i => i.Request?.Action == TrainingAction.EditField && i.Request.Setting == field);
        Assert.Contains(settings.Items, i => i.Label == "Seite: CT");
        Assert.Contains(settings.Items, i => i.Label == "Jumpthrow: Ja");
        menu.ChangePage(1);
        Assert.Equal("click_type", menu.Select(1)!.Setting);
        var coordinates = settings.Items.Single(i => i.Page?.Key.StartsWith("coordinates:") == true).Page!;
        Assert.Equal(new[] { "lineupPos", "lineupAng", "landingPos" }, coordinates.Items.Select(i => i.Request!.Setting));
    }
}

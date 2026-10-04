using Playbook;
using Xunit;

namespace Playbook.Tests;

public sealed class LineupEditTests
{
    [Theory]
    [InlineData("team", "CT", "ct")]
    [InlineData("team", "beide", "both")]
    [InlineData("throwFromTitle", "Über T-Spawn", "Über T-Spawn")]
    [InlineData("throwToTitle", "Fenster", "Fenster")]
    [InlineData("throwToTitle", "-", "")]
    public void ChatInputMapsToCanonicalValues(string field, string input, string expected)
    {
        Assert.True(LineupEditFields.TryParse(field, input, out var value));
        Assert.Equal(expected, value);
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
    [InlineData("flightDuration", "3.125")] [InlineData("flightDuration", "-")]
    [InlineData("movement", "stand")] [InlineData("lineupPos", "1 2 3")]
    [InlineData("landingPos", "1 2 3")] [InlineData("lineupAng", "0 90 0")]
    [InlineData("is_jumpthrow", "ja")] [InlineData("click_type", "links")]
    [InlineData("type", "smoke")] [InlineData("displayName", "Neuer Name")] [InlineData("desc", "Neuer Text")]
    public void MeasuredDataCannotBeEditedFromChat(string field, string input) => Assert.False(LineupEditFields.TryParse(field, input, out _));

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
        Assert.Equal(new[] { "team", "throwFromTitle", "throwToTitle" }, settings.Items.Where(i => i.Request != null).Select(i => i.Request!.Setting));
        Assert.All(settings.Items.Where(i => i.Page == null && i.Request == null), i => Assert.False(i.Enabled));
        Assert.Contains(settings.Items, i => i.Label == "Seite: CT");
        Assert.Contains(settings.Items, i => i.Label == "Jumpthrow: Ja");
        Assert.Contains(settings.Items, i => i.Label == "Bewegung: Stand");
        Assert.Contains(settings.Items, i => i.Label == "Flugzeit: 3.50 s");
        Assert.DoesNotContain(settings.Items, i => i.Request?.Setting == "throwTechnique");
        Assert.DoesNotContain(settings.Items, i => new[] { "is_walking", "is_running", "is_stepping" }.Contains(i.Request?.Setting));
        var coordinates = settings.Items.Single(i => i.Page?.Key.StartsWith("coordinates:") == true).Page!;
        Assert.All(coordinates.Items, i => { Assert.Null(i.Request); Assert.False(i.Enabled); });
        var changed = nade with { Attributes = new(IsCrouch: true, IsRunning: true, ClickType: "right"), FlightDuration = 2.25f };
        menu.Refresh(TrainingMenu.Create([changed], nade.Map, true, null, steamId: nade.Owner).Current);
        Assert.Contains(menu.Current.Items, i => i.Label == "Bewegung: Laufen");
        Assert.Contains(menu.Current.Items, i => i.Label == "Jumpthrow: Nein");
        Assert.Contains(menu.Current.Items, i => i.Label == "Geduckt: Ja");
        Assert.Contains(menu.Current.Items, i => i.Label == "Maustaste: Rechts");
        Assert.Contains(menu.Current.Items, i => i.Label == "Flugzeit: 2.25 s");
    }
}

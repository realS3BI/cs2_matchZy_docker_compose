using Playbook;
using Xunit;

namespace Playbook.Tests;

public sealed class ReviewEffectTargetTests
{
    private static NadeLineup Lineup => new("default", "window", "de_anubis", NadeKind.Smoke, "", new(1, 2, 3), new(4, 5, 6),
        Revision: "2026-10-01T12:00:00Z", LandingPosition: new(10, 20, 30));
    private static NadeCapture Capture => NadeCaptureFile.Create(Lineup, new(100, 200, 300)) with { CapturedAt = "2026-10-01T12:01:00Z" };

    [Fact]
    public void UsesTheLatestMeasuredTargetBeforeWebsiteSyncAndKeepsSavedPointsWithoutCaptures()
    {
        var latest = Capture with { LandingPos = "400 500 600", CapturedAt = "2026-10-01T12:02:00Z" };
        Assert.Equal(new Coordinates(400, 500, 600), ReviewEffectTarget.Resolve(Lineup, [latest, Capture]));
        Assert.Equal(new Coordinates(100, 200, 300), ReviewEffectTarget.Resolve(Lineup with { LandingPosition = null }, [Capture]));
        Assert.Equal(Lineup.LandingPosition, ReviewEffectTarget.Resolve(Lineup, null));
    }

    [Theory]
    [InlineData("owner")]
    [InlineData("map")]
    [InlineData("name")]
    [InlineData("position")]
    [InlineData("angles")]
    [InlineData("nonfinite")]
    [InlineData("time")]
    [InlineData("older")]
    public void NeverTeleportsToAnotherLineupAnOldThrowOrInvalidCoordinates(string mismatch)
    {
        var capture = mismatch switch {
            "owner" => Capture with { Owner = "76561198000000001" },
            "map" => Capture with { Map = "de_mirage" },
            "name" => Capture with { Name = "door" },
            "position" => Capture with { LineupPos = "1 2 4" },
            "angles" => Capture with { LineupAng = "4 6 6" },
            "nonfinite" => Capture with { LandingPos = "NaN 2 3" },
            "time" => Capture with { CapturedAt = "invalid" },
            _ => Capture with { CapturedAt = "2026-10-01T11:59:00Z" }
        };
        Assert.Equal(Lineup.LandingPosition, ReviewEffectTarget.Resolve(Lineup, [capture]));
        Assert.Null(ReviewEffectTarget.Resolve(Lineup with { LandingPosition = null }, [capture]));
    }
}

using System.Text.Json;
using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class NadeCaptureTests
{
    private static NadeLineup Lineup(string name, NadeKind kind = NadeKind.Smoke, string owner = "default") =>
        new(owner, name, "de_mirage", kind, "", new(1, 2, 3), new(4, 5, 6), "Fenster vom Spawn");

    [Fact]
    public void TracksPlayersAndOutOfOrderProjectilesIndependently()
    {
        var tracker = new NadeCaptureTracker();
        var first = Lineup("first");
        var second = Lineup("second", NadeKind.Flash, "7656");
        tracker.Arm(1, 7655, first, 0);
        tracker.Arm(2, 7656, second, 0);
        tracker.Thrown(1, 7655, NadeKind.Smoke, 1);
        tracker.Thrown(2, 7656, NadeKind.Flash, 1);
        tracker.Projectile(100, 1, 7655, NadeKind.Smoke, 1.01f);
        tracker.Projectile(101, 2, 7656, NadeKind.Flash, 1.01f);
        Assert.Equal(second, tracker.Complete(101, 2, 7656, NadeKind.Flash, "de_mirage", 3));
        Assert.Equal(first, tracker.Complete(100, 1, 7655, NadeKind.Smoke, "de_mirage", 8));
        Assert.Null(tracker.Complete(100, 1, 7655, NadeKind.Smoke, "de_mirage", 9));
    }

    [Fact]
    public void LoadingAnotherLineupKeepsAnAlreadyFlyingGrenadeAssociated()
    {
        var tracker = new NadeCaptureTracker();
        var first = Lineup("first");
        var second = Lineup("second");
        tracker.Arm(1, 7655, first, 0);
        tracker.Thrown(1, 7655, NadeKind.Smoke, 1);
        tracker.Projectile(100, 1, 7655, NadeKind.Smoke, 1.01f);
        tracker.Arm(1, 7655, second, 2);
        Assert.Equal(first, tracker.Complete(100, 1, 7655, NadeKind.Smoke, "de_mirage", 8));
    }

    [Theory]
    [InlineData(2, 7655, NadeKind.Smoke, "de_mirage", 8)]
    [InlineData(1, 7656, NadeKind.Smoke, "de_mirage", 8)]
    [InlineData(1, 7655, NadeKind.Flash, "de_mirage", 8)]
    [InlineData(1, 7655, NadeKind.Smoke, "de_dust2", 8)]
    [InlineData(1, 7655, NadeKind.Smoke, "de_mirage", 40)]
    public void RejectsWrongIdentityMapTypeAndExpiredEvents(int slot, ulong steamId, NadeKind kind, string map, float now)
    {
        var tracker = new NadeCaptureTracker();
        tracker.Arm(1, 7655, Lineup("first"), 0);
        tracker.Thrown(1, 7655, NadeKind.Smoke, 1);
        tracker.Projectile(100, 1, 7655, NadeKind.Smoke, 1.01f);
        Assert.Null(tracker.Complete(100, slot, steamId, kind, map, now));
    }

    [Fact]
    public void DoesNotCaptureRethrowsUnarmedWrongTypeOrExpiredThrows()
    {
        foreach (var scenario in new[] { "unarmed", "rethrow", "wrong-type", "expired", "disconnected", "map-change", "reused-index" })
        {
            var tracker = new NadeCaptureTracker();
            if (scenario != "unarmed") tracker.Arm(1, 7655, Lineup("first"), 0);
            if (scenario != "rethrow") tracker.Thrown(1, 7655, scenario == "wrong-type" ? NadeKind.Flash : NadeKind.Smoke, scenario == "expired" ? 121 : 1);
            tracker.Projectile(100, 1, 7655, NadeKind.Smoke, 1.01f);
            if (scenario == "disconnected") tracker.Forget(1);
            if (scenario == "map-change") tracker.Clear();
            if (scenario == "reused-index") tracker.Projectile(100, 2, 7666, NadeKind.Smoke, 2);
            Assert.Null(tracker.Complete(100, 1, 7655, NadeKind.Smoke, "de_mirage", 8));
        }
    }

    [Fact]
    public void CaptureFileReplacesOnlyExactLineupAndUsesPanelContract()
    {
        var path = Path.Combine(Path.GetTempPath(), "nade-capture-" + Guid.NewGuid(), "captures.json");
        try
        {
            var first = NadeCaptureFile.Create(Lineup("first"), new(100, -200, 400));
            NadeCaptureFile.Write(path, first);
            NadeCaptureFile.Write(path, NadeCaptureFile.Create(Lineup("first", owner: "7656"), new(10, 20, 30)));
            var updated = NadeCaptureFile.Create(Lineup("first"), new(150, -250, 450));
            NadeCaptureFile.Write(path, updated);
            using var json = JsonDocument.Parse(File.ReadAllText(path));
            Assert.Equal(2, json.RootElement.GetArrayLength());
            var entry = json.RootElement[1];
            Assert.Equal(updated.CaptureId, entry.GetProperty("captureId").GetString());
            Assert.Equal("150 -250 450", entry.GetProperty("landingPos").GetString());
            Assert.Equal("1 2 3", entry.GetProperty("lineupPos").GetString());
            Assert.NotEqual(first.CaptureId, updated.CaptureId);
            Assert.False(File.Exists(path + ".tmp"));
        }
        finally { Directory.Delete(Path.GetDirectoryName(path)!, recursive: true); }
    }
}

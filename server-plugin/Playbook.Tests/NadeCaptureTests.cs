using System.Text.Json;
using Playbook;
using Xunit;

namespace Playbook.Tests;

public sealed class NadeCaptureTests
{
    [Theory]
    [InlineData(true)] [InlineData(false)]
    public void DropperSmokeKeepsItsEndpointAndMeasuredTimeWithEitherEventOrder(bool spawnFirst)
    {
        var tracker = new NadeCaptureTracker();
        var smoke = new NadeLineup("76561198000000001", "capture_dropper", "de_anubis", NadeKind.Smoke, "",
            new(-400, 2192, 32), new(80, 90, 0));
        tracker.Arm(1, 76561198000000001, smoke, 0);
        if (spawnFirst) tracker.Projectile(100, 1, 76561198000000001, NadeKind.Smoke, 1);
        Assert.True(tracker.Thrown(1, 76561198000000001, NadeKind.Smoke, 1.01f));
        if (!spawnFirst) tracker.Projectile(100, 1, 76561198000000001, NadeKind.Smoke, 1.02f);
        Assert.True(tracker.HasThrown(1));
        Assert.Equal((1, 76561198000000001UL), tracker.Thrower(100));
        var measured = tracker.CompleteMeasured(100, 1, 76561198000000001, NadeKind.Smoke, "de_anubis", 41.01f);
        Assert.NotNull(measured);
        Assert.Equal(smoke, measured.Value.Lineup);
        Assert.Equal(40, measured.Value.Seconds, 3);
        Assert.False(tracker.HasThrown(1));
        Assert.Null(tracker.CompleteMeasuredByThrower(1, 76561198000000001, NadeKind.Smoke, "de_anubis", 42));
    }

    [Fact]
    public void ExplicitReplacementSerializesAllMeasuredFieldsAndOriginalRevision()
    {
        var original = Lineup("dropper", owner: "76561198000000001") with { Revision = "revision-1", Team = "ct" };
        var replacement = NadeCaptureFile.CreateReplacement(original, NadeKind.Smoke, new(10, 20, 30),
            new(0, 90, 0), new(100, 200, 300), "Stand", "[]", new(IsCrouch: true), 2.5f);
        var json = JsonSerializer.SerializeToElement(replacement, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        Assert.False(json.GetProperty("newLineup").GetBoolean());
        Assert.Equal("revision-1", json.GetProperty("editRevision").GetString());
        Assert.Equal(original.Name, json.GetProperty("name").GetString());
        Assert.Equal("100 200 300", json.GetProperty("landingPos").GetString());
        Assert.Equal(2.5f, json.GetProperty("flightDuration").GetSingle());
        Assert.True(json.GetProperty("is_crouch").GetBoolean());
        Assert.Equal("left", json.GetProperty("click_type").GetString());
        Assert.Equal("Stand", json.GetProperty("throwTechnique").GetString());
        Assert.Equal("Stand", json.GetProperty("description").GetString());
    }
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
    [InlineData(1, 7655, NadeKind.Smoke, "de_mirage", 182)]
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

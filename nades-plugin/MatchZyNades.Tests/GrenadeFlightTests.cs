using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class GrenadeFlightTests
{
    [Theory]
    [InlineData(NadeKind.Smoke)] [InlineData(NadeKind.Flash)] [InlineData(NadeKind.HE)]
    [InlineData(NadeKind.Fire)] [InlineData(NadeKind.Decoy)]
    public void NewRecordingPersistsAutomaticallyDetectedAttributesAndFlightTime(NadeKind kind)
    {
        ThrowSample[] samples = [new(10, "1 2 3", "0 0 0", "0 90 0", "Attack, Attack2"),
            new(10.1f, "9 2 3", "80 0 150", "0 90 0", "Jump, Duck")];
        var attributes = ThrowAttributes.Detect(samples);
        var lineup = new NadeLineup("7655", "capture_test", "de_mirage", kind, "", new(1, 2, 3), new(0, 90, 0),
            ThrowTrace: ThrowTechnique.Serialize(samples), Attributes: attributes);
        var capture = new NadeCaptureTracker();
        var flight = new GrenadeFlightTracker();
        capture.Arm(1, 7655, lineup, 10);
        Assert.True(capture.Thrown(1, 7655, kind, 10.1f));
        flight.Thrown(1, 7655, kind, 10.1f);
        capture.Projectile(100, 1, 7655, kind, 10.11f);
        flight.Projectile(100, 1, 7655, kind, 10.11f);
        var completed = kind == NadeKind.Fire ? capture.CompleteByThrower(1, 7655, kind, "de_mirage", 13.225f)
            : capture.Complete(100, 1, 7655, kind, "de_mirage", 13.225f);
        Assert.NotNull(completed);
        var seconds = flight.Complete(kind == NadeKind.Fire ? null : 100, 1, 7655, kind, 13.225f);
        var saved = NadeCaptureFile.CreateNew(completed.Owner, "window", "Fenster", completed.Map, completed.Kind,
            completed.Position, completed.Angles, new(10, 20, 30), ThrowTechnique.Summarize(samples), completed.ThrowTrace,
            completed.Attributes, "ct", seconds);
        Assert.Equal(3.125f, saved.FlightDuration!.Value, 3);
        Assert.True(saved.IsJumpthrow);
        Assert.True(saved.IsCrouch);
        Assert.True(saved.IsStepping);
        Assert.False(saved.IsWalking);
        Assert.False(saved.IsRunning);
        Assert.Equal("both", saved.ClickType);
        Assert.Equal(ThrowTechnique.Summarize(samples), saved.ThrowTechnique);
        Assert.Equal(saved.ThrowTechnique, saved.Description);
    }

    [Fact]
    public void MeasuresReleaseToEffectAndKeepsConcurrentProjectilesSeparate()
    {
        var tracker = new GrenadeFlightTracker();
        tracker.Thrown(1, 7655, NadeKind.Smoke, 10);
        tracker.Projectile(100, 1, 7655, NadeKind.Smoke, 10.01f);
        tracker.Thrown(1, 7655, NadeKind.Smoke, 11);
        tracker.Projectile(101, 1, 7655, NadeKind.Smoke, 11.01f);
        Assert.Equal(3.5f, tracker.Complete(101, 1, 7655, NadeKind.Smoke, 14.5f));
        Assert.Equal(5f, tracker.Complete(100, 1, 7655, NadeKind.Smoke, 15));
        Assert.Null(tracker.Complete(100, 1, 7655, NadeKind.Smoke, 16));
    }

    [Fact]
    public void SupportsSpawnBeforeThrowAndFireEventsWithoutAnEntityId()
    {
        var tracker = new GrenadeFlightTracker();
        tracker.Projectile(100, 1, 7655, NadeKind.Flash, 10);
        tracker.Thrown(1, 7655, NadeKind.Flash, 10.01f);
        Assert.Equal(1.5f, tracker.Complete(100, 1, 7655, NadeKind.Flash, 11.51f)!.Value, 3);
        tracker.Thrown(1, 7655, NadeKind.Fire, 20);
        Assert.Equal(2f, tracker.Complete(null, 1, 7655, NadeKind.Fire, 22));
    }

    [Fact]
    public void DoesNotAttributeRethrowsExpiredFlightsOrReusedSlotsToAnotherPlayer()
    {
        var tracker = new GrenadeFlightTracker();
        tracker.Projectile(100, 1, 7655, NadeKind.Smoke, 10);
        Assert.Null(tracker.Complete(100, 1, 7655, NadeKind.Smoke, 14));
        tracker.Thrown(1, 7655, NadeKind.Smoke, 20);
        tracker.Projectile(101, 1, 7655, NadeKind.Smoke, 20.01f);
        Assert.Null(tracker.Complete(101, 1, 7666, NadeKind.Smoke, 22));
        Assert.Null(tracker.Complete(101, 1, 7655, NadeKind.Smoke, 201));
        tracker.Thrown(1, 7655, NadeKind.Fire, 202);
        tracker.Thrown(1, 7655, NadeKind.Fire, 203);
        Assert.Null(tracker.Complete(null, 1, 7655, NadeKind.Fire, 204));
        tracker.Clear();
        Assert.Null(tracker.Complete(null, 1, 7655, NadeKind.Fire, 205));
    }
}

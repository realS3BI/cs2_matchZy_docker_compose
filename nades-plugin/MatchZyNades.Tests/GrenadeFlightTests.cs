using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class GrenadeFlightTests
{
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

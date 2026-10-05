using Playbook;
using Xunit;

namespace Playbook.Tests;

public sealed class FireEffectOriginsTests
{
    [Fact]
    public void SeparatesRealAndSyntheticEffectsAndPlayers()
    {
        var origins = new FireEffectOrigins();
        origins.Begin(1, 10);
        origins.Begin(2, 10, 42);
        Assert.Equal(new FireEffectRoute(FireEffectOrigin.Synthetic, 42), origins.Complete(2, 11));
        Assert.Equal(new FireEffectRoute(FireEffectOrigin.Real), origins.Complete(1, 11));
        Assert.Equal(FireEffectOrigin.Unknown, origins.Complete(2, 12).Origin);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void OverlappingRealAndSyntheticEffectsCannotCompleteARealCapture(bool syntheticFirst)
    {
        var origins = new FireEffectOrigins();
        origins.Begin(1, 10, syntheticFirst ? 42 : null);
        origins.Begin(1, 10.1f, syntheticFirst ? null : 42);
        Assert.Equal(FireEffectOrigin.Ambiguous, origins.Complete(1, 11).Origin);
        // The second event is still ambiguous: the first event had no projectile id.
        Assert.Equal(FireEffectOrigin.Ambiguous, origins.Complete(1, 11.1f).Origin);
        origins.Begin(1, 12);
        Assert.Equal(FireEffectOrigin.Real, origins.Complete(1, 13).Origin);
    }

    [Fact]
    public void MultipleRethrowsDoNotInventAnAttemptAssociation()
    {
        var origins = new FireEffectOrigins();
        origins.Begin(1, 10, 42);
        origins.Begin(1, 10.1f, 43);
        Assert.Equal(new FireEffectRoute(FireEffectOrigin.Synthetic), origins.Complete(1, 11));
        Assert.Equal(new FireEffectRoute(FireEffectOrigin.Synthetic), origins.Complete(1, 11.1f));
    }

    [Fact]
    public void ExpiredDisconnectedAndPreviousMapFlightsAreNotReused()
    {
        var origins = new FireEffectOrigins();
        origins.Begin(1, 10, 42);
        Assert.Equal(FireEffectOrigin.Unknown, origins.Complete(1, 41).Origin);
        origins.Begin(1, 42);
        origins.Forget(1);
        Assert.Equal(FireEffectOrigin.Unknown, origins.Complete(1, 43).Origin);
        origins.Begin(1, 50, 43);
        Assert.Equal(FireEffectOrigin.Unknown, origins.Complete(1, 1).Origin);
        origins.Begin(1, 2);
        origins.Clear();
        Assert.Equal(FireEffectOrigin.Unknown, origins.Complete(1, 3).Origin);
    }

    [Fact]
    public void TwoRealThrowsRemainAmbiguousForBothDetonations()
    {
        var origins = new FireEffectOrigins();
        origins.Begin(1, 10);
        origins.Begin(1, 10.1f);
        Assert.Equal(FireEffectOrigin.Ambiguous, origins.Complete(1, 11).Origin);
        Assert.Equal(FireEffectOrigin.Ambiguous, origins.Complete(1, 11.1f).Origin);
    }
}

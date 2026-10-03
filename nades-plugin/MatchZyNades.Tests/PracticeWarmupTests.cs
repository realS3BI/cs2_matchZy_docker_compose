using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class PracticeWarmupTests
{
    [Fact]
    public void JoinAndMaintenanceDoNotRescheduleAPendingWarmupEnd()
    {
        var warmup = new PracticeWarmup();
        var requests = 0;
        for (var i = 0; i < 10; i++) warmup.Update(true, () => requests++);
        Assert.Equal(1, requests);
    }

    [Fact]
    public void WarmupStartedByALateConfigIsEndedAgainAfterTheFirstTransition()
    {
        var warmup = new PracticeWarmup();
        var requests = 0;
        warmup.Update(false, () => requests++);
        Assert.Equal(0, requests);
        warmup.Update(true, () => requests++);
        warmup.Update(false, () => requests++);
        warmup.Update(true, () => requests++);
        Assert.Equal(2, requests);
    }

    [Fact]
    public void MapChangeAllowsEndingWarmupEvenIfThePreviousMapNeverFinished()
    {
        var warmup = new PracticeWarmup();
        var requests = 0;
        warmup.Update(true, () => requests++);
        warmup.Reset();
        warmup.Update(true, () => requests++);
        Assert.Equal(2, requests);
    }
}

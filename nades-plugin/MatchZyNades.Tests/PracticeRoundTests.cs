using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class PracticeRoundTests
{
    [Fact]
    public void FirstSpawnExpiresCachedFreezeAndKeepsALiveHourOnTheClock()
    {
        var freezeTime = 0;
        var roundTime = 0;
        var startTime = 125f;
        Assert.True(PracticeRound.FinishFreeze(false, true, false, 100f, ref freezeTime, ref roundTime, ref startTime));
        Assert.Equal(0, freezeTime);
        Assert.Equal(3600, roundTime);
        Assert.True(startTime < 100f);
        Assert.False(PracticeRound.FinishFreeze(false, true, false, 101f, ref freezeTime, ref roundTime, ref startTime));
        Assert.Equal(99f, startTime);
    }

    [Fact]
    public void LateJoinDoesNotChangeTheClockOfARunningOrExpiredRound()
    {
        var freezeTime = 0;
        var roundTime = 3600;
        var startTime = 100f;
        Assert.False(PracticeRound.FinishFreeze(false, false, false, 5000f, ref freezeTime, ref roundTime, ref startTime));
        Assert.Equal(3600, roundTime);
        Assert.Equal(100f, startTime);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void WarmupAndPendingRestartsKeepControlOfTheirTimers(bool warmup, bool restartPending)
    {
        var freezeTime = 15;
        var roundTime = 120;
        var startTime = 125f;
        Assert.False(PracticeRound.FinishFreeze(warmup, true, restartPending, 100f, ref freezeTime, ref roundTime, ref startTime));
        Assert.Equal(15, freezeTime);
        Assert.Equal(120, roundTime);
        Assert.Equal(125f, startTime);
    }
}

using Xunit;

namespace MatchZyCoach.Tests;

public sealed class CoachAnalyzerTests
{
    [Fact]
    public void MechanicsReportCallsOutMovingShotsAndLongBursts()
    {
        var session = Session(CoachFocus.Mechanics);
        session.Shots = 100;
        session.ShotsHit = 30;
        session.ShotsWhileMoving = 31;
        session.BurstCount = 10;
        session.BurstShots = 75;
        session.LongBursts = 4;

        var report = CoachAnalyzer.Complete(session, session.StartedAt.AddMinutes(20), "player_finished");

        Assert.Equal(0.31, report.MovingShotRate, 3);
        Assert.Equal("movement", report.Feedback[0].Code);
        Assert.Contains(report.Feedback, item => item.Code == "burst");
    }

    [Fact]
    public void UtilityReportDoesNotReplaceUtilityAdviceWithAimAdvice()
    {
        var session = Session(CoachFocus.Utility);
        session.Shots = 100;
        session.ShotsWhileMoving = 100;
        session.GrenadesThrown = 2;
        session.TeammatesFlashed = 1;
        session.TeamFlashSeconds = 2.5f;

        var report = CoachAnalyzer.Complete(session, session.StartedAt.AddMinutes(20), "player_finished");

        Assert.Equal(["utility-volume", "team-flash"], report.Feedback.Select(item => item.Code));
    }

    [Fact]
    public void HeadshotRateUsesFirearmKillsOnly()
    {
        var session = Session(CoachFocus.Match);
        session.Kills = 10;
        session.FirearmKills = 5;
        session.Headshots = 4;

        var report = CoachAnalyzer.Complete(session, session.StartedAt.AddMinutes(20), "player_finished");

        Assert.Equal(0.8, report.HeadshotRate, 3);
    }

    [Fact]
    public void SmallSamplesProduceABaselineInsteadOfGuessing()
    {
        var session = Session(CoachFocus.Mechanics);
        session.Shots = 5;
        session.ShotsWhileMoving = 5;

        var report = CoachAnalyzer.Complete(session, session.StartedAt.AddMinutes(2), "player_finished");

        Assert.Single(report.Feedback);
        Assert.Equal("baseline", report.Feedback[0].Code);
    }

    private static CoachSession Session(CoachFocus focus) => new()
    {
        Id = "0123456789abcdef0123456789abcdef",
        SteamId = 76561198000000001,
        PlayerName = "Player",
        Focus = focus,
        Map = "de_mirage",
        StartedAt = new DateTimeOffset(2026, 9, 6, 10, 0, 0, TimeSpan.Zero)
    };
}

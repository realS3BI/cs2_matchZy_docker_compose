using Playbook;
using Xunit;

namespace Playbook.Tests;

public sealed class TrainingBotClaimTests
{
    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    public void PlacesExactlyTheLivingBotOnTheRequestedTeam(int team)
    {
        TrainingBotClaim.Candidate[] bots = [new(10, team == 2 ? 3 : 2, true),
            new(11, team, false), new(12, team, true), new(13, team, true)];
        Assert.Equal((uint)12, TrainingBotClaim.Select(bots, team));
    }

    [Fact]
    public void WaitsForTheRequestedBotToSpawn()
    {
        TrainingBotClaim.Candidate[] bots = [new(10, 3, true), new(11, 2, false)];
        Assert.Null(TrainingBotClaim.Select(bots, 2));
        Assert.Equal((uint)11, TrainingBotClaim.Select([bots[0], bots[1] with { Alive = true }], 2));
        Assert.Null(TrainingBotClaim.Select([], 2));
    }

    [Fact]
    public void TrainingDisablesTeamBalancingAndHumanDependentBotQuota()
    {
        Assert.Equal("0", PlaybookCommands.PracticeSettings["mp_autoteambalance"]);
        Assert.Equal("0", PlaybookCommands.PracticeSettings["mp_limitteams"]);
        Assert.Equal("normal", PlaybookCommands.PracticeSettings["bot_quota_mode"]);
        Assert.Equal("0", PlaybookCommands.PracticeSettings["bot_join_after_player"]);
    }
}

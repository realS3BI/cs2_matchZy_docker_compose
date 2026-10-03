using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class ReviewAndVoteTests
{
    [Theory]
    [InlineData(1, 1)] [InlineData(2, 2)] [InlineData(3, 2)] [InlineData(4, 3)] [InlineData(10, 6)]
    public void VoteNeedsMoreThanHalfOfAllEligiblePlayers(int players, int required)
    {
        var vote = new MajorityVote(Enumerable.Range(1, players).Select(i => (ulong)i));
        Assert.Equal(required, vote.Required);
        for (ulong i = 1; i < (ulong)required; i++) { Assert.True(vote.Cast(i, true)); Assert.False(vote.Passed); }
        Assert.True(vote.Cast((ulong)required, true));
        Assert.True(vote.Passed);
        Assert.False(vote.Cast((ulong)required, false));
        Assert.False(vote.Cast(999, true));
    }

    [Fact]
    public void NoVotesAndAbstentionsDoNotLowerThreshold()
    {
        var vote = new MajorityVote([1, 2, 3, 4, 4, 0]);
        vote.Cast(1, true); vote.Cast(2, true); vote.Cast(3, false);
        Assert.Equal(3, vote.Required); Assert.Equal(1, vote.No); Assert.False(vote.Passed);
    }

    public sealed class PracticeFixture { public bool isPractice; public bool matchStarted; }
    [Fact]
    public void GateRequiresActualPracticeAndNoRunningMatch()
    {
        Assert.False(MatchZyState.IsPractice(null));
        Assert.False(MatchZyState.IsPractice(new object()));
        Assert.False(MatchZyState.IsPractice(new PracticeFixture()));
        Assert.True(MatchZyState.IsPractice(new PracticeFixture { isPractice = true }));
        Assert.False(MatchZyState.IsPractice(new PracticeFixture { isPractice = true, matchStarted = true }));
    }

    [Fact]
    public void OnlyOwnerOfNonOfficialRecordingSeesMutationActions()
    {
        var lineup = new NadeLineup("76561198000000001", "window", "de_mirage", NadeKind.Smoke, "Jumpthrow", new(1, 2, 3), new(0, 90, 0));
        MenuPage Details(string actor, NadeLineup entry) {
            var menu = TrainingMenu.Create([entry], "de_mirage", true, null, steamId: actor);
            menu.Select(1); menu.Select(1); menu.Select(4); menu.Select(1); return menu.Current;
        }
        Assert.Contains(Details(lineup.Owner, lineup).Items, i => i.Page?.Key.StartsWith("edit:") == true);
        Assert.Contains(Details(lineup.Owner, lineup).Items, i => i.Request?.Action == TrainingAction.RequestReview);
        var foreign = Details("76561198000000002", lineup);
        Assert.Equal(5, foreign.Items.Count);
        Assert.Contains(foreign.Items, i => i.Page?.Key.StartsWith("review:") == true);
        Assert.DoesNotContain(foreign.Items, i => i.Request?.Action is TrainingAction.EditName or TrainingAction.DeleteLineup or TrainingAction.RequestReview);
        Assert.Equal(4, Details(lineup.Owner, lineup with { Official = true }).Items.Count);
        var pending = Details(lineup.Owner, lineup with { ReviewStatus = "pending" });
        Assert.False(pending.Items.Single(i => i.Request?.Action == TrainingAction.RequestReview).Enabled);
        var deletion = Details(lineup.Owner, lineup).Items.Single(i => i.Page?.Key.StartsWith("delete:") == true).Page!;
        Assert.Equal(TrainingAction.Back, deletion.Items[0].Request!.Action);
        Assert.Equal(TrainingAction.DeleteLineup, deletion.Items[1].Request!.Action);
    }
}

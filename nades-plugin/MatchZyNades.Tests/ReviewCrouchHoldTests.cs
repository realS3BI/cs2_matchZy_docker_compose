using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class ReviewCrouchHoldTests
{
    [Fact]
    public void KeepsThePoseFromTheClickThroughLineupReloadAndCountdown()
    {
        var state = new CrouchState { IsCrouching = true };
        using var hold = new ReviewCrouchHold(state);
        // Loading the lineup or suppressing input can clear the current pose.
        state.IsCrouching = false;
        hold.Maintain();
        Assert.True(state.IsCrouching);
        Assert.True(state.DuckOverride);
        state.IsCrouching = false;
        hold.Maintain();
        Assert.True(state.IsCrouching);
        Assert.Equal(2, state.HoldCount);
        hold.Dispose();
        Assert.False(state.DuckOverride);
        Assert.True(state.IsCrouching); // Release control without forcing -duck.
        hold.Maintain();
        Assert.Equal(2, state.HoldCount);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void RestoresThePreviousOverrideOnFailureOrCompletion(bool previousOverride)
    {
        var state = new CrouchState { IsCrouching = true, DuckOverride = previousOverride };
        var hold = new ReviewCrouchHold(state);
        try {
            hold.Maintain();
            throw new InvalidOperationException("Upload failed");
        } catch (InvalidOperationException) {
            hold.Dispose();
        }
        Assert.Equal(previousOverride, state.DuckOverride);
        state.DuckOverride = !previousOverride;
        hold.Dispose();
        Assert.Equal(!previousOverride, state.DuckOverride);
    }

    [Fact]
    public void DoesNotTurnAStandingPhotoIntoACrouchingPhoto()
    {
        var state = new CrouchState();
        using var hold = new ReviewCrouchHold(state);
        hold.Maintain();
        Assert.False(state.IsCrouching);
        Assert.False(state.DuckOverride);
        Assert.Equal(0, state.HoldCount);
    }

    [Fact]
    public void DoesNotWriteToAnInvalidOrReplacedPawn()
    {
        var state = new CrouchState { IsCrouching = true };
        var hold = new ReviewCrouchHold(state);
        hold.Maintain();
        state.IsValid = false;
        hold.Maintain();
        hold.Dispose();
        Assert.Equal(1, state.HoldCount);
        Assert.True(state.DuckOverride);
    }

    private sealed class CrouchState : IReviewCrouchState
    {
        public bool IsValid { get; set; } = true;
        public bool IsCrouching { get; set; }
        public bool DuckOverride { get; set; }
        public int HoldCount { get; private set; }
        public void HoldCrouch() { IsCrouching = true; HoldCount++; }
    }
}

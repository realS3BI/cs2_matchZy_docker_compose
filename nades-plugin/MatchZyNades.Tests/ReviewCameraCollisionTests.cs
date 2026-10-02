using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class ReviewCameraCollisionTests
{
    [Fact]
    public void UnobstructedCameraKeepsThePreferredView()
    {
        var origin = new Coordinates(10, 20, 30);
        var pose = ReviewPhotoFraming.FindFront(origin, 35, false, (_, _) => new(1));
        Assert.Equal(ReviewPhotoFraming.Front(origin, 35, false), pose);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void WallBehindTheLineupSelectsOpenSpaceAndTheModelStillFacesTheLens(bool crouched)
    {
        var origin = new Coordinates(0, 0, 0);
        // Wall at x = -40. Include the camera hull, not just its centre.
        var wall = -40 + ReviewPhotoFraming.CameraHullRadius;
        var pose = ReviewPhotoFraming.FindFront(origin, 0, crouched, (start, end) =>
            new(end.X < wall ? (wall - start.X) / (end.X - start.X) : 1));
        Assert.NotNull(pose);
        Assert.True(pose.Value.Position.X >= wall);
        Assert.True(Distance(origin, pose.Value.Position) >= ReviewPhotoFraming.MinimumCameraDistance);
        AssertFacesCamera(origin, pose.Value);
    }

    [Fact]
    public void CameraStopsBeforeTheFirstObstructionWhenEveryDirectionIsShorter()
    {
        var origin = new Coordinates(0, 0, 0);
        var pose = ReviewPhotoFraming.FindFront(origin, 0, false, (_, _) => new(.85f));
        Assert.NotNull(pose);
        var distance = Distance(origin, pose.Value.Position);
        Assert.InRange(distance, ReviewPhotoFraming.MinimumCameraDistance, 101f);
        AssertFacesCamera(origin, pose.Value);
    }

    [Theory]
    [InlineData(.1f, false)]
    [InlineData(1f, true)]
    [InlineData(float.NaN, false)]
    [InlineData(float.PositiveInfinity, false)]
    [InlineData(-1f, false)]
    [InlineData(2f, false)]
    public void EnclosedOrInvalidTracesNeverProduceACamera(float fraction, bool solid)
    {
        Assert.Null(ReviewPhotoFraming.FindFront(new(0, 0, 0), 0, false, (_, _) => new(fraction, solid)));
    }

    private static float Distance(Coordinates a, Coordinates b) => MathF.Sqrt(MathF.Pow(a.X - b.X, 2) + MathF.Pow(a.Y - b.Y, 2));
    private static void AssertFacesCamera(Coordinates origin, ReviewFrontPose pose)
    {
        var dx = pose.Position.X - origin.X;
        var dy = pose.Position.Y - origin.Y;
        var angle = pose.ModelAngles.Y * MathF.PI / 180f;
        Assert.True(dx * MathF.Cos(angle) + dy * MathF.Sin(angle) > Distance(origin, pose.Position) - .1f);
        var cameraAngle = pose.Angles.Y * MathF.PI / 180f;
        Assert.True(-dx * MathF.Cos(cameraAngle) - dy * MathF.Sin(cameraAngle) > Distance(origin, pose.Position) - .1f);
    }
}

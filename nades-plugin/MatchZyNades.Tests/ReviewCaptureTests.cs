using System.Text.Json;
using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class ReviewCaptureTests
{
    private const string Actor = "76561198000000001";
    private static NadeLineup Lineup => new("default", "window", "de_anubis", NadeKind.Smoke, "", new(1, 2, 3), new(4, 5, 6));
    [Theory]
    [InlineData("photo", "front", true)]
    [InlineData("photo", "video", false)]
    [InlineData("video-start", "video", true)]
    [InlineData("video-stop", "video", true)]
    [InlineData("video-stop", "aim", false)]
    [InlineData("quit", "video", false)]
    public void BrowserRequestsAcceptOnlySupportedPhotoAndVideoActions(string action, string slot, bool valid)
    {
        Assert.Equal(valid, ReviewCaptureFiles.ValidRequest(new(new string('a', 32), "session", slot, 1000, action)));
        Assert.False(ReviewCaptureFiles.ValidRequest(new("../escape", "session", slot, 1000, action)));
        Assert.Equal("photo", new ReviewPhotoRequest(new string('a', 32), "session", "aim", 1000).Action);
    }
    [Theory]
    [InlineData("aim")]
    [InlineData("position")]
    [InlineData("effect")]
    public void FirstPersonPhotosKeepTheGameCrosshair(string slot)
    {
        Assert.Equal(0u, ReviewPhotoFraming.HiddenHud(slot) & (4u | 16u | 256u));
        Assert.NotEqual(0u, ReviewPhotoFraming.HiddenHud("front") & 256u);
    }
    [Theory]
    [InlineData(0, 130, 20, -180)]
    [InlineData(90, 10, 140, -90)]
    [InlineData(180, -110, 20, 0)]
    [InlineData(-90, 10, -100, 90)]
    public void FrontCameraUsesTheSameDistanceHeightAndLooksBackAtThePlayer(float yaw, float x, float y, float viewYaw)
    {
        var pose = ReviewPhotoFraming.Front(new(10, 20, 30), yaw, false);
        Assert.Equal(x, pose.Position.X, 3); Assert.Equal(y, pose.Position.Y, 3);
        Assert.Equal(78, pose.Position.Z); Assert.Equal(new Coordinates(0, viewYaw, 0), pose.Angles);
        var crouched = ReviewPhotoFraming.Front(new(10, 20, 30), yaw, true);
        Assert.Equal(62, crouched.Position.Z);
        Assert.Equal(pose.Position.X, crouched.Position.X);
        Assert.Equal(pose.Angles, crouched.Angles);
    }
    [Fact]
    public void SignalsRequireTheExactActiveBrowserSessionAndRejectPendingOrExpiredWork()
    {
        var directory = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        var folder = Path.Combine(directory, Actor);
        Directory.CreateDirectory(folder);
        try {
            var session = new ReviewSession(Guid.NewGuid().ToString(), Actor, "default", "de_anubis", "window", 100_000);
            void SaveSession(ReviewSession value) => File.WriteAllText(Path.Combine(folder, "session.json"), JsonSerializer.Serialize(value, ReviewCaptureFiles.Json));
            Assert.Throws<InvalidOperationException>(() => ReviewCaptureFiles.Issue(directory, Actor, Lineup, "photo", "aim", 1000));
            SaveSession(session);
            var command = ReviewCaptureFiles.Issue(directory, Actor, Lineup, "photo", "aim", 1000, "a".PadLeft(32, 'a'), "review-v2");
            Assert.Equal(4000, command.NotBefore);
            Assert.Equal(new string('a', 32), command.Id);
            Assert.Equal("review-v2", command.Presentation);
            Assert.Equal(session.Id, command.SessionId);
            Assert.Throws<InvalidOperationException>(() => ReviewCaptureFiles.Issue(directory, Actor, Lineup, "photo", "effect", 2000));
            File.WriteAllText(Path.Combine(folder, "result.json"), JsonSerializer.Serialize(new ReviewResult(session.Id, command.Id, true, "Gespeichert"), ReviewCaptureFiles.Json));
            Assert.Equal("video-start", ReviewCaptureFiles.Issue(directory, Actor, Lineup, "video-start", "", 3000).Action);
            Assert.Throws<InvalidOperationException>(() => ReviewCaptureFiles.Issue(directory, Actor, Lineup with { Name = "other" }, "photo", "aim", 40_000));
            Assert.Throws<InvalidOperationException>(() => ReviewCaptureFiles.Issue(directory, Actor, Lineup with { Official = true }, "photo", "aim", 40_000));
            SaveSession(session with { ExpiresAt = 4000 });
            Assert.Throws<InvalidOperationException>(() => ReviewCaptureFiles.Issue(directory, Actor, Lineup, "photo", "aim", 4000));
            Assert.Throws<InvalidOperationException>(() => ReviewCaptureFiles.Issue(directory, "../escape", Lineup, "photo", "aim", 1000));
        } finally { Directory.Delete(directory, true); }
    }
    [Fact]
    public void ReviewHasSixStepsAndApprovalRequiresAllFiveUploads()
    {
        var menu = ReviewMenu.Create(Lineup);
        Assert.Equal(6, menu.Items.Count);
        Assert.False(menu.Items[5].Page!.Items[0].Enabled);
        var complete = ReviewMenu.Create(Lineup with { ReviewMediaSlots = ReviewCaptureFiles.Slots });
        Assert.True(complete.Items[5].Page!.Items[0].Enabled);
        var playerMenu = TrainingMenu.Create([Lineup], "de_anubis", true, null, canWriteNades: false);
        playerMenu.Select(1);
        Assert.DoesNotContain(playerMenu.Current.Items, item => item.Page?.Key == "reviews");
        playerMenu.Select(1); playerMenu.Select(4); playerMenu.Select(1);
        Assert.DoesNotContain(playerMenu.Current.Items, item => item.Page?.Key.StartsWith("review:") == true);
        Assert.Equal(9, InGameMenu.PageSize);
    }
}

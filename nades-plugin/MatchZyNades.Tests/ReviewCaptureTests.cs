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
    public void FirstPersonPhotosKeepTheGameCrosshair(string slot)
    {
        Assert.Equal(0u, ReviewPhotoFraming.HiddenHud(slot) & (4u | 16u | 256u));
        Assert.NotEqual(0u, ReviewPhotoFraming.HiddenHud("front") & 256u);
    }
    [Theory]
    [InlineData("front")]
    [InlineData("effect")]
    public void FrontAndEffectPhotosHideTheGameCrosshair(string slot)
    {
        Assert.NotEqual(0u, ReviewPhotoFraming.HiddenHud(slot) & 256u);
    }
    [Theory]
    [InlineData(-44.8f, 44.8f)]
    [InlineData(29.6f, -29.6f)]
    [InlineData(0, 0)]
    [InlineData(-89, 89)]
    [InlineData(89, -89)]
    public void FrontCameraCancelsPlayerPitchWithoutChangingThePlayer(float pitch, float expected)
    {
        Assert.Equal(expected, ReviewPhotoFraming.CameraPitch(pitch));
        Assert.Equal(0, pitch + ReviewPhotoFraming.CameraPitch(pitch));
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
            Assert.Equal(2000, command.NotBefore);
            Assert.Equal(new string('a', 32), command.Id);
            Assert.Equal("review-v2", command.Presentation);
            Assert.Equal(session.Id, command.SessionId);
            Assert.Throws<InvalidOperationException>(() => ReviewCaptureFiles.Issue(directory, Actor, Lineup, "photo", "effect", 2000));
            File.WriteAllText(Path.Combine(folder, "result.json"), JsonSerializer.Serialize(new ReviewResult(session.Id, command.Id, true, "Gespeichert"), ReviewCaptureFiles.Json));
            var video = ReviewCaptureFiles.Issue(directory, Actor, Lineup, "video-start", "", 3000);
            Assert.Equal("video-start", video.Action);
            Assert.Equal(4000, video.NotBefore);
            Assert.Throws<InvalidOperationException>(() => ReviewCaptureFiles.Issue(directory, Actor, Lineup with { Name = "other" }, "photo", "aim", 40_000));
            Assert.Throws<InvalidOperationException>(() => ReviewCaptureFiles.Issue(directory, Actor, Lineup with { Official = true }, "photo", "aim", 40_000));
            SaveSession(session with { ExpiresAt = 4000 });
            Assert.Throws<InvalidOperationException>(() => ReviewCaptureFiles.Issue(directory, Actor, Lineup, "photo", "aim", 4000));
            Assert.Throws<InvalidOperationException>(() => ReviewCaptureFiles.Issue(directory, "../escape", Lineup, "photo", "aim", 1000));
        } finally { Directory.Delete(directory, true); }
    }
    [Fact]
    public void FollowingThePanelKeepsOneSessionAndPinsEachCommandToItsLineup()
    {
        var directory = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        var folder = Path.Combine(directory, Actor);
        Directory.CreateDirectory(folder);
        try {
            var session = new ReviewSession(Guid.NewGuid().ToString(), Actor, "", "", "", 100_000, FollowPanel: true);
            File.WriteAllText(Path.Combine(folder, "session.json"), JsonSerializer.Serialize(session, ReviewCaptureFiles.Json));
            var first = ReviewCaptureFiles.Issue(directory, Actor, Lineup, "photo", "front", 1000);
            Assert.Equal((Lineup.Owner, Lineup.Map, Lineup.Name), (first.Owner, first.Map, first.Name));
            File.WriteAllText(Path.Combine(folder, "result.json"), JsonSerializer.Serialize(new ReviewResult(session.Id, first.Id, true, "Gespeichert"), ReviewCaptureFiles.Json));
            var other = Lineup with { Owner = Actor, Name = "other" };
            var second = ReviewCaptureFiles.Issue(directory, Actor, other, "photo", "effect", 2000);
            Assert.Equal(session.Id, second.SessionId);
            Assert.Equal((other.Owner, other.Map, other.Name), (second.Owner, second.Map, second.Name));
            Assert.Throws<InvalidOperationException>(() => ReviewCaptureFiles.Issue(directory, Actor, other with { Official = true }, "photo", "aim", 3000));
        } finally { Directory.Delete(directory, true); }
    }
    [Fact]
    public void EnteringEffectRequestsTeleportAndKeepsThePhotoAtTheChosenView()
    {
        var lineup = Lineup with { LandingPosition = new(100, 200, 300) };
        var menu = new InGameMenu(ReviewMenu.Create(lineup), lineup.Map);
        var request = menu.Select(4);
        Assert.Equal(TrainingAction.ReviewTeleportEffect, request!.Action);
        Assert.Equal(lineup, request.Lineup);
        Assert.Equal("effect", menu.Current.ReviewStep);
        Assert.Equal(lineup, menu.Current.ReviewLineup);
        var photo = menu.Select(1);
        Assert.Equal(TrainingAction.ReviewPhoto, photo!.Action);
        Assert.Equal("effect", photo.Setting);
        var teleport = menu.Current.Items.ToList().FindIndex(item => item.Request?.Action == TrainingAction.ReviewTeleportEffect);
        Assert.Equal(request, menu.Select(teleport + 1));
        menu.Refresh(ReviewMenu.Create(lineup with { DisplayName = "Neuer Titel" }));
        Assert.Equal("effect", menu.Current.ReviewStep);
        Assert.True(menu.Back());
        Assert.Equal("overview", menu.Current.ReviewStep);
        Assert.Equal(3, menu.Index);
    }
    [Fact]
    public void EffectRemainsReachableWithoutAPreviouslySavedTarget()
    {
        var menu = new InGameMenu(ReviewMenu.Create(Lineup), Lineup.Map);
        Assert.Equal(TrainingAction.ReviewTeleportEffect, menu.Select(4)!.Action);
        Assert.Equal("effect", menu.Current.ReviewStep);
        Assert.Contains(menu.Current.Items, item => item.Request?.Action == TrainingAction.LoadLineup);
        Assert.Contains(menu.Current.Items, item => item.Request?.Action == TrainingAction.ReviewTeleportEffect && item.Enabled);
        Assert.Contains(menu.Current.Items, item => item.Request?.Action == TrainingAction.ReviewRethrow);
        Assert.Null(ReviewEffectTarget.Resolve(Lineup, null));
    }
    [Fact]
    public void VideoAllowsLoadingTheLineupWithoutAnAimShortcut()
    {
        var menu = new InGameMenu(ReviewMenu.Create(Lineup), Lineup.Map);
        menu.Select(5);
        Assert.Equal("video", menu.Current.ReviewStep);
        Assert.Contains(menu.Current.Items, item => item.Request?.Action == TrainingAction.LoadLineup && item.Request.Lineup == Lineup);
        Assert.DoesNotContain(menu.Current.Items, item => item.Page?.ReviewStep == "aim");
        Assert.Equal(Lineup, menu.Current.ReviewLineup);
    }
    [Fact]
    public void ReviewHasSevenStepsAndApprovalRequiresMediaAndDetails()
    {
        var menu = ReviewMenu.Create(Lineup);
        Assert.Equal(7, menu.Items.Count);
        Assert.False(menu.Items[6].Page!.Items[0].Enabled);
        var complete = ReviewMenu.Create(Lineup with { ReviewMediaSlots = ReviewCaptureFiles.Slots, Description = "Eine Smoke", ThrowFromTitle = "CT", ThrowToTitle = "A" });
        Assert.True(complete.Items[6].Page!.Items[0].Enabled);
        var playerMenu = TrainingMenu.Create([Lineup], "de_anubis", true, null, canWriteNades: false);
        playerMenu.Select(1);
        Assert.DoesNotContain(playerMenu.Current.Items, item => item.Page?.Key == "reviews");
        playerMenu.Select(1); playerMenu.Select(4); playerMenu.Select(1);
        Assert.DoesNotContain(playerMenu.Current.Items, item => item.Page?.Key.StartsWith("review:") == true);
        Assert.Equal(9, InGameMenu.PageSize);
    }

    [Fact]
    public void HomeReviewsShowOnlyPendingCurrentMapEntriesAndRespectPermissions()
    {
        var pending = Lineup with { ReviewStatus = "pending" };
        var library = new[] { pending, pending with { Name = "official", Official = true }, pending with { Name = "other", Map = "de_mirage" }, Lineup with { Name = "draft" } };
        var home = TrainingMenu.Create(library, Lineup.Map, true, null).Current;
        var reviews = Assert.Single(home.Items, item => item.Page?.Key == "home-reviews");
        Assert.Single(reviews.Page!.Items);
        Assert.DoesNotContain(TrainingMenu.Create(library, Lineup.Map, true, null, canWriteNades: false).Current.Items, item => item.Page?.Key == "home-reviews");
        Assert.False(TrainingMenu.Create(library, Lineup.Map, false, null).Current.Items.Single(item => item.Page?.Key == "home-reviews").Enabled);
    }

    [Fact]
    public void RequiredDetailsRemainBlockedUntilAllDescriptionsExist()
    {
        var media = Lineup with { ReviewMediaSlots = ReviewCaptureFiles.Slots };
        Assert.False(ReviewMenu.Create(media).Items[6].Page!.Items[0].Enabled);
        Assert.Equal(new[] { "Beschreibung", "Startposition", "Endposition" }, ReviewMenu.MissingDetails(media));
        var complete = media with { Description = "Smoke", ThrowFromTitle = "CT", ThrowToTitle = "A" };
        Assert.True(ReviewMenu.Create(complete).Items[6].Page!.Items[0].Enabled);
        Assert.All(ReviewMenu.Create(complete).Items[5].Page!.Items, item => Assert.False(item.Enabled));
        Assert.All(ReviewMenu.Create(complete, true).Items[5].Page!.Items, item => Assert.True(item.Enabled));
    }
}

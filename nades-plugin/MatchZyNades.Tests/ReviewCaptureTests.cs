using System.Text.Json;
using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class ReviewCaptureTests
{
    private const string Actor = "76561198000000001";
    private static NadeLineup Lineup => new("default", "window", "de_anubis", NadeKind.Smoke, "", new(1, 2, 3), new(4, 5, 6));
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
            var command = ReviewCaptureFiles.Issue(directory, Actor, Lineup, "photo", "aim", 1000);
            Assert.Equal(4000, command.NotBefore);
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

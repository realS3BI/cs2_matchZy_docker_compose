using Playbook;
using Xunit;

namespace Playbook.Tests;

public sealed class LineupResultsTests
{
    [Fact]
    public void CommittedReceiptCanDeliverOnceWithoutDeletingItsReplayProtection()
    {
        var root = Path.Combine(Path.GetTempPath(), "lineup-result-" + Guid.NewGuid());
        Directory.CreateDirectory(Path.Combine(root, "processed"));
        var receipt = Path.Combine(root, "processed", "request.json");
        try
        {
            File.WriteAllText(receipt, "{\"message\":\"OK\"}");
            var pending = new Dictionary<string, ulong> { ["request"] = 123 };
            var count = 0;
            LineupResults.Read(pending, Path.Combine(root, "results"), (_, _) => count++);
            LineupResults.Read(pending, Path.Combine(root, "results"), (_, _) => count++);
            Assert.Equal(1, count);
            Assert.True(File.Exists(receipt));
        }
        finally { Directory.Delete(root, true); }
    }

    [Fact]
    public void ResultIsReportedOnlyOnceEvenWhenCleanupFails()
    {
        var directory = Path.Combine(Path.GetTempPath(), "lineup-result-" + Guid.NewGuid());
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "request.json");
        try
        {
            File.WriteAllText(path, "{\"message\":\"Änderung übernommen.\"}");
            var pending = new Dictionary<string, ulong> { ["request"] = 123 };
            var deliveries = 0;
            void Notify(ulong steamId, string message)
            {
                Assert.Equal(123UL, steamId);
                Assert.Equal("Änderung übernommen.", message);
                deliveries++;
                File.Delete(path);
                Directory.CreateDirectory(path);
            }
            LineupResults.Read(pending, directory, Notify);
            LineupResults.Read(pending, directory, Notify);
            Assert.Equal(1, deliveries);
            Assert.Empty(pending);
        }
        finally { Directory.Delete(directory, true); }
    }

    [Fact]
    public void IncompleteResultIsRetriedBeforeAnyNotification()
    {
        var directory = Path.Combine(Path.GetTempPath(), "lineup-result-" + Guid.NewGuid());
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "request.json");
        try
        {
            var pending = new Dictionary<string, ulong> { ["request"] = 123 };
            File.WriteAllText(path, "{");
            LineupResults.Read(pending, directory, (_, _) => Assert.Fail("Incomplete result was delivered"));
            Assert.Single(pending);
            File.WriteAllText(path, "{\"message\":\"OK\"}");
            var count = 0;
            LineupResults.Read(pending, directory, (_, _) => count++);
            Assert.Equal(1, count);
            Assert.Empty(pending);
            Assert.False(File.Exists(path));
        }
        finally { Directory.Delete(directory, true); }
    }
}

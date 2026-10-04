using System.Text.Json;
using Playbook;
using Xunit;

namespace Playbook.Tests;

public sealed class NadeRuntimeStatusTests
{
    [Fact]
    public void HeartbeatRecordsLoadPracticeAndUnloadWithoutLeavingTemporaryFiles()
    {
        var directory = Path.Combine(Path.GetTempPath(), "nades-status-" + Guid.NewGuid());
        var path = Path.Combine(directory, "data", "status.json");
        try
        {
            var writer = new NadeRuntimeStatus(path, "1.0.1");
            writer.Write(true, false, "de_mirage");
            using var first = JsonDocument.Parse(File.ReadAllText(path));
            Assert.Equal("loaded", first.RootElement.GetProperty("state").GetString());
            Assert.False(first.RootElement.GetProperty("practice").GetBoolean());
            Assert.Equal("1.0.1", first.RootElement.GetProperty("version").GetString());
            var loadedAt = first.RootElement.GetProperty("loadedAt").GetDateTimeOffset();
            writer.Write(true, true, "de_nuke");
            using var practice = JsonDocument.Parse(File.ReadAllText(path));
            Assert.True(practice.RootElement.GetProperty("practice").GetBoolean());
            Assert.Equal("de_nuke", practice.RootElement.GetProperty("map").GetString());
            Assert.Equal(loadedAt, practice.RootElement.GetProperty("loadedAt").GetDateTimeOffset());
            Assert.True(practice.RootElement.GetProperty("updatedAt").GetDateTimeOffset() >= loadedAt);
            writer.Write(false, true, "de_nuke");
            using var last = JsonDocument.Parse(File.ReadAllText(path));
            Assert.Equal("unloaded", last.RootElement.GetProperty("state").GetString());
            Assert.False(last.RootElement.GetProperty("practice").GetBoolean());
            Assert.False(File.Exists(path + ".tmp"));
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
}

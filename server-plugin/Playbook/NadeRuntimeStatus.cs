using System.Text.Json;

namespace Playbook;

// Written atomically so the panel never reads a partially updated heartbeat.
public sealed class NadeRuntimeStatus(string path, string version)
{
    private readonly DateTimeOffset _loadedAt = DateTimeOffset.UtcNow;

    public void Write(bool loaded, bool practice, string map)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = path + ".tmp";
        try
        {
            File.WriteAllText(temp, JsonSerializer.Serialize(new
            {
                state = loaded ? "loaded" : "unloaded",
                version,
                loadedAt = _loadedAt,
                updatedAt = DateTimeOffset.UtcNow,
                practice = loaded && practice,
                map
            }));
            File.Move(temp, path, overwrite: true);
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
}

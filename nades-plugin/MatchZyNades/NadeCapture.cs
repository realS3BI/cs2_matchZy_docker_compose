using System.Text.Json;

namespace MatchZyNades;

public sealed record NadeCapture(string CaptureId, string Owner, string Name, string Map,
    string LineupPos, string LineupAng, string LandingPos, string CapturedAt,
    string Type = "", string DisplayName = "", string Description = "", string ThrowTechnique = "",
    string ThrowTrace = "", bool NewLineup = false);

// Only this plugin writes captures. MatchZy remains the sole in-game writer of savednades.json.
public static class NadeCaptureFile
{
    private static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true };
    public static string Vector(Coordinates point) => FormattableString.Invariant($"{point.X:0.######} {point.Y:0.######} {point.Z:0.######}");

    public static NadeCapture Create(NadeLineup lineup, Coordinates target) => new(
        Guid.NewGuid().ToString("N"), lineup.Owner, lineup.Name, lineup.Map,
        Vector(lineup.Position), Vector(lineup.Angles), Vector(target), DateTimeOffset.UtcNow.ToString("O"));

    public static NadeCapture CreateNew(string owner, string name, string displayName, string map,
        NadeKind kind, Coordinates start, Coordinates angles, Coordinates target,
        string technique, string trace) => new(Guid.NewGuid().ToString("N"), owner, name, map,
        Vector(start), Vector(angles), Vector(target), DateTimeOffset.UtcNow.ToString("O"),
        kind switch
        {
            NadeKind.Smoke => "Smoke", NadeKind.Flash => "Flash", NadeKind.HE => "HE",
            NadeKind.Fire => "Molly", NadeKind.Decoy => "Decoy", _ => ""
        }, displayName, technique, technique, trace, true);

    public static void Write(string path, NadeCapture capture)
    {
        var entries = File.Exists(path)
            ? JsonSerializer.Deserialize<List<NadeCapture>>(File.ReadAllText(path), Options) ?? [] : [];
        entries.RemoveAll(n => n.Owner == capture.Owner && n.Map == capture.Map && n.Name == capture.Name);
        entries.Add(capture);
        var temp = path + ".tmp";
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        try
        {
            File.WriteAllText(temp, JsonSerializer.Serialize(entries.TakeLast(2000), Options));
            File.Move(temp, path, overwrite: true);
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
}

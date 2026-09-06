using System.Text.Json;

namespace MatchZyCoach;

public sealed class CoachResultWriter(string outboxPath)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public void Write(CoachSessionResult result)
    {
        Directory.CreateDirectory(outboxPath);
        var safeSteamId = new string(result.SteamId.Where(char.IsDigit).ToArray());
        var fileName = $"{result.EndedAt:yyyyMMddTHHmmssfffZ}-{safeSteamId}-{result.Id}.json";
        var destination = Path.Combine(outboxPath, fileName);
        var temporary = destination + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(result, JsonOptions));
        File.Move(temporary, destination, true);
    }
}

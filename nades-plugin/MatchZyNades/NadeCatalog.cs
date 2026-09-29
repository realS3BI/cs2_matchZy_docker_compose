using System.Globalization;
using System.Text.Json;

namespace MatchZyNades;

public enum NadeKind { Smoke, HE, Flash, Fire, Decoy, Other }
public readonly record struct Coordinates(float X, float Y, float Z)
{
    public static bool TryParse(string? text, out Coordinates value)
    {
        value = default;
        var parts = text?.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        if (parts?.Length != 3) return false;
        var numbers = new float[3];
        for (var i = 0; i < 3; i++)
            if (!float.TryParse(parts[i], NumberStyles.Float, CultureInfo.InvariantCulture, out numbers[i]) ||
                !float.IsFinite(numbers[i])) return false;
        value = new(numbers[0], numbers[1], numbers[2]);
        return true;
    }
}

public sealed record NadeLineup(string Owner, string Name, string Map, NadeKind Kind,
    string Description, Coordinates Position, Coordinates Angles, string DisplayName = "", string ThrowTrace = "", bool MustKnow = false)
{
    public string Title => string.IsNullOrWhiteSpace(DisplayName) ? Name : DisplayName;
}

public sealed record NadeReference(string Owner, string Map, string Name)
{
    public static NadeReference From(NadeLineup lineup) => new(lineup.Owner, lineup.Map, lineup.Name);
}

public static class NadeCatalog
{
    // MatchZy's owner -> name -> fields format. Never expose another player's private library.
    public static IReadOnlyList<NadeLineup> Parse(string json, string map, string steamId, string? metadata = null)
    {
        using var document = JsonDocument.Parse(json);
        if (document.RootElement.ValueKind != JsonValueKind.Object)
            throw new JsonException("The saved nade library must be an object.");
        var result = new List<NadeLineup>();
        foreach (var owner in document.RootElement.EnumerateObject())
        {
            if (owner.Name != "default" && owner.Name != steamId) continue;
            if (owner.Value.ValueKind != JsonValueKind.Object) continue;
            foreach (var entry in owner.Value.EnumerateObject())
            {
                var data = entry.Value;
                if (data.ValueKind != JsonValueKind.Object || string.IsNullOrWhiteSpace(entry.Name)) continue;
                var entryMap = Field(data, "Map");
                if (!string.Equals(entryMap, map, StringComparison.OrdinalIgnoreCase) ||
                    !Coordinates.TryParse(Field(data, "LineupPos"), out var position) ||
                    !Coordinates.TryParse(Field(data, "LineupAng"), out var angles)) continue;
                result.Add(new(owner.Name, entry.Name, entryMap, Kind(Field(data, "Type")),
                    Field(data, "Desc"), position, angles, Field(data, "DisplayName"), MustKnow: Flag(data, "MustKnow")));
            }
        }
        if (metadata != null)
        {
            using var titles = JsonDocument.Parse(metadata);
            if (titles.RootElement.ValueKind == JsonValueKind.Array)
                foreach (var title in titles.RootElement.EnumerateArray())
                {
                    var index = result.FindIndex(n => n.Owner == Field(title, "owner") && n.Map == Field(title, "map") && n.Name == Field(title, "name"));
                    if (index >= 0) result[index] = result[index] with {
                        DisplayName = Field(title, "displayName"),
                        MustKnow = title.TryGetProperty("mustKnow", out _) ? Flag(title, "mustKnow") : result[index].MustKnow
                    };
                }
        }
        return result.OrderBy(n => n.Title, StringComparer.OrdinalIgnoreCase)
            .ThenBy(n => n.Owner, StringComparer.Ordinal).ToArray();
    }

    private static bool Flag(JsonElement data, string name) => data.ValueKind == JsonValueKind.Object &&
        data.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.True;

    private static string Field(JsonElement data, string name) =>
        data.ValueKind == JsonValueKind.Object && data.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.String
            ? field.GetString() ?? "" : "";

    public static NadeKind Kind(string type) => type.Trim().ToLowerInvariant() switch
    {
        "smoke" => NadeKind.Smoke,
        "he" or "nade" or "hegrenade" => NadeKind.HE,
        "flash" or "flashbang" => NadeKind.Flash,
        "molly" or "molotov" or "incendiary" => NadeKind.Fire,
        "decoy" => NadeKind.Decoy,
        _ => NadeKind.Other
    };

    public static string Label(NadeKind kind) => kind switch
    {
        NadeKind.Smoke => "Smokes", NadeKind.HE => "HE-Granaten", NadeKind.Flash => "Flashes",
        NadeKind.Fire => "Molotov / Incendiary", NadeKind.Decoy => "Decoys", _ => "Ohne Typ"
    };

    public static (string Weapon, string Slot)? Equipment(NadeKind kind, bool counterTerrorist) => kind switch
    {
        NadeKind.Smoke => ("weapon_smokegrenade", "slot8"),
        NadeKind.HE => ("weapon_hegrenade", "slot6"),
        NadeKind.Flash => ("weapon_flashbang", "slot7"),
        NadeKind.Fire => (counterTerrorist ? "weapon_incgrenade" : "weapon_molotov", "slot10"),
        NadeKind.Decoy => ("weapon_decoy", "slot9"),
        _ => null
    };
}

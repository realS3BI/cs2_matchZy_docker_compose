using System.Text.Json;

namespace MatchZyNades;

public sealed record PlayerPanelSettings
{
    public IReadOnlyList<NadeReference> Favorites { get; init; } = [];
    public bool GameButtons { get; init; }
    public Dictionary<string, string> Keys { get; init; } = new(DefaultKeys, StringComparer.Ordinal);
    public static readonly IReadOnlyDictionary<string, string> DefaultKeys = new Dictionary<string, string>
    {
        ["focus"] = "KP_0", ["visible"] = "KP_DEL", ["up"] = "UPARROW", ["down"] = "DOWNARROW",
        ["select"] = "ENTER", ["back"] = "BACKSPACE", ["previous"] = "LEFTARROW",
        ["next"] = "RIGHTARROW"
    };
    public static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>
    {
        ["focus"] = "Bedienen / Spielen", ["visible"] = "Anzeigen / Verstecken",
        ["up"] = "Auswahl nach oben", ["down"] = "Auswahl nach unten", ["select"] = "Bestätigen",
        ["back"] = "Zurück", ["previous"] = "Vorherige Seite", ["next"] = "Nächste Seite"
    };
    public static PlayerPanelSettings Validate(PlayerPanelSettings value)
    {
        if (value.Favorites == null || value.Favorites.Count > 1000 || value.Favorites.Any(f => f == null ||
            string.IsNullOrWhiteSpace(f.Owner) || string.IsNullOrWhiteSpace(f.Map) || string.IsNullOrWhiteSpace(f.Name)))
            throw new InvalidDataException("Ungültige Favoritenliste.");
        return value with { Keys = new(DefaultKeys), GameButtons = false, Favorites = value.Favorites.Distinct().ToArray() };
    }
    public bool IsFavorite(NadeLineup lineup) => Favorites.Contains(NadeReference.From(lineup));
    public PlayerPanelSettings ToggleFavorite(NadeLineup lineup)
    {
        var key = NadeReference.From(lineup);
        return Validate(this with { Favorites = IsFavorite(lineup)
            ? Favorites.Where(f => f != key).ToArray() : Favorites.Append(key).ToArray() });
    }
    public PlayerPanelSettings Bind(string action, string key)
    {
        throw new InvalidDataException("Die Keybinds sind fest vorgegeben. Mit css_training_binds anzeigen.");
    }
    public string BindingLine(string action) => $"bind \"{DefaultKeys[action]}\" \"css_training_key {DefaultKeys[action]}\"";
    public string Export() => string.Join('\n', DefaultKeys.Keys.Select(BindingLine));
    // Keep the complete line below the client console message limit.
    public string ConsoleExport() => string.Join(";", DefaultKeys.Values.Select((key, index) => $"bind {key} \"css_tk {index}\"")) + "\nbind \"n\" \"noclip\"\nbind \"F8\" \"css_training_review_stop\"";
    public static string? ActionForIndex(string index) => int.TryParse(index, out var value) && value >= 0 && value < DefaultKeys.Count
        ? DefaultKeys.Keys.ElementAt(value) : null;
    public string? ActionForKey(string key) => DefaultKeys.FirstOrDefault(p => p.Value.Equals(key, StringComparison.OrdinalIgnoreCase)).Key;
}

// One atomic file per Steam ID. The recyclable player slot is never a persistence key.
public sealed class PlayerPanelSettingsStore(string directory)
{
    private string FilePath(ulong steamId)
    {
        if (steamId == 0) throw new InvalidDataException("Steam-ID noch nicht verfügbar.");
        return Path.Combine(directory, steamId.ToString(System.Globalization.CultureInfo.InvariantCulture) + ".json");
    }
    public PlayerPanelSettings Load(ulong steamId)
    {
        var path = FilePath(steamId);
        return !File.Exists(path) ? new() : PlayerPanelSettings.Validate(
            JsonSerializer.Deserialize<PlayerPanelSettings>(File.ReadAllText(path)) ?? throw new InvalidDataException("Leere Einstellungsdatei."));
    }
    public void Save(ulong steamId, PlayerPanelSettings settings)
    {
        settings = PlayerPanelSettings.Validate(settings);
        var path = FilePath(steamId);
        Directory.CreateDirectory(directory);
        var temp = path + ".tmp";
        try { File.WriteAllText(temp, JsonSerializer.Serialize(settings)); File.Move(temp, path, true); }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
}

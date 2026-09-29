using System.Text.Json;

namespace MatchZyNades;

public sealed record PlayerPanelSettings
{
    public IReadOnlyList<NadeReference> Favorites { get; init; } = [];
    public bool GameButtons { get; init; }
    public Dictionary<string, string> Keys { get; init; } = new(DefaultKeys, StringComparer.Ordinal);
    public static readonly IReadOnlyDictionary<string, string> DefaultKeys = new Dictionary<string, string>
    {
        ["focus"] = "F6", ["visible"] = "F7", ["up"] = "UPARROW", ["down"] = "DOWNARROW",
        ["select"] = "ENTER", ["back"] = "BACKSPACE", ["previous"] = "LEFTARROW",
        ["next"] = "RIGHTARROW", ["details"] = "PGDN", ["settings"] = "F8"
    };
    public static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>
    {
        ["focus"] = "Bedienen / Spielen", ["visible"] = "Anzeigen / Verstecken",
        ["up"] = "Auswahl nach oben", ["down"] = "Auswahl nach unten", ["select"] = "Bestätigen",
        ["back"] = "Zurück", ["previous"] = "Vorherige Seite", ["next"] = "Nächste Seite",
        ["details"] = "Weitere Beschreibung", ["settings"] = "Einstellungen"
    };
    public static readonly string[] AllowedKeys = Enumerable.Range('A', 26).Select(c => ((char)c).ToString())
        .Concat(Enumerable.Range(0, 10).Select(i => i.ToString()))
        .Concat(Enumerable.Range(1, 12).Select(i => $"F{i}"))
        .Concat(["UPARROW", "DOWNARROW", "LEFTARROW", "RIGHTARROW", "ENTER", "BACKSPACE", "HOME", "END",
            "PGUP", "PGDN", "INS", "DEL", "MOUSE3", "MOUSE4", "MOUSE5", "KP_INS", "KP_END", "KP_DOWNARROW",
            "KP_PGDN", "KP_LEFTARROW", "KP_5", "KP_RIGHTARROW", "KP_HOME", "KP_UPARROW", "KP_PGUP"]).ToArray();

    public static PlayerPanelSettings Validate(PlayerPanelSettings value)
    {
        if (value.Keys == null || value.Keys.Count != DefaultKeys.Count || DefaultKeys.Keys.Any(a => !value.Keys.ContainsKey(a)))
            throw new InvalidDataException("Unvollständige Tastenbelegung.");
        var normalized = value.Keys.ToDictionary(p => p.Key, p => (p.Value ?? "").ToUpperInvariant(), StringComparer.Ordinal);
        if (normalized.Values.Any(k => !AllowedKeys.Contains(k)) || normalized.Values.Distinct().Count() != normalized.Count)
            throw new InvalidDataException("Ungültige oder doppelte Taste.");
        if (value.Favorites == null || value.Favorites.Count > 1000 || value.Favorites.Any(f => f == null ||
            string.IsNullOrWhiteSpace(f.Owner) || string.IsNullOrWhiteSpace(f.Map) || string.IsNullOrWhiteSpace(f.Name)))
            throw new InvalidDataException("Ungültige Favoritenliste.");
        return value with { Keys = normalized, Favorites = value.Favorites.Distinct().ToArray() };
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
        if (!DefaultKeys.ContainsKey(action)) throw new InvalidDataException("Unbekannte Panelaktion.");
        var changed = new Dictionary<string, string>(Keys) { [action] = key.ToUpperInvariant() };
        return Validate(this with { Keys = changed });
    }
    public string BindingLine(string action) => $"bind \"{Keys[action]}\" \"css_training_key {Keys[action]}\"";
    public string Export() => string.Join('\n', DefaultKeys.Keys.Select(BindingLine));
    public string? ActionForKey(string key) => Keys.FirstOrDefault(p => p.Value.Equals(key, StringComparison.OrdinalIgnoreCase)).Key;
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

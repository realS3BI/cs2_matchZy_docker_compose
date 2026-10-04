using System.Text.Json;
using System.Text.RegularExpressions;

namespace Playbook;

public sealed record TrainingMap(string Key, string Title, string MapName, string Category, bool Available, string Command, string WorkshopId = "");

public static class TrainingMaps
{
    public static bool Playable(string name) => Regex.IsMatch(name, "^[a-z0-9_]+$") &&
        !name.Contains("vanity", StringComparison.OrdinalIgnoreCase) &&
        !name.StartsWith("workshop_preview_") && name is not ("graphics_settings" or "lobby_mapveto");

    public static IReadOnlyList<TrainingMap> Build(IEnumerable<string> installed, string catalogJson, string settingsJson)
    {
        var catalog = new Dictionary<string, (string Title, string Category)>();
        try
        {
            using var document = JsonDocument.Parse(catalogJson);
            foreach (var item in document.RootElement.EnumerateArray())
            {
                var name = item.GetProperty("mapName").GetString() ?? "";
                if (!Playable(name)) continue;
                var category = item.GetProperty("category").GetString();
                catalog[name] = (item.GetProperty("title").GetString() ?? name,
                    category == "active" ? "active" : category is "reserve" or "community" ? "reserve" : "other");
            }
        }
        catch (Exception e) when (e is JsonException or InvalidOperationException or KeyNotFoundException) { }
        var maps = installed.Where(Playable).Distinct().Select(name => {
            var meta = catalog.GetValueOrDefault(name, (name, "other"));
            return new TrainingMap(name, meta.Item1, name, meta.Item2, true, "changelevel " + name);
        }).ToList();
        try
        {
            using var settings = JsonDocument.Parse(settingsJson);
            var root = settings.RootElement;
            if (root.TryGetProperty("workshopMapsEnabled", out var enabled) && enabled.ValueKind == JsonValueKind.True)
            {
                var ids = Regex.Split(root.GetProperty("workshopMaps").GetString() ?? "", "[\\s,]+").Where(id => Regex.IsMatch(id, "^[1-9][0-9]{0,19}$")).Distinct();
                using var entries = JsonDocument.Parse(root.GetProperty("workshopMapCatalog").GetString() ?? "[]");
                foreach (var id in ids)
                {
                    var entry = entries.RootElement.EnumerateArray().FirstOrDefault(e => e.TryGetProperty("workshopId", out var wid) && wid.GetString() == id);
                    var name = entry.ValueKind == JsonValueKind.Object && entry.TryGetProperty("mapName", out var n) ? n.GetString() ?? "" : "";
                    if (name.Length > 0 && !Playable(name)) continue;
                    if (maps.Any(m => m.MapName == name)) continue;
                    var meta = catalog.GetValueOrDefault(name, (name, "other"));
                    var title = entry.ValueKind == JsonValueKind.Object && entry.TryGetProperty("title", out var t) ? t.GetString() ?? id : "Workshop " + id;
                    maps.Add(new("workshop:" + id, title, name, meta.Item2, true, "host_workshop_map " + id, id));
                }
            }
        }
        catch (Exception e) when (e is JsonException or InvalidOperationException or KeyNotFoundException) { }
        foreach (var (name, meta) in catalog)
            if (!maps.Any(m => m.MapName == name)) maps.Add(new(name, meta.Title, name, "unavailable", false, ""));
        return maps.OrderBy(m => m.Title).ToArray();
    }
}

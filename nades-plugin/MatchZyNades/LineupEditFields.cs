namespace MatchZyNades;

public static class LineupEditFields
{
    public static readonly IReadOnlyDictionary<string, string> Text = new Dictionary<string, string> {
        ["displayName"] = "Name", ["desc"] = "Beschreibung", ["throwFromTitle"] = "Startposition",
        ["throwToTitle"] = "Endposition", ["throwTechnique"] = "Wurftechnik",
        ["lineupPos"] = "Startkoordinaten", ["lineupAng"] = "Blickwinkel", ["landingPos"] = "Endkoordinaten"
    };
    public static readonly IReadOnlyDictionary<string, string> Flags = new Dictionary<string, string> {
        ["is_jumpthrow"] = "Jumpthrow", ["is_crouch"] = "Geduckt", ["is_walking"] = "Gehen",
        ["is_running"] = "Laufen", ["is_stepping"] = "Schrittwurf"
    };
    public static bool Allowed(string field) => Text.ContainsKey(field) || Flags.ContainsKey(field) || field is "team" or "click_type" or "type";
    public static int Limit(string field) => field == "desc" ? 300 : field == "throwTechnique" ? 500 : 120;
    public static string Prompt(string field) => field switch {
        "team" => "Seite im Chat eingeben: ct, t oder beide.",
        "click_type" => "Maustaste im Chat eingeben: links, rechts oder beide.",
        "type" => "Granatentyp im Chat eingeben: Smoke, Flash, HE, Molly oder Decoy.",
        "displayName" => "Neuen Namen im Chat eingeben (max. 120 Zeichen).",
        _ when Flags.ContainsKey(field) => $"{Flags[field]} im Chat eingeben: ja oder nein.",
        _ when field is "lineupPos" or "lineupAng" or "landingPos" => $"{Text[field]} im Chat eingeben: x y z (drei Zahlen, Dezimalpunkt).",
        _ => $"{Text.GetValueOrDefault(field, "Wert")} im Chat eingeben (max. {Limit(field)} Zeichen). Mit - leeren."
    } + " abbrechen beendet die Eingabe.";

    public static bool TryParse(string field, string text, out object value)
    {
        value = text;
        if (!Allowed(field) || text.Length > Limit(field) || text.Any(char.IsControl)) return false;
        var normalized = text.ToLowerInvariant();
        if (Flags.ContainsKey(field)) {
            if (normalized is "ja" or "true" or "1" or "an") { value = true; return true; }
            if (normalized is "nein" or "false" or "0" or "aus") { value = false; return true; }
            return false;
        }
        if (field is "team" or "click_type") {
            value = field == "team" ? normalized switch { "ct" => "ct", "t" => "t", "both" or "beide" => "both", _ => "" }
                : normalized switch { "left" or "links" => "left", "right" or "rechts" => "right", "both" or "beide" => "both", _ => "" };
            return (string)value != "";
        }
        if (field == "type") {
            value = normalized switch { "smoke" => "Smoke", "flash" => "Flash", "he" => "HE", "molly" or "molotov" or "incendiary" => "Molly", "decoy" => "Decoy", _ => "" };
            return (string)value != "";
        }
        if (field is "lineupPos" or "lineupAng" or "landingPos") {
            if (!Coordinates.TryParse(text, out var point)) return false;
            value = NadeCaptureFile.Vector(point); return true;
        }
        if (text == "-" && field != "displayName") { value = ""; return true; }
        return !string.IsNullOrWhiteSpace(text);
    }
}

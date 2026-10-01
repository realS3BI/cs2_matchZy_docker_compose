namespace MatchZyNades;

public static class LineupEditFields
{
    public static readonly IReadOnlyDictionary<string, string> Text = new Dictionary<string, string> {
        ["displayName"] = "Name", ["desc"] = "Beschreibung", ["throwFromTitle"] = "Startposition",
        ["throwToTitle"] = "Endposition",
        ["lineupPos"] = "Startkoordinaten", ["lineupAng"] = "Blickwinkel", ["landingPos"] = "Endkoordinaten"
    };
    public static readonly IReadOnlyDictionary<string, string> Flags = new Dictionary<string, string> {
        ["is_jumpthrow"] = "Jumpthrow", ["is_crouch"] = "Geduckt"
    };
    public static bool Allowed(string field) => Text.ContainsKey(field) || Flags.ContainsKey(field) || field is "team" or "click_type" or "type" or "movement" or "flightDuration";
    public static int Limit(string field) => field == "desc" ? 300 : 120;
    public static string Prompt(string field) => field switch {
        "team" => "Seite im Chat eingeben: ct, t oder beide.",
        "click_type" => "Maustaste im Chat eingeben: links, rechts oder beide.",
        "movement" => "Bewegung im Chat eingeben: stand, gehen, laufen oder schrittwurf. Es gilt nur eine Auswahl.",
        "flightDuration" => "Flugzeit in Sekunden im Chat eingeben, z. B. 3,25. Vom Abwurf bis zur Wirkung. Mit - leeren.",
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
        if (field == "movement") {
            value = normalized switch { "stand" => "stand", "walk" or "gehen" => "walk", "run" or "laufen" => "run", "step" or "schrittwurf" => "step", _ => "" };
            return (string)value != "";
        }
        if (field == "flightDuration") {
            if (text == "-") { value = null!; return true; }
            if (!float.TryParse(text.Replace(',', '.'), System.Globalization.NumberStyles.AllowDecimalPoint,
                    System.Globalization.CultureInfo.InvariantCulture, out var seconds) || !float.IsFinite(seconds) || seconds < 0) return false;
            value = seconds; return true;
        }
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

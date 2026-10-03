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
    public static bool Allowed(string field) => field is "team" or "throwFromTitle" or "throwToTitle";
    public static int Limit(string field) => field == "desc" ? 300 : 120;
    public static string Prompt(string field) => field == "team"
        ? "Seite im Chat eingeben: ct, t oder beide. abbrechen beendet die Eingabe."
        : $"{Text.GetValueOrDefault(field, "Wert")} im Chat eingeben (max. 120 Zeichen). Mit - leeren. abbrechen beendet die Eingabe.";

    public static bool TryParse(string field, string text, out object value)
    {
        value = text;
        if (!Allowed(field) || text.Length > Limit(field) || text.Any(char.IsControl)) return false;
        var normalized = text.ToLowerInvariant();
        if (field == "team") {
            value = normalized switch { "ct" => "ct", "t" => "t", "both" or "beide" => "both", _ => "" };
            return (string)value != "";
        }
        if (text == "-") { value = ""; return true; }
        return !string.IsNullOrWhiteSpace(text);
    }
}

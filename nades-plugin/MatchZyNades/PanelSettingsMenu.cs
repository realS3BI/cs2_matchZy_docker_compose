namespace MatchZyNades;

public static class PanelSettingsMenu
{
    public static MenuPage Create(PlayerPanelSettings settings)
    {
        var hints = new Dictionary<string, string> {
            ["focus"] = "Wechselt zwischen Mausbedienung im HUD und freiem Zielen. Öffnet das Panel, wenn es geschlossen ist.",
            ["visible"] = "Blendet das Panel aus oder wieder ein. Deine Menüposition bleibt erhalten.",
            ["up"] = "Wählt den vorherigen Eintrag auf der aktuellen Seite.",
            ["down"] = "Wählt den nächsten Eintrag auf der aktuellen Seite.",
            ["select"] = "Öffnet den ausgewählten Eintrag oder führt seine Aktion aus.",
            ["back"] = "Geht eine Menüebene zurück. Auf Home wird die Spielsteuerung freigegeben.",
            ["previous"] = "Zeigt die vorherigen neun Einträge dieser Liste.",
            ["next"] = "Zeigt die nächsten neun Einträge dieser Liste."
        };
        var keys = PlayerPanelSettings.Labels.Select(action => new MenuItem(
            $"{action.Value}: {PlayerPanelSettings.DefaultKeys[action.Key]}", hints[action.Key])).ToList();
        keys.Insert(0, new("Alle Keybinds in Konsole ausgeben", "Konsole öffnen: Zeile 1 für das Panel, Zeile 2 für Noclip, Zeile 3 für Video-Stopp mit F8. Vorher eigene Binds sichern; kein automatisches Zurücksetzen.", Request: new(TrainingAction.ExportBindings)));
        return new("Keybinds", "Feste Tasten für alle Spieler. Der Server kann deine lokalen Binds weder setzen noch prüfen. Mausbedienung funktioniert ohne diese Binds.", keys, Key: "settings");
    }
}

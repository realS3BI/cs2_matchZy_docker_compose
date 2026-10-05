namespace Playbook;

public static class PanelSettingsMenu
{
    public static MenuPage Create(PlayerPanelSettings settings)
    {
        var hints = new Dictionary<string, string> {
            ["focus"] = "Wechselt zwischen Mausbedienung im HUD und freiem Zielen. Öffnet das Panel, wenn es geschlossen ist.",
            ["visible"] = "Blendet das Panel aus oder wieder ein. Deine Menüposition bleibt erhalten.",
            ["up"] = "Wählt den vorherigen Eintrag. Vom ersten Eintrag geht es zum letzten auf der letzten Seite.",
            ["down"] = "Wählt den nächsten Eintrag. Vom letzten Eintrag geht es zum ersten auf der ersten Seite.",
            ["select"] = "Öffnet den ausgewählten Eintrag oder führt seine Aktion aus.",
            ["back"] = "Geht eine Menüebene zurück. Auf Home bleibt die Panelbedienung aktiv.",
            ["previous"] = "Zeigt die vorherige Seite. Von der ersten Seite geht es zur letzten.",
            ["next"] = "Zeigt die nächste Seite. Von der letzten Seite geht es zur ersten."
        };
        var keys = PlayerPanelSettings.Labels.Select(action => new MenuItem(
            $"{action.Value}: {PlayerPanelSettings.DefaultKeys[action.Key]}", hints[action.Key])).ToList();
        keys.Insert(0, new("Alle Keybinds in Konsole ausgeben", "Konsole öffnen: Zeile 1 für das Panel, Zeile 2 für Noclip, Zeile 3 für Video-Stopp mit F8. Vorher eigene Binds sichern; kein automatisches Zurücksetzen.", Request: new(TrainingAction.ExportBindings)));
        return new("Keybinds", "Feste Tasten für alle Spieler. Der Server kann deine lokalen Binds weder setzen noch prüfen. Mausbedienung funktioniert ohne diese Binds.", keys, Key: "settings");
    }
}

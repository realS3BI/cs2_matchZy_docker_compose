namespace MatchZyNades;

public static class PanelSettingsMenu
{
    public static MenuPage Create(PlayerPanelSettings settings)
    {
        var keys = PlayerPanelSettings.Labels.Select(action => new MenuItem(
            $"{action.Value}: {settings.Keys[action.Key]}", "Taste wählen. CS2-Bind danach einmal lokal setzen.",
            Page: new(action.Value, "Bereits verwendete Tasten sind gesperrt. Bestehende CS2-Binds vorher sichern.",
                PlayerPanelSettings.AllowedKeys.Select(key => new MenuItem(key,
                    settings.Keys.Any(p => p.Key != action.Key && p.Value == key) ? "Diese Taste wird bereits für eine andere Panelaktion verwendet." :
                        $"Speichert {key} für diese Aktion. Anschließend bind \"{key}\" \"css_training_key {key}\" in der CS2-Konsole setzen.",
                    Request: new(TrainingAction.BindKey, Setting: action.Key, Value: key),
                    Enabled: !settings.Keys.Any(p => p.Key != action.Key && p.Value == key))).ToArray()))).ToList();
        keys.Add(new("Alle Bind-Befehle anzeigen", "Schreibt deine persönliche Belegung in die Client-Konsole. In eine lokale CFG übernehmen.", Request: new(TrainingAction.ExportBindings)));
        keys.Add(new($"Spielaktionen W/S/Use: {(settings.GameButtons ? "an" : "aus")}", "Optionale alte Navigation über Spielaktionen; freie Hotkeys und Maus funktionieren unabhängig davon.", Request: new(TrainingAction.ToggleGameButtons)));
        return new("Deine Einstellungen", "Pro Steam-ID gespeichert. Tastenzuweisung im Spiel erfordert einen lokalen Bind; der Server darf ihn nicht automatisch setzen.", keys, Key: "settings");
    }
}

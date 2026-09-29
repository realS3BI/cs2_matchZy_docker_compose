namespace MatchZyNades;

public static class TrainingMenu
{
    public static InGameMenu Create(IReadOnlyList<NadeLineup> library, string map, bool practice,
        NadeLineup? last, string libraryError = "", PlayerPanelSettings? settings = null,
        IReadOnlyList<CompetitiveSpawn>? spawns = null)
    {
        MenuItem Action(string title, TrainingAction action, string hint, bool shared = false)
        {
            var request = new MenuRequest(action);
            return shared
                ? new(title, "Betrifft alle Spieler auf dem Server.", Page: new(title, hint,
                    [new("Abbrechen", "Zurück zur vorherigen Auswahl." , Request: new(TrainingAction.Back)),
                     new("Jetzt ausführen", hint, Request: request)]))
                : new(title, hint, Request: request);
        }
        settings ??= new();
        spawns ??= [];
        MenuPage Lineups(string title, IEnumerable<NadeLineup> entries, string key) => new(title,
            libraryError.Length > 0 ? libraryError : entries.Any() ? "Lineup öffnen, trainieren oder als Favorit speichern."
                : title == "Favoriten" ? "Noch keine Favoriten. Öffne ein Lineup unter Alle und wähle „Zu Favoriten hinzufügen“."
                : "Keine Lineups in dieser Auswahl.",
            entries.Select(n => new MenuItem(
                (settings.IsFavorite(n) ? "★ " : "") + n.Title + (n.Owner == "default" ? "" : " [privat]"),
                n.Description.Length == 0 ? "Details und Abwurfpunkt öffnen." : n.Description,
                Page: new(n.Title, n.Description, [
                    new("Lineup laden & trainieren", n.Description.Length == 0
                        ? "Teleportiert dich und rüstet die passende Granate aus." : n.Description,
                        Request: new(TrainingAction.LoadLineup, n)),
                    new(settings.IsFavorite(n) ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen",
                        "Deine Favoriten bleiben für deine Steam-ID auf diesem Server gespeichert.",
                        Request: new(TrainingAction.ToggleFavorite, n))
                ], Key: $"lineup:{n.Owner}:{n.Map}:{n.Name}"))).ToArray(), Key: key);
        MenuItem Filter(NadeKind kind, string title, Func<NadeLineup, bool> predicate, string key)
        {
            var entries = library.Where(n => n.Kind == kind && predicate(n)).ToArray();
            return new($"{title} ({entries.Length})", "Lineups dieser Auswahl öffnen.",
                Page: Lineups(title, entries, $"filter:{kind}:{key}"));
        }
        var categories = Enum.GetValues<NadeKind>()
            .Where(k => k != NadeKind.Other || library.Any(n => n.Kind == k))
            .Select(kind => new MenuItem($"{NadeCatalog.Label(kind)} ({library.Count(n => n.Kind == kind)})",
                "Favoriten, private Lineups, Must Know oder alle Lineups wählen.",
                Page: new(NadeCatalog.Label(kind), "Wähle deine Ansicht.", [
                    Filter(kind, "Favoriten", settings.IsFavorite, "favorites"),
                    Filter(kind, "Privat", n => n.Owner != "default", "private"),
                    Filter(kind, "Must Know", n => n.MustKnow, "must-know"),
                    Filter(kind, "Alle", _ => true, "all")
                ], Key: $"category:{kind}"))).ToArray();
        var favoriteEntries = library.Where(settings.IsFavorite).ToArray();
        var spawnMenu = new MenuPage("Competitive-Spawns", "Aktive Spawnpunkte der geladenen Map. Dein Team bleibt unverändert.",
            new[] { 3, 2 }.Select(team => {
                var name = team == 3 ? "CT" : "T";
                var points = spawns.Where(s => s.Team == team).ToArray();
                return new MenuItem($"{name}-Spawns ({points.Length})", $"Competitive-Spawn für {name} auswählen.",
                    Page: new($"{name}-Spawns", points.Length == 0 ? "Keine aktiven Competitive-Spawns gefunden." : "Spawn auswählen und dorthin teleportieren.",
                        points.Select((spawn, index) => new MenuItem($"{name}-Spawn {index + 1:00}",
                            FormattableString.Invariant($"Position: {spawn.Position.X:0}, {spawn.Position.Y:0}, {spawn.Position.Z:0}. Teleportiert dich mit der Blickrichtung dieses Spawns."),
                            Request: new(TrainingAction.TeleportSpawn, Spawn: spawn))).ToArray(), Key: $"spawns:{team}"));
            }).ToArray(), Key: "spawns");
        var training = new MenuPage("Wurf & Position", "Aktionen geben die Spielsteuerung wieder frei.", [
            Action("Letzten Wurf wiederholen", TrainingAction.Rethrow, "MatchZy wirft die zuletzt geworfene Granate erneut."),
            Action("Zum letzten Abwurfpunkt", TrainingAction.LastThrow, "Zur Position deiner zuletzt geworfenen Granate."),
            Action("Position merken", TrainingAction.SavePosition, "Aktuelle Position und Blickrichtung merken."),
            Action("Gemerkte Position laden", TrainingAction.LoadPosition, "Zur zuvor gemerkten Position zurück."),
            Action("Noclip umschalten", TrainingAction.Noclip, "Flugmodus ein- oder ausschalten."),
            Action("Granaten entfernen", TrainingAction.ClearGrenades, "Entfernt aktive Granaten auf dem Server.", true),
            Action("Nächster Team-Spawn", TrainingAction.BestSpawn, "Zum nächsten Spawn deines Teams."),
            Action("Entferntester Team-Spawn", TrainingAction.WorstSpawn, "Zum entferntesten Spawn deines Teams."),
            new("Granate ausrüsten", "Smoke, Flash, HE, Molotov / Incendiary oder Decoy wählen.",
                Page: new("Granate ausrüsten", "Gibt dir die Granate, sofern im Inventar Platz ist.",
                    Enum.GetValues<NadeKind>().Where(k => k != NadeKind.Other).Select(k =>
                        new MenuItem(NadeCatalog.Label(k), "Granate ausrüsten und weiterspielen.",
                            Request: new(TrainingAction.GiveGrenade, Kind: k))).ToArray()))]);
        var tools = new MenuPage("Trainingswerkzeuge", "MatchZy meldet das Ergebnis der Aktion.", [
            Action("Bot hier platzieren", TrainingAction.Bot, "Platziert einen Trainingsbot an deiner Position."),
            Action("Duckenden Bot platzieren", TrainingAction.CrouchBot, "Platziert einen duckenden Trainingsbot."),
            Action("Bots entfernen", TrainingAction.RemoveBots, "Entfernt die Trainingsbots auf dem Server.", true),
            Action("Flugbahnvorschau umschalten", TrainingAction.Trajectory, "Schaltet die Flugbahnvorschau für den Server um.", true),
            Action("Einschläge umschalten", TrainingAction.Impacts, "Schaltet sichtbare Einschläge für den Server um.", true),
            Action("Flashschutz umschalten", TrainingAction.NoFlash, "Schaltet deinen Flashschutz um."),
            Action("Unverwundbarkeit umschalten", TrainingAction.God, "Schaltet deine Unverwundbarkeit um."),
            Action("Position & Blickwinkel prüfen", TrainingAction.CheckPosition, "Zeigt Diagnosewerte im Panel; R blättert lange Details weiter.")]);
        var home = new List<MenuItem>();
        if (!practice) home.Add(Action("Training starten", TrainingAction.StartPractice, "Startet MatchZy Practice mit deinen bestehenden Berechtigungen."));
        home.Add(new("Granaten-Bibliothek", practice ? $"{library.Count} Lineups auf dieser Map. {libraryError}" : "Zuerst Training starten.",
            Page: new("Granaten-Bibliothek", "Granatentyp auswählen.", categories), Enabled: practice));
        home.Add(new("Letztes Lineup erneut laden", last == null ? "Noch kein Lineup ausgewählt." : last.Title,
            Request: new(TrainingAction.RepeatLineup), Enabled: practice && last != null));
        home.Add(new("Wurf & Position", practice ? "Wiederholen, Position merken und frei bewegen." : "Zuerst Training starten.", Page: training, Enabled: practice));
        home.Add(new("Trainingswerkzeuge", practice ? "Bots, Vorschau und persönliche Einstellungen." : "Zuerst Training starten.", Page: tools, Enabled: practice));
        home.Add(new("Neue Nade aufnehmen", "Aufnahme starten, werfen und danach speichern. Ohne Chat; der Name wird automatisch vergeben.",
            Page: new("Nade aufnehmen", "Nach dem Wurf die Panelbedienung aktivieren und Aufnahme speichern wählen.", [
                Action("Aufnahme starten", TrainingAction.StartCapture, "Wirf innerhalb von 3 Minuten eine Granate. Position, Blickwinkel, Wurf und Ziel werden erfasst."),
                Action("Aufnahme speichern", TrainingAction.SaveCapture, "Nach der Explosion speichern. Automatischer Name aus Granatentyp, Map und Zeit; später im Dashboard umbenennbar."),
                Action("Aufnahme verwerfen", TrainingAction.CancelCapture, "Verwirft die laufende oder noch ungespeicherte Aufnahme.")]), Enabled: practice));
        home.Add(new($"Favoriten ({favoriteEntries.Length})", "Deine gespeicherten Lieblings-Lineups auf dieser Map.",
            Page: Lineups("Favoriten", favoriteEntries, "favorites"), Enabled: practice));
        home.Add(new("Competitive-Spawns", "CT- oder T-Spawn auswählen und dorthin teleportieren.", Page: spawnMenu, Enabled: practice));
        home.Add(Action("Deine Einstellungen", TrainingAction.Settings, "Hotkeys pro Spieler speichern."));
        home.Add(Action("Panel ausblenden", TrainingAction.Close, "Dein Hotkey für Sichtbarkeit blendet das Panel wieder ein."));
        return new(new("Trainingszentrale", "Alle Trainingsaktionen an einem Ort.", home), map);
    }

    // Fixed allowlist only. Never execute labels, descriptions or library data as commands.
    // Run in the player's context so MatchZy's own permission checks remain authoritative.
    public static string? Command(TrainingAction action) => action switch
    {
        TrainingAction.StartPractice => "css_prac",
        TrainingAction.Rethrow => "css_rethrow", TrainingAction.LastThrow => "css_last",
        TrainingAction.ClearGrenades => "css_clear", TrainingAction.SavePosition => "css_savepos",
        TrainingAction.LoadPosition => "css_loadpos", TrainingAction.Noclip => "noclip",
        TrainingAction.Bot => "css_bot", TrainingAction.CrouchBot => "css_crouchbot",
        TrainingAction.RemoveBots => "css_nobots", TrainingAction.Trajectory => "css_traj",
        TrainingAction.Impacts => "css_impacts", TrainingAction.NoFlash => "css_noflash",
        TrainingAction.God => "css_god", TrainingAction.BestSpawn => "css_bestspawn",
        TrainingAction.WorstSpawn => "css_worstspawn", _ => null
    };

    public static string ActionHint(TrainingAction action) => action switch
    {
        TrainingAction.StartPractice => "Training wird nach erfolgreicher Aktivierung hier freigeschaltet.",
        _ => "Du kannst weiterspielen. Dein Bedien-Hotkey aktiviert das Panel wieder. MatchZy meldet Details weiterhin im Chat."
    };
}

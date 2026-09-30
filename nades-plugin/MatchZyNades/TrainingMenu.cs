namespace MatchZyNades;

public static class TrainingMenu
{
    public static InGameMenu Create(IReadOnlyList<NadeLineup> library, string map, bool practice,
        NadeLineup? last, string libraryError = "", PlayerPanelSettings? settings = null,
        IReadOnlyList<CompetitiveSpawn>? spawns = null, TrainingToggles? toggles = null,
        MenuPage? maps = null, string steamId = "", bool canWriteNades = true, bool standalone = false)
    {
        MenuItem Action(string title, TrainingAction action, string hint) => new(title, hint, Request: new(action));
        settings ??= new();
        spawns ??= [];
        toggles ??= new();
        MenuItem Toggle(string title, TrainingAction action, bool active, string hint) =>
            Action($"{title} {(active ? "ausschalten" : "einschalten")}", action, $"Aktuell {(active ? "an" : "aus")}. {hint}");
        MenuItem Lineup(NadeLineup n)
        {
            var own = canWriteNades && n.Owner == steamId && n.Owner != "default" && !n.Official;
            var status = n.Official ? "Offiziell" : n.ReviewStatus == "pending" ? "Im Review" : "Aufnahme";
            var items = new List<MenuItem> {
                new("Lineup laden & trainieren", "Teleportiert dich zum Abwurfpunkt, stellt die Blickrichtung ein und rüstet die passende Granate aus. Danach selbst werfen.", Request: new(TrainingAction.LoadLineup, n)),
                new(settings.IsFavorite(n) ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen", "Speichert diese Granate in deiner persönlichen Favoritenliste für diese Map.", Request: new(TrainingAction.ToggleFavorite, n))
            };
            if (own)
            {
                items.Add(new("Name bearbeiten", "Wähle diesen Eintrag und schreibe den neuen Namen in den Chat. Mit abbrechen beenden. Der interne Name bleibt erhalten.", Request: new(TrainingAction.EditName, n)));
                items.Add(new("Beschreibung bearbeiten", "Wähle diesen Eintrag und beschreibe im Chat Standpunkt, Ziel und Wurftechnik. Mit abbrechen beenden.", Request: new(TrainingAction.EditDescription, n)));
                items.Add(new(n.ReviewStatus == "pending" ? "Review angefragt" : "Zum Review freigeben", n.ReviewStatus == "pending" ? "Ein Plattform-Admin prüft deine Aufnahme. Nach seiner Freigabe erscheint sie zusätzlich unter Offiziell." : "Reicht deine Aufnahme zur Prüfung ein. Unter Alle bleibt sie sichtbar; Offiziell erfordert die Admin-Freigabe.", Request: new(TrainingAction.RequestReview, n), Enabled: n.ReviewStatus != "pending"));
                items.Add(new("Eigene Aufnahme löschen", "Löscht ausschließlich diese eigene, noch nicht veröffentlichte Aufnahme. Du bestätigst im nächsten Schritt.", Page: new("Aufnahme löschen", n.Title, [
                    new("Abbrechen", "Behält die Aufnahme und geht zurück.", Request: new(TrainingAction.Back)),
                    new("Aufnahme endgültig löschen", "Entfernt diese Aufnahme aus deiner Bibliothek. Das kann nicht rückgängig gemacht werden.", Request: new(TrainingAction.DeleteLineup, n))], Key: $"delete:{n.Owner}:{n.Map}:{n.Name}")));
            }
            var description = string.IsNullOrWhiteSpace(n.Description) ? "Noch keine Beschreibung. Eigene Aufnahmen kannst du hier ergänzen." : n.Description;
            return new((settings.IsFavorite(n) ? "★ " : "") + n.Title + (n.ReviewStatus == "pending" ? " [Review]" : ""), $"{status}. {description}",
                Page: new(n.Title, description, items, Key: $"lineup:{n.Owner}:{n.Map}:{n.Name}"));
        }
        MenuPage Lineups(string title, IEnumerable<NadeLineup> entries, string key) => new(title,
            libraryError.Length > 0 ? libraryError : entries.Any() ? "Granate auswählen, Beschreibung lesen und zum Abwurfpunkt springen."
                : "Noch keine Granaten in dieser Auswahl. Eigene Würfe über Neue Nade aufnehmen speichern.", entries.Select(Lineup).ToArray(), Key: key);
        MenuItem Filter(NadeKind kind, string title, Func<NadeLineup, bool> predicate, string key, string hint)
        {
            var entries = library.Where(n => n.Kind == kind && predicate(n)).ToArray();
            return new($"{title} ({entries.Length})", hint, Page: Lineups(title, entries, $"filter:{kind}:{key}"));
        }
        var categories = Enum.GetValues<NadeKind>().Where(k => k != NadeKind.Other || library.Any(n => n.Kind == k))
            .Select(kind => new MenuItem($"{NadeCatalog.Label(kind)} ({library.Count(n => n.Kind == kind)})",
                $"{NadeCatalog.Label(kind)} auf {map}: Favoriten, geprüfte offizielle Lineups, Must Know oder alle verfügbaren Aufnahmen.",
                Page: new(NadeCatalog.Label(kind), "Wähle eine Sammlung für diesen Granatentyp.", [
                    Filter(kind, "Favoriten", settings.IsFavorite, "favorites", "Deine persönlich gemerkten Granaten dieses Typs auf dieser Map."),
                    Filter(kind, "Offiziell", n => n.Official, "official", "Vom Plattform-Admin geprüfte und für alle freigegebene Lineups."),
                    Filter(kind, "Must Know", n => n.MustKnow, "must-know", "Vom Admin ausgewählte Grundlagen, die du auf dieser Map beherrschen solltest."),
                    Filter(kind, "Alle", _ => true, "all", "Alle für dich verfügbaren Granaten: alle Spieleraufnahmen und offizielle Lineups.")
                ], Key: $"category:{kind}"))).ToArray();
        var favoriteEntries = library.Where(settings.IsFavorite).ToArray();
        var mustKnow = library.Where(n => n.MustKnow).ToArray();
        var spawnMenu = new MenuPage("Competitive-Spawns", "CT- oder T-Seite wählen. Teleportiert dich, ohne dein Team zu ändern.",
            new[] { 3, 2 }.Select(team => {
                var name = team == 3 ? "CT" : "T";
                var points = spawns.Where(s => s.Team == team).ToArray();
                return new MenuItem($"{name}-Spawns ({points.Length})", $"Startpositionen der {name}-Seite für ein Competitive-Match auf dieser Map.",
                    Page: new($"{name}-Spawns", points.Length == 0 ? "Keine aktiven Competitive-Spawns gefunden." : "Spawn wählen. Belegte Positionen werden nicht benutzt.",
                        points.Select((spawn, index) => new MenuItem($"{name}-Spawn {index + 1:00}",
                            $"Teleportiert dich zu {name}-Startposition {index + 1} mit deren Blickrichtung. Dein Team bleibt unverändert.",
                            Request: new(TrainingAction.TeleportSpawn, Spawn: spawn))).ToArray(), Key: $"spawns:{team}"));
            }).ToArray(), Key: "spawns");
        var bots = new MenuPage("Bots", "Trainingsziele platzieren oder die Trainingsbots entfernen.", [
            Action("Bot hier platzieren", TrainingAction.Bot, "Platziert einen stehenden Trainingsbot an deiner Position und mit deiner Blickrichtung."),
            Action("Duckenden Bot platzieren", TrainingAction.CrouchBot, "Platziert einen duckenden Trainingsbot an deiner Position, etwa als Ziel für eine Flash."),
            Action("Bots entfernen", TrainingAction.RemoveBots, "Entfernt sofort alle Trainingsbots. Betrifft alle Spieler auf dem Server.")], Key: "bots");
        var switches = new MenuPage("Trainingshilfen", "Beschriftungen zeigen die nächste Aktion; die Beschreibung zeigt den aktuellen Zustand.", [
            Toggle("Flugbahnvorschau", TrainingAction.Trajectory, toggles.Trajectory, "Zeigt die Vorschau der Granatenflugbahn. Gilt für den gesamten Server."),
            Toggle("Einschläge", TrainingAction.Impacts, toggles.Impacts, "Markiert Geschosseinschläge. Gilt für den gesamten Server."),
            Toggle("Flashschutz", TrainingAction.NoFlash, toggles.NoFlash, "Verhindert Blendung durch Flashbangs für dich."),
            Toggle("God Mode", TrainingAction.God, toggles.God, "Schaltet deinen Schutz vor Schaden ein oder aus.")], Key: "toggles");
        var tools = new MenuPage("Trainingswerkzeuge", "Würfe wiederholen, Positionen merken und Trainingshilfen bedienen.", [
            Action("Letzten Wurf wiederholen", TrainingAction.Rethrow, "Wirft deine zuletzt geworfene Granate erneut mit derselben Flugbahn; du kannst die Wirkung von anderswo beobachten."),
            Action("Zum letzten Abwurfpunkt", TrainingAction.LastThrow, "Bringt dich an die Position deiner zuletzt geworfenen Granate zurück."),
            Action("Position merken", TrainingAction.SavePosition, "Merkt deine aktuelle Position und Blickrichtung für Gemerkte Position laden."),
            Action("Gemerkte Position laden", TrainingAction.LoadPosition, "Teleportiert dich zur zuvor gemerkten Position und stellt deine Blickrichtung wieder her."),
            Action("Granaten entfernen", TrainingAction.ClearGrenades, "Entfernt sofort aktive Granaten und ihre Effekte. Betrifft das Training aller Spieler."),
            new("Bots", "Stehenden oder duckenden Bot platzieren oder Trainingsbots entfernen.", Page: bots),
            new("Trainingshilfen", "Flugbahnvorschau, Einschläge, Flashschutz und God Mode ein- oder ausschalten.", Page: switches),
            Action("Position & Blickwinkel prüfen", TrainingAction.CheckPosition, "Zeigt deine aktuellen Koordinaten und Blickwinkel im Beschreibungsbereich.")], Key: "tools");
        if (standalone)
            tools = tools with { Items = tools.Items.Where(item =>
                item.Page?.Key != "bots" && item.Request?.Action != TrainingAction.Rethrow).ToArray(),
                Description = "Positionen merken und Trainingshilfen bedienen." };
        var home = new List<MenuItem> {
            new("Granaten-Bibliothek", $"{library.Count} verfügbare Granaten auf {map}. Wähle zuerst den Granatentyp und danach deine Sammlung. {libraryError}", Page: new("Granaten-Bibliothek", "Granatentyp auswählen.", categories), Enabled: practice),
            new($"Must Know ({mustKnow.Length})", "Starte hier: wichtige Lineups für diese Map, vom Plattform-Admin ausgewählt.", Page: Lineups("Must Know", mustKnow, "must-know"), Enabled: practice),
            new("Trainingswerkzeuge", standalone ? "Positionen merken und Trainingshilfen einstellen." : "Würfe wiederholen, Positionen merken, Bots platzieren und Trainingshilfen einstellen.", Page: tools, Enabled: practice),
            new("Neue Nade aufnehmen", "Aufnahme starten, eine Granate werfen und nach ihrer Wirkung speichern. Sie erscheint unter Alle und ist noch nicht offiziell geprüft.",
                Page: new("Nade aufnehmen", "Nach dem Wurf mit KP_0 zurück ins Panel wechseln und Aufnahme speichern wählen.", [
                    Action("Aufnahme starten", TrainingAction.StartCapture, "Wirf innerhalb von drei Minuten eine Granate. Abwurfpunkt, Blickwinkel, Wurftechnik und Ziel werden erfasst."),
                    Action("Aufnahme speichern", TrainingAction.SaveCapture, "Speichert die fertige Aufnahme mit einem automatischen Namen. Unter Alle kannst du Name und Beschreibung bearbeiten und einen Review anfragen."),
                    Action("Aufnahme verwerfen", TrainingAction.CancelCapture, "Verwirft die laufende oder noch ungespeicherte Aufnahme. Bereits gespeicherte Granaten bleiben erhalten.")]), Enabled: practice),
            new($"Favoriten ({favoriteEntries.Length})", "Deine gemerkten Granaten auf dieser Map. Über die Detailansicht einer Granate hinzufügen oder entfernen.", Page: Lineups("Favoriten", favoriteEntries, "favorites"), Enabled: practice),
            new("Competitive-Spawns", "Startpositionen der CT- oder T-Seite auswählen und direkt dorthin teleportieren.", Page: spawnMenu, Enabled: practice),
            new("Map wechseln", "Startet eine 30-Sekunden-Abstimmung. Mehr als die Hälfte der beim Start verbundenen Spieler muss zustimmen; Bots zählen nicht.", Page: maps ?? new("Map wechseln", "Keine Maps verfügbar.", [], Key: "maps"), Enabled: practice),
            Action("Keybinds", TrainingAction.Settings, "Feste Tastenbelegung nachlesen und Bind-Befehle für die einmalige Einrichtung in deiner Konsole anzeigen."),
            Action("Panel ausblenden", TrainingAction.Close, "Blendet das Panel aus und gibt die Spielsteuerung frei. Mit .nades im Chat erneut öffnen.")
        };
        if (!canWriteNades) home.RemoveAll(item => item.Label == "Neue Nade aufnehmen");
        return new(new("Playbook", "Practice-Werkzeuge und Granaten für die aktuelle Map.", home), map);
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
        _ => "Du kannst weiterspielen. Mit .nades im Chat das Panel erneut öffnen. MatchZy meldet Details weiterhin im Chat."
    };
}

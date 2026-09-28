namespace MatchZyNades;

public static class TrainingMenu
{
    public static InGameMenu Create(IReadOnlyList<NadeLineup> library, string map, bool practice,
        NadeLineup? last, string libraryError = "")
    {
        MenuItem Action(string title, TrainingAction action, string hint, bool shared = false)
        {
            var request = new MenuRequest(action);
            return shared
                ? new(title, "Betrifft alle Spieler auf dem Server.", Page: new(title, hint,
                    [new("Abbrechen", "Zurueck zur vorherigen Auswahl." , Request: new(TrainingAction.Back)),
                     new("Jetzt ausfuehren", hint, Request: request)]))
                : new(title, hint, Request: request);
        }
        var categories = Enum.GetValues<NadeKind>()
            .Where(k => k != NadeKind.Other || library.Any(n => n.Kind == k))
            .Select(kind => new MenuItem($"{NadeCatalog.Label(kind)} ({library.Count(n => n.Kind == kind)})",
                "Lineup waehlen, Beschreibung lesen und zum Abwurfpunkt gehen.",
                Page: new(NadeCatalog.Label(kind), libraryError.Length == 0 ? "Lineups im Dashboard anlegen oder synchronisieren." : libraryError,
                    library.Where(n => n.Kind == kind).Select(n => new MenuItem(
                        n.Name + (n.Owner == "default" ? "" : " [privat]"),
                        n.Description.Length == 0 ? "Details und Abwurfpunkt oeffnen." : n.Description,
                        Page: new(n.Name, n.Description, [new("Lineup laden & trainieren",
                            n.Description.Length == 0 ? "Teleportiert dich und ruestet die passende Granate aus." : n.Description,
                            Request: new(TrainingAction.LoadLineup, n))]))).ToArray()))).ToArray();
        var training = new MenuPage("Wurf & Position", "Aktionen geben die Spielsteuerung wieder frei.", [
            Action("Letzten Wurf wiederholen", TrainingAction.Rethrow, "MatchZy wirft die zuletzt geworfene Granate erneut."),
            Action("Zum letzten Abwurfpunkt", TrainingAction.LastThrow, "Zur Position deiner zuletzt geworfenen Granate."),
            Action("Position merken", TrainingAction.SavePosition, "Aktuelle Position und Blickrichtung merken."),
            Action("Gemerkte Position laden", TrainingAction.LoadPosition, "Zur zuvor gemerkten Position zurueck."),
            Action("Noclip umschalten", TrainingAction.Noclip, "Flugmodus ein- oder ausschalten."),
            Action("Granaten entfernen", TrainingAction.ClearGrenades, "Entfernt aktive Granaten auf dem Server.", true),
            Action("Naechster Team-Spawn", TrainingAction.BestSpawn, "Zum naechsten Spawn deines Teams."),
            Action("Entferntester Team-Spawn", TrainingAction.WorstSpawn, "Zum entferntesten Spawn deines Teams.")]);
        var tools = new MenuPage("Trainingswerkzeuge", "MatchZy meldet das Ergebnis der Aktion.", [
            Action("Bot hier platzieren", TrainingAction.Bot, "Platziert einen Trainingsbot an deiner Position."),
            Action("Duckenden Bot platzieren", TrainingAction.CrouchBot, "Platziert einen duckenden Trainingsbot."),
            Action("Bots entfernen", TrainingAction.RemoveBots, "Entfernt die Trainingsbots auf dem Server.", true),
            Action("Flugbahnvorschau umschalten", TrainingAction.Trajectory, "Schaltet die Flugbahnvorschau fuer den Server um.", true),
            Action("Einschlaege umschalten", TrainingAction.Impacts, "Schaltet sichtbare Einschlaege fuer den Server um.", true),
            Action("Flashschutz umschalten", TrainingAction.NoFlash, "Schaltet deinen Flashschutz um."),
            Action("Unverwundbarkeit umschalten", TrainingAction.God, "Schaltet deine Unverwundbarkeit um."),
            Action("Position & Blickwinkel pruefen", TrainingAction.CheckPosition, "Gibt Diagnosewerte im Chat und Serverlog aus.")]);
        var home = new List<MenuItem>();
        if (!practice) home.Add(Action("Training starten", TrainingAction.StartPractice, "Startet MatchZy Practice mit deinen bestehenden Berechtigungen."));
        home.Add(new("Granaten-Bibliothek", practice ? $"{library.Count} Lineups auf dieser Map. {libraryError}" : "Zuerst Training starten.",
            Page: new("Granaten-Bibliothek", "Granatentyp auswaehlen.", categories), Enabled: practice));
        home.Add(new("Letztes Lineup erneut laden", last == null ? "Noch kein Lineup ausgewaehlt." : last.Name,
            Request: new(TrainingAction.RepeatLineup), Enabled: practice && last != null));
        home.Add(new("Wurf & Position", practice ? "Wiederholen, Position merken und frei bewegen." : "Zuerst Training starten.", Page: training, Enabled: practice));
        home.Add(new("Trainingswerkzeuge", practice ? "Bots, Vorschau und persoenliche Einstellungen." : "Zuerst Training starten.", Page: tools, Enabled: practice));
        home.Add(Action("Menue schliessen", TrainingAction.Close, "Zurueck ins Spiel."));
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
}

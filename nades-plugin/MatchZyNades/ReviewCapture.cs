using System.Text.Json;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;

namespace MatchZyNades;

public sealed record ReviewSession(string Id, string Actor, string Owner, string Map, string Name, long ExpiresAt);
public sealed record ReviewCommand(string Id, string SessionId, string Action, string Slot, long NotBefore, long ExpiresAt);
public sealed record ReviewResult(string SessionId, string CommandId, bool Ok, string Message);

public static class ReviewCaptureFiles
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static readonly string[] Slots = ["aim", "position", "front", "effect", "video"];
    public static ReviewCommand Issue(string directory, string actor, NadeLineup lineup, string action, string slot, long now)
    {
        if (actor.Length != 17 || !actor.All(char.IsAsciiDigit) || lineup.Official ||
            (action == "photo" ? !Slots.Take(4).Contains(slot) : action is not ("video-start" or "video-stop")))
            throw new InvalidOperationException("Diese Review-Aktion ist nicht verfügbar.");
        var folder = Path.Combine(directory, actor);
        var session = Read<ReviewSession>(Path.Combine(folder, "session.json"));
        if (session == null || session.Actor != actor || session.ExpiresAt <= now || !Guid.TryParse(session.Id, out _) ||
            session.Owner != lineup.Owner || session.Map != lineup.Map || session.Name != lineup.Name)
            throw new InvalidOperationException("Öffne dieses Lineup im Browser, verbinde das Spielbild und lasse die Seite geöffnet.");
        var pending = Read<ReviewCommand>(Path.Combine(folder, "command.json"));
        var result = Read<ReviewResult>(Path.Combine(folder, "result.json"));
        if (pending?.SessionId == session.Id && pending.ExpiresAt + 180_000 > now && result?.CommandId != pending.Id)
            throw new InvalidOperationException("Die vorige Aufnahme wird noch verarbeitet. Bitte kurz warten.");
        var command = new ReviewCommand(Guid.NewGuid().ToString("N"), session.Id, action, slot,
            now + (action == "video-stop" ? 0 : 3000), now + 30_000);
        var path = Path.Combine(folder, "command.json");
        File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(command, Json));
        File.Move(path + ".tmp", path, true);
        return command;
    }
    public static T? Read<T>(string path)
    {
        try { return JsonSerializer.Deserialize<T>(File.ReadAllText(path), Json); }
        catch (Exception error) when (error is IOException or JsonException or UnauthorizedAccessException) { return default; }
    }
}

public static class ReviewMenu
{
    public static MenuPage Create(NadeLineup lineup)
    {
        var slots = lineup.ReviewMediaSlots ?? [];
        var definitions = new[] {
            ("aim", "Ausrichtung", "Zeige das Fadenkreuz auf dem exakten Lineup-Punkt. Lineup laden stellt Position und Blickrichtung ein."),
            ("position", "Standposition", "Zeige den Boden und die Kanten, an denen du stehst. Stelle den Bildausschnitt selbst ein."),
            ("front", "Vorderansicht", "Zeige dich von vorne in Third Person. Befehle anzeigen wählen und die Perspektive in deiner Konsole einstellen."),
            ("effect", "Wirkung", "Granate selbst werfen, mit Noclip zum Ziel fliegen und die entfaltete Wirkung zeigen.")
        };
        var items = definitions.Select((step, i) => new MenuItem($"{i + 1}. {step.Item2}{(slots.Contains(step.Item1) ? " [Foto vorhanden]" : "")}", step.Item3,
            Page: new($"{i + 1}/6 · {step.Item2}", step.Item3, [
                new("Foto aufnehmen & hochladen", "Blendet das Panel aus. Nach drei Sekunden nimmt der verbundene Browser das freigegebene Spielbild auf und lädt es hoch. Bildausschnitt ruhig halten, bis die Bestätigung erscheint.", Request: new(TrainingAction.ReviewPhoto, lineup, Setting: step.Item1)),
                new("Lineup laden", "Teleportiert dich zum gespeicherten Start und richtet den Blick aus. Danach die gewünschte Perspektive selbst einstellen.", Request: new(TrainingAction.LoadLineup, lineup)),
                new("Aufnahme-Hilfe anzeigen", step.Item3, Request: new(TrainingAction.ReviewHelp, lineup, Setting: step.Item1))
            ], Key: $"review-{step.Item1}:{lineup.Owner}:{lineup.Map}:{lineup.Name}"))).ToList();
        items.Add(new($"5. Video{(slots.Contains("video") ? " [Vorhanden]" : "")}", "Zum Start laufen, zielen, werfen und mit Noclip die Wirkung zeigen. Aufnahme erfolgt im Browser, ohne Ton, maximal zwei Minuten.",
            Page: new("5/6 · Video", "Nach dem Start drei Sekunden warten. Panel wird ausgeblendet. Zum Stoppen erneut öffnen.", [
                new("Video starten", "Browser-Aufnahme starten. Erst nach der Chat-Bestätigung zum Startpunkt loslaufen.", Request: new(TrainingAction.ReviewVideoStart, lineup)),
                new("Video stoppen & hochladen", "Beendet die Aufnahme und lädt das Video zum Lineup hoch.", Request: new(TrainingAction.ReviewVideoStop, lineup))
            ], Key: $"review-video:{lineup.Owner}:{lineup.Map}:{lineup.Name}")));
        items.Add(new("6. Prüfen & freigeben", "Die fünf Aufnahmen zuerst in der Website ansehen. Nur vollständige Reviews können offiziell freigegeben werden.",
            Page: new("6/6 · Freigabe", $"{slots.Length}/5 Medien vorhanden. Bilder und Video vor der Freigabe auf der Website prüfen.", [
                new("Offiziell freigeben", "Bestätigt die Prüfung von Wurf, Fotos und Video. Die Website prüft Rolle, Version und Vollständigkeit erneut.",
                    Page: new("Freigabe bestätigen", "Hast du alle vier Fotos und das Video auf der Website geprüft?", [
                        new("Abbrechen", Request: new(TrainingAction.Back)),
                        new("Geprüft und offiziell freigeben", Request: new(TrainingAction.ReviewApprove, lineup))
                    ], Key: $"review-approve:{lineup.Owner}:{lineup.Map}:{lineup.Name}"), Enabled: ReviewCaptureFiles.Slots.All(slots.Contains)),
                new("Überarbeitung anfragen", "Gibt die eingereichte Aufnahme an den Ersteller zurück.", Request: new(TrainingAction.ReviewReject, lineup), Enabled: lineup.ReviewStatus == "pending")
            ], Key: $"review-finish:{lineup.Owner}:{lineup.Map}:{lineup.Name}")));
        return new("Medien-Review", "Browser: dieses Lineup öffnen und Spielbild verbinden. Danach hier die Perspektiven aufnehmen. Dateien werden automatisch hochgeladen.", items,
            Key: $"review:{lineup.Owner}:{lineup.Map}:{lineup.Name}");
    }
}

public sealed partial class MatchZyNadesPlugin
{
    private readonly Dictionary<ulong, (string Session, string Command, long Expires)> _reviewPending = [];
    private string ReviewDirectory => Path.Combine(Path.GetDirectoryName(_libraryPath)!, "savednades.review");
    private bool HandleReviewAction(CCSPlayerController player, MenuRequest request)
    {
        if (request.Action is not (TrainingAction.ReviewPhoto or TrainingAction.ReviewVideoStart or TrainingAction.ReviewVideoStop or TrainingAction.ReviewHelp or TrainingAction.ReviewApprove or TrainingAction.ReviewReject)) return false;
        if (!CanWriteNades(player) || !TrainingEnabled) { Tell(player, "Der Medien-Review ist nur für Plattform-Admins im Training verfügbar."); return true; }
        var selected = request.Lineup;
        var lineup = ReadLibrary(player)?.FirstOrDefault(n => n.Owner == selected?.Owner && n.Map == selected.Map && n.Name == selected.Name);
        if (lineup == null || lineup.Official) { Tell(player, "Die Aufnahme ist nicht mehr verfügbar oder bereits offiziell."); return true; }
        if (request.Action is TrainingAction.ReviewApprove or TrainingAction.ReviewReject) {
            if (selected?.Revision != lineup.Revision) { Tell(player, "Das Lineup wurde geändert. Bitte den Review erneut öffnen und prüfen."); return true; }
            QueueReviewDecision(player, lineup, request.Action); return true;
        }
        if (request.Action == TrainingAction.ReviewHelp)
        {
            Tell(player, "Browser geöffnet lassen und CS2-Fenster freigeben. In Windows CS2 im randlosen Fenstermodus verwenden. Fotos benötigen einen ruhigen Bildausschnitt.");
            if (request.Setting == "front") {
                player.PrintToConsole("Vorderansicht im Training: thirdperson; cam_idealyaw 180; cam_idealdist 120\nDanach zurück: firstperson; cam_idealyaw 0");
                Tell(player, "Befehle für die Vorderansicht stehen in deiner Konsole. Lokal ausführen und vor dem Wurf zu firstperson zurückwechseln.");
            }
            return true;
        }
        try
        {
            var action = request.Action == TrainingAction.ReviewPhoto ? "photo" : request.Action == TrainingAction.ReviewVideoStart ? "video-start" : "video-stop";
            var command = ReviewCaptureFiles.Issue(ReviewDirectory, player.SteamID.ToString(), lineup, action, request.Setting, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            _reviewPending[player.SteamID] = (command.SessionId, command.Id, command.ExpiresAt + 180_000);
            if (_menus.TryGetValue(player.Slot, out var panel)) Hide(panel);
            Tell(player, action == "photo" ? "Foto wird nach drei Sekunden ausgelöst. Bildausschnitt ruhig halten und auf die Upload-Bestätigung warten." : action == "video-start" ? "Video startet nach drei Sekunden. Warte auf die Bestätigung, dann loslaufen." : "Video wird beendet und hochgeladen. Bitte warten.");
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidOperationException)
        { Tell(player, error is InvalidOperationException ? error.Message : "Aufnahmesignal konnte nicht gespeichert werden. Bitte erneut versuchen."); }
        return true;
    }
    private void ReadReviewResults()
    {
        foreach (var (actor, pending) in _reviewPending.ToArray())
        {
            var result = ReviewCaptureFiles.Read<ReviewResult>(Path.Combine(ReviewDirectory, actor.ToString(), "result.json"));
            var expired = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() > pending.Expires;
            if (result?.SessionId != pending.Session || result.CommandId != pending.Command) { if (!expired) continue; result = null; }
            _reviewPending.Remove(actor);
            var player = Utilities.GetPlayers().FirstOrDefault(p => p.IsValid && p.SteamID == actor);
            if (player != null) Tell(player, result != null ? MenuRenderer.Plain(result.Message, 180) : "Keine Aufnahmebestätigung erhalten. Bitte Browser-Verbindung und Upload prüfen.");
        }
    }
    private void QueueReviewDecision(CCSPlayerController player, NadeLineup lineup, TrainingAction action)
    {
        if (string.IsNullOrEmpty(lineup.Revision)) { Tell(player, "Lineup wird noch synchronisiert. Bitte kurz warten."); return; }
        var id = Guid.NewGuid().ToString("N");
        try {
            var directory = Path.Combine(Path.GetDirectoryName(_libraryPath)!, "savednades.requests");
            Directory.CreateDirectory(directory);
            var path = Path.Combine(directory, id + ".json");
            File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(new { id, actor = player.SteamID.ToString(), owner = lineup.Owner, map = lineup.Map, name = lineup.Name,
                revision = lineup.Revision, action = action == TrainingAction.ReviewApprove ? "approve" : "reject" }));
            File.Move(path + ".tmp", path);
            _pendingLineupRequests[id] = player.SteamID;
            Tell(player, "Review-Entscheidung gesendet. Die Website bestätigt Berechtigung und Freigabe.");
        } catch (Exception error) when (error is IOException or UnauthorizedAccessException) { Tell(player, "Review-Entscheidung konnte nicht gespeichert werden."); }
    }
}

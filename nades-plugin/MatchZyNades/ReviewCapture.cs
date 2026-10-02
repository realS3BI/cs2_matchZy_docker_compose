using System.Text.Json;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using Microsoft.Extensions.Logging;

namespace MatchZyNades;

public sealed record ReviewSession(string Id, string Actor, string Owner, string Map, string Name, long ExpiresAt, bool Recording = false);
public sealed record ReviewCommand(string Id, string SessionId, string Action, string Slot, long NotBefore, long ExpiresAt, string Presentation = "");
public sealed record ReviewPhotoRequest(string Id, string SessionId, string Slot, long ExpiresAt);
public sealed record ReviewCaptured(string SessionId, string CommandId);
public sealed record ReviewResult(string SessionId, string CommandId, bool Ok, string Message);

public static class ReviewCaptureFiles
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static readonly string[] Slots = ["aim", "position", "front", "effect", "video"];
    public static ReviewCommand Issue(string directory, string actor, NadeLineup lineup, string action, string slot, long now, string? commandId = null, string presentation = "")
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
        if (commandId != null && (!Guid.TryParseExact(commandId, "N", out _) || commandId.Length != 32))
            throw new InvalidOperationException("Ungültige Foto-Anfrage.");
        var command = new ReviewCommand(commandId ?? Guid.NewGuid().ToString("N"), session.Id, action, slot,
            now + (action == "video-stop" ? 0 : 3000), now + 30_000, presentation);
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
            ("front", "Vorderansicht", "Lädt den gespeicherten Start und stellt automatisch eine feste Vorderansicht ohne Fadenkreuz ein."),
            ("effect", "Wirkung", "Granate selbst werfen, mit Noclip zum Ziel fliegen und die entfaltete Wirkung zeigen.")
        };
        var items = definitions.Select((step, i) => new MenuItem($"{i + 1}. {step.Item2}{(slots.Contains(step.Item1) ? " [Foto vorhanden]" : "")}", step.Item3,
            Page: new($"{i + 1}/6 · {step.Item2}", step.Item3, [
                new("Foto aufnehmen & hochladen", "Blendet HUD und Panel aus und stellt das Review-Foto ein. Nach dem Foto kommen HUD, Fadenkreuz und diese Menüseite zurück. Der Upload läuft im Hintergrund.", Request: new(TrainingAction.ReviewPhoto, lineup, Setting: step.Item1)),
                new("Lineup laden", "Teleportiert dich zum gespeicherten Start und richtet den Blick aus. Danach die gewünschte Perspektive selbst einstellen.", Request: new(TrainingAction.LoadLineup, lineup)),
                new("Aufnahme-Hilfe anzeigen", step.Item3, Request: new(TrainingAction.ReviewHelp, lineup, Setting: step.Item1))
            ], Key: $"review-{step.Item1}:{lineup.Owner}:{lineup.Map}:{lineup.Name}"))).ToList();
        items.Add(new($"5. Video{(slots.Contains("video") ? " [Vorhanden]" : "")}", "Zum Start laufen, zielen, werfen und mit Noclip die Wirkung zeigen. Aufnahme erfolgt im Browser, ohne Ton, maximal zwei Minuten.",
            Page: new("5/6 · Video", "Nach dem Start drei Sekunden warten. Panel wird ausgeblendet. Mit F8 stoppen, sobald der Review-Bind eingerichtet ist.", [
                new("Video starten", "Browser-Aufnahme starten. Erst nach der Chat-Bestätigung zum Startpunkt loslaufen.", Request: new(TrainingAction.ReviewVideoStart, lineup)),
                new("Video stoppen & hochladen", "Beendet die Aufnahme und lädt das Video hoch. Bind: bind F8 css_training_review_stop", Request: new(TrainingAction.ReviewVideoStop, lineup))
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
    private sealed record PendingReview(string Session, string Command, string Action, long Expires);
    private sealed record ActivePhoto(string Session, string Command, long Expires, ReviewPhotoPresentation Presentation, MenuSession? Panel, bool Focused);
    private readonly Dictionary<ulong, PendingReview> _reviewPending = [];
    private readonly Dictionary<ulong, ActivePhoto> _reviewPhotos = [];
    private readonly Dictionary<ulong, string> _reviewRequests = [];
    private string ReviewDirectory => Path.Combine(Path.GetDirectoryName(_libraryPath)!, "savednades.review");
    private bool HandleReviewAction(CCSPlayerController player, MenuRequest request, string? commandId = null)
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
            Tell(player, "Fotos: HUD wird ausgeblendet, Vorderansicht automatisch eingestellt. F8 stoppt das Video nach einmaliger Einrichtung: bind F8 css_training_review_stop");
            return true;
        }
        var action = request.Action == TrainingAction.ReviewPhoto ? "photo" : request.Action == TrainingAction.ReviewVideoStart ? "video-start" : "video-stop";
        ReviewPhotoPresentation? presentation = null;
        MenuSession? panel = null;
        var focused = false;
        try
        {
            if (_reviewPhotos.ContainsKey(player.SteamID)) throw new InvalidOperationException("Das vorige Foto wird noch aufgenommen.");
            if (action == "photo" && !Alive(player)) throw new InvalidOperationException("Bitte zuerst spawnen.");
            _menus.TryGetValue(player.Slot, out panel);
            focused = panel?.Focused == true;
            // Validate the session before changing anything in the game.
            var session = ReviewCaptureFiles.Read<ReviewSession>(Path.Combine(ReviewDirectory, player.SteamID.ToString(), "session.json"));
            if (session == null || session.Actor != player.SteamID.ToString() || session.ExpiresAt <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() ||
                session.Owner != lineup.Owner || session.Map != lineup.Map || session.Name != lineup.Name)
                throw new InvalidOperationException("Öffne dieses Lineup im Browser und verbinde das Spielbild.");
            if (action == "photo" && session.Recording) throw new InvalidOperationException("Bitte zuerst das laufende Video stoppen.");
            if (panel != null) Hide(panel);
            if (action == "photo") {
                if (request.Setting == "front") {
                    LoadLineup(player, lineup);
                    var origin = player.PlayerPawn.Value?.AbsOrigin;
                    if (origin == null || Math.Abs(origin.X - lineup.Position.X) > 2 || Math.Abs(origin.Y - lineup.Position.Y) > 2 || Math.Abs(origin.Z - lineup.Position.Z) > 5)
                        throw new InvalidOperationException("Der Startpunkt konnte nicht geladen werden. Bitte das Lineup erneut laden.");
                }
                presentation = new ReviewPhotoPresentation(player.PlayerPawn.Value!, request.Setting, lineup.Angles.Y);
            }
            var command = ReviewCaptureFiles.Issue(ReviewDirectory, player.SteamID.ToString(), lineup, action, request.Setting,
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), commandId, presentation == null ? "" : "review-v1");
            _reviewPending[player.SteamID] = new(command.SessionId, command.Id, action, command.ExpiresAt + 180_000);
            if (presentation != null) {
                _reviewPhotos[player.SteamID] = new(command.SessionId, command.Id, command.ExpiresAt, presentation, panel, focused);
                // Chat stays silent during a photo, including the countdown.
            } else Tell(player, action == "video-start" ? "Video startet nach drei Sekunden. Warte auf die Bestätigung, dann loslaufen. F8 stoppt mit eingerichtetem Review-Bind." : "Video wird beendet und hochgeladen. Bitte warten.");
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            presentation?.Dispose();
            RestoreReviewPanel(player, panel, focused);
            var message = error is InvalidOperationException ? error.Message : "Aufnahmesignal konnte nicht gespeichert werden. Bitte erneut versuchen.";
            if (commandId != null) WriteReviewFailure(player.SteamID, commandId, message, requestOnly: true);
            Logger.LogWarning(error, "Review capture failed for {SteamId}", player.SteamID);
            Tell(player, message);
        }
        return true;
    }

    private void RestoreReviewPanel(CCSPlayerController player, MenuSession? panel, bool focused)
    {
        if (panel == null || !Alive(player) || !TrainingEnabled || !CanWriteNades(player) ||
            !_menus.TryGetValue(player.Slot, out var current) || !ReferenceEquals(current, panel) ||
            player.PlayerPawn.Value!.EntityHandle.Raw != panel.Pawn.EntityHandle.Raw) return;
        panel.Visible = true;
        SetFocus(panel, focused);
        panel.NextDraw = 0;
    }
    private void RestoreReviewPhoto(ulong actor, bool reopen)
    {
        if (!_reviewPhotos.Remove(actor, out var photo)) return;
        photo.Presentation.Dispose();
        var player = Utilities.GetPlayers().FirstOrDefault(p => p.IsValid && p.SteamID == actor);
        if (reopen && player != null) RestoreReviewPanel(player, photo.Panel, photo.Focused);
    }
    private void CancelReview(CCSPlayerController player)
    {
        if (_reviewPhotos.TryGetValue(player.SteamID, out var photo)) WriteReviewFailure(player.SteamID, photo.Command, "Foto abgebrochen. Bitte erneut aufnehmen.");
        RestoreReviewPhoto(player.SteamID, false);
        _reviewPending.Remove(player.SteamID);
        _reviewRequests.Remove(player.SteamID);
    }
    private void ReadReviewResults()
    {
        ReadBrowserPhotoRequests();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        foreach (var (actor, photo) in _reviewPhotos.ToArray()) {
            var folder = Path.Combine(ReviewDirectory, actor.ToString());
            var captured = ReviewCaptureFiles.Read<ReviewCaptured>(Path.Combine(folder, "captured.json"));
            var session = ReviewCaptureFiles.Read<ReviewSession>(Path.Combine(folder, "session.json"));
            var player = Utilities.GetPlayers().FirstOrDefault(p => p.IsValid && p.SteamID == actor);
            var valid = TrainingEnabled && Alive(player) && CanWriteNades(player!) && player!.PlayerPawn.Value!.EntityHandle.Raw == photo.Presentation.PawnHandle;
            var finished = captured?.SessionId == photo.Session && captured.CommandId == photo.Command;
            var cancelled = !valid || photo.Expires <= now || session?.Id != photo.Session || session.ExpiresAt <= now;
            if (cancelled && !finished) WriteReviewFailure(actor, photo.Command, "Foto abgebrochen oder Zeitlimit erreicht. Bitte erneut aufnehmen.");
            if (cancelled || finished)
                RestoreReviewPhoto(actor, valid);
        }
        foreach (var (actor, pending) in _reviewPending.ToArray())
        {
            var result = ReviewCaptureFiles.Read<ReviewResult>(Path.Combine(ReviewDirectory, actor.ToString(), "result.json"));
            var expired = now > pending.Expires;
            if (result?.SessionId != pending.Session || result.CommandId != pending.Command) { if (!expired) continue; result = null; }
            _reviewPending.Remove(actor);
            RestoreReviewPhoto(actor, true);
            var player = Utilities.GetPlayers().FirstOrDefault(p => p.IsValid && p.SteamID == actor);
            if (player != null) {
                if (pending.Action == "video-stop" && _menus.TryGetValue(player.Slot, out var panel)) RestoreReviewPanel(player, panel, true);
                Tell(player, result != null ? MenuRenderer.Plain(result.Message, 180) : "Keine Aufnahmebestätigung erhalten. Bitte Browser-Verbindung und Upload prüfen.");
            }
        }
    }
    private void ReadBrowserPhotoRequests()
    {
        if (!TrainingEnabled) return;
        foreach (var player in Utilities.GetPlayers().Where(p => Alive(p) && CanWriteNades(p))) {
            var folder = Path.Combine(ReviewDirectory, player.SteamID.ToString());
            var request = ReviewCaptureFiles.Read<ReviewPhotoRequest>(Path.Combine(folder, "request.json"));
            if (request == null || request.ExpiresAt <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() ||
                _reviewRequests.GetValueOrDefault(player.SteamID) == request.Id || !Guid.TryParseExact(request.Id, "N", out _) ||
                !ReviewCaptureFiles.Slots.Take(4).Contains(request.Slot)) continue;
            _reviewRequests[player.SteamID] = request.Id;
            var session = ReviewCaptureFiles.Read<ReviewSession>(Path.Combine(folder, "session.json"));
            if (session?.Id != request.SessionId || session.Actor != player.SteamID.ToString()) continue;
            var previous = ReviewCaptureFiles.Read<ReviewCommand>(Path.Combine(folder, "command.json"));
            if (previous?.Id == request.Id) continue;
            var lineup = ReadLibrary(player, quiet: true)?.FirstOrDefault(n => n.Owner == session.Owner && n.Map == session.Map && n.Name == session.Name);
            if (lineup == null || lineup.Official) { WriteReviewFailure(player.SteamID, request.Id, "Dieses Lineup ist nicht mehr für Fotos verfügbar.", requestOnly: true); continue; }
            HandleReviewAction(player, new(TrainingAction.ReviewPhoto, lineup, Setting: request.Slot), request.Id);
        }
    }
    private void WriteReviewFailure(ulong actor, string commandId, string message, bool requestOnly = false)
    {
        var folder = Path.Combine(ReviewDirectory, actor.ToString());
        var session = ReviewCaptureFiles.Read<ReviewSession>(Path.Combine(folder, "session.json"));
        if (session == null) return;
        try {
            var path = Path.Combine(folder, requestOnly ? "request-result.json" : "result.json");
            File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(new ReviewResult(session.Id, commandId, false, message), ReviewCaptureFiles.Json));
            File.Move(path + ".tmp", path, true);
        } catch (Exception error) when (error is IOException or UnauthorizedAccessException) { Logger.LogWarning(error, "Could not write review failure"); }
    }

    [ConsoleCommand("css_training_review_stop", "Stop and upload the browser review video")]
    public void OnReviewVideoStop(CCSPlayerController? player, CommandInfo command)
    {
        if (player is not { IsValid: true, IsBot: false } || !TrainingEnabled || !CanWriteNades(player)) return;
        var session = ReviewCaptureFiles.Read<ReviewSession>(Path.Combine(ReviewDirectory, player!.SteamID.ToString(), "session.json"));
        var lineup = session == null ? null : ReadLibrary(player, quiet: true)?.FirstOrDefault(n => n.Owner == session.Owner && n.Map == session.Map && n.Name == session.Name);
        if (lineup == null) { Tell(player, "Bitte zuerst das Spielbild auf der Review-Seite verbinden."); return; }
        HandleReviewAction(player, new(TrainingAction.ReviewVideoStop, lineup));
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

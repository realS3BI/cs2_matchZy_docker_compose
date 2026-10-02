using System.Text.Json;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Utils;
using Microsoft.Extensions.Logging;

namespace MatchZyNades;

public sealed record ReviewSession(string Id, string Actor, string Owner, string Map, string Name, long ExpiresAt, bool Recording = false, bool FollowPanel = false);
public sealed record ReviewCommand(string Id, string SessionId, string Action, string Slot, long NotBefore, long ExpiresAt, string Presentation = "", string Owner = "", string Map = "", string Name = "", float? CameraPitch = null);
public sealed record ReviewPhotoRequest(string Id, string SessionId, string Slot, long ExpiresAt, string Action = "photo", string Owner = "", string Map = "", string Name = "");
public sealed record ReviewSelection(string Id, string SessionId, string Actor, string Owner, string Map, string Name, string Step);
public sealed record ReviewCaptured(string SessionId, string CommandId);
public sealed record ReviewResult(string SessionId, string CommandId, bool Ok, string Message);

public static class ReviewCaptureFiles
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static readonly string[] Slots = ["aim", "position", "front", "effect", "video"];
    public static bool ValidRequest(ReviewPhotoRequest request) => Guid.TryParseExact(request.Id, "N", out _) && request.Id.Length == 32 &&
        (request.Action == "photo" ? Slots.Take(4).Contains(request.Slot) : (request.Action is "video-start" or "video-stop") && request.Slot == "video");
    public static ReviewCommand Issue(string directory, string actor, NadeLineup lineup, string action, string slot, long now, string? commandId = null, string presentation = "", float? cameraPitch = null)
    {
        if (actor.Length != 17 || !actor.All(char.IsAsciiDigit) || lineup.Official ||
            (action == "photo" ? !Slots.Take(4).Contains(slot) : action is not ("video-start" or "video-stop")))
            throw new InvalidOperationException("Diese Review-Aktion ist nicht verfügbar.");
        var folder = Path.Combine(directory, actor);
        var session = Read<ReviewSession>(Path.Combine(folder, "session.json"));
        if (session == null || session.Actor != actor || session.ExpiresAt <= now || !Guid.TryParse(session.Id, out _) ||
            !session.FollowPanel && (session.Owner != lineup.Owner || session.Map != lineup.Map || session.Name != lineup.Name))
            throw new InvalidOperationException("Öffne Server → Reviews, verbinde das Spielbild und lasse die Seite geöffnet.");
        var pending = Read<ReviewCommand>(Path.Combine(folder, "command.json"));
        var result = Read<ReviewResult>(Path.Combine(folder, "result.json"));
        if (pending?.SessionId == session.Id && pending.ExpiresAt + 180_000 > now && result?.CommandId != pending.Id)
            throw new InvalidOperationException("Die vorige Aufnahme wird noch verarbeitet. Bitte kurz warten.");
        if (commandId != null && (!Guid.TryParseExact(commandId, "N", out _) || commandId.Length != 32))
            throw new InvalidOperationException("Ungültige Aufnahme-Anfrage.");
        var command = new ReviewCommand(commandId ?? Guid.NewGuid().ToString("N"), session.Id, action, slot,
            now + (action == "video-stop" ? 0 : 1000), now + 30_000, presentation, lineup.Owner, lineup.Map, lineup.Name, cameraPitch);
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
    public static MenuPage Create(NadeLineup lineup, bool canEdit = false)
    {
        var slots = lineup.ReviewMediaSlots ?? [];
        var definitions = new[] {
            ("aim", "Ausrichtung", "Zeige das Fadenkreuz auf dem exakten Lineup-Punkt. Lineup laden stellt Position und Blickrichtung ein."),
            ("position", "Standposition", "Zeige den Boden und die Kanten, an denen du stehst. Stelle den Bildausschnitt selbst ein."),
            ("front", "Vorderansicht", "Zeigt dich am gespeicherten Start von vorne, ohne Fadenkreuz. Windows-App: echte Third-Person-Kamera. Browser: Kamera vorher per Konsole einstellen."),
            ("effect", "Wirkung", "Teleportiert dich beim Öffnen zum gespeicherten Ziel und schaltet Noclip ein. Herausfliegen, den Bildausschnitt wählen und die Wirkung ohne Fadenkreuz aufnehmen.")
        };
        var items = definitions.Select((step, i) => new MenuItem($"{i + 1}. {step.Item2}{(slots.Contains(step.Item1) ? " [Foto vorhanden]" : "")}", step.Item3,
            Page: new($"{i + 1}/7 · {step.Item2}", step.Item3, [
                new("Foto aufnehmen & hochladen", "Die Windows-App stellt HUD, Waffe und Fadenkreuz automatisch ein. Im Browser vorher der Vorbereitung folgen. Nach dem Foto öffnet sich diese Menüseite wieder.", Request: new(TrainingAction.ReviewPhoto, lineup, Setting: step.Item1)),
                new("Lineup laden", "Teleportiert dich zum gespeicherten Start und richtet den Blick aus. Danach die gewünschte Perspektive selbst einstellen.", Request: new(TrainingAction.LoadLineup, lineup)),
                .. (step.Item1 == "effect" ? new MenuItem[] {
                    new("Letzte Granate erneut werfen", "Wiederholt den letzten Wurf auf dem Server mit sv_rethrow_last_grenade. Du bleibst an deiner Beobachtungsposition; ohne gespeicherten Wurf zuerst eine Granate werfen.", Request: new(TrainingAction.ReviewRethrow)),
                    new("Zum Ziel teleportieren", "Kehrt zum Ziel der Granate zurück und schaltet Noclip ein. Fehlt der Zielpunkt, zuerst das Lineup laden und werfen.", Request: new(TrainingAction.ReviewTeleportEffect, lineup)),
                    new("Noclip umschalten", "Nach dem Flug die Panel-Steuerung mit KP_0 öffnen und das Foto aufnehmen.", Request: new(TrainingAction.Noclip))
                } : []),
                new("Aufnahme-Hilfe anzeigen", step.Item3, Request: new(TrainingAction.ReviewHelp, lineup, Setting: step.Item1))
            ], Key: $"review-{step.Item1}:{lineup.Owner}:{lineup.Map}:{lineup.Name}", ReviewLineup: lineup, ReviewStep: step.Item1),
            Request: step.Item1 == "effect" ? new(TrainingAction.ReviewTeleportEffect, lineup) : null)).ToList();
        items.Add(new($"5. Video{(slots.Contains("video") ? " [Vorhanden]" : "")}", "Zum Start laufen, zielen, werfen und mit Noclip die Wirkung zeigen. Aufnahme in Playbook, ohne Ton, maximal zwei Minuten.",
            Page: new("5/7 · Video", "Nach dem Start eine Sekunde warten. Panel wird ausgeblendet. Die Windows-App aktiviert F8 automatisch; im Browser ist der Review-Bind nötig.", [
                new("Video starten", "Playbook-Aufnahme starten. Erst nach der Chat-Bestätigung zum Startpunkt loslaufen.", Request: new(TrainingAction.ReviewVideoStart, lineup)),
                new("Video stoppen & hochladen", "Beendet die Aufnahme und lädt das Video hoch. Windows-App: F8. Browser: bind F8 css_training_review_stop", Request: new(TrainingAction.ReviewVideoStop, lineup)),
                new("Lineup laden", "Lädt den gespeicherten Start und die Blickrichtung für den nächsten Versuch.", Request: new(TrainingAction.LoadLineup, lineup)),
                new("Noclip umschalten", "Zum Ziel fliegen und die Wirkung zeigen.", Request: new(TrainingAction.Noclip))
            ], Key: $"review-video:{lineup.Owner}:{lineup.Map}:{lineup.Name}", ReviewLineup: lineup, ReviewStep: "video")));
        var missingDetails = MissingDetails(lineup);
        items.Add(new($"6. Angaben{(missingDetails.Length == 0 ? " [Vollständig]" : " [Offen]")}", "Name, Beschreibung, Startposition und Endposition prüfen und ergänzen.",
            Page: new("6/7 · Angaben", canEdit ? "Feld auswählen, Chat öffnen und den Wert eingeben. Mit abbrechen beenden." : "Nur der Ersteller kann diese Angaben bearbeiten. Fehlende Angaben vor der Freigabe ergänzen lassen.", [
                new($"Name: {lineup.Title}", "Anzeigenamen im Chat eingeben.", Request: new(TrainingAction.EditName, lineup), Enabled: canEdit),
                new($"Beschreibung: {(string.IsNullOrWhiteSpace(lineup.Description) ? "Offen" : lineup.Description)}", "Beschreibung im Chat eingeben.", Request: new(TrainingAction.EditDescription, lineup), Enabled: canEdit),
                new($"Startposition: {(string.IsNullOrWhiteSpace(lineup.ThrowFromTitle) ? "Offen" : lineup.ThrowFromTitle)}", "Bezeichnung des Abwurfbereichs im Chat eingeben.", Request: new(TrainingAction.EditField, lineup, Setting: "throwFromTitle"), Enabled: canEdit),
                new($"Endposition: {(string.IsNullOrWhiteSpace(lineup.ThrowToTitle) ? "Offen" : lineup.ThrowToTitle)}", "Bezeichnung des Zielbereichs im Chat eingeben.", Request: new(TrainingAction.EditField, lineup, Setting: "throwToTitle"), Enabled: canEdit)
            ], Key: $"review-details:{lineup.Owner}:{lineup.Map}:{lineup.Name}", ReviewLineup: lineup, ReviewStep: "details")));
        items.Add(new("7. Prüfen & freigeben", "Die fünf Aufnahmen zuerst in der Website ansehen. Nur vollständige Reviews können offiziell freigegeben werden.",
            Page: new("7/7 · Freigabe", $"{slots.Length}/5 Medien vorhanden. Angaben: {(missingDetails.Length == 0 ? "vollständig" : "Fehlt: " + string.Join(", ", missingDetails))}. Bilder und Video vor der Freigabe auf der Website prüfen.", [
                new("Offiziell freigeben", "Bestätigt die Prüfung von Wurf, Fotos und Video. Die Website prüft Rolle, Version und Vollständigkeit erneut.",
                    Page: new("Freigabe bestätigen", "Hast du alle vier Fotos und das Video auf der Website geprüft?", [
                        new("Abbrechen", Request: new(TrainingAction.Back)),
                        new("Geprüft und offiziell freigeben", Request: new(TrainingAction.ReviewApprove, lineup))
                    ], Key: $"review-approve:{lineup.Owner}:{lineup.Map}:{lineup.Name}", ReviewLineup: lineup, ReviewStep: "finish"), Enabled: ReviewCaptureFiles.Slots.All(slots.Contains) && missingDetails.Length == 0),
                new("Überarbeitung anfragen", "Gibt die eingereichte Aufnahme an den Ersteller zurück.", Request: new(TrainingAction.ReviewReject, lineup), Enabled: lineup.ReviewStatus == "pending")
            ], Key: $"review-finish:{lineup.Owner}:{lineup.Map}:{lineup.Name}", ReviewLineup: lineup, ReviewStep: "finish")));
        return new("Medien-Review", "Server → Reviews öffnen, CS2 starten und Spielbild verbinden. Lineup und Schritt erscheinen dort automatisch. Danach den Review hier steuern.", items,
            Key: $"review:{lineup.Owner}:{lineup.Map}:{lineup.Name}", ReviewLineup: lineup, ReviewStep: "overview");
    }
    public static string[] MissingDetails(NadeLineup lineup) => new[] {
        ("Name", lineup.Title), ("Beschreibung", lineup.Description),
        ("Startposition", lineup.ThrowFromTitle), ("Endposition", lineup.ThrowToTitle)
    }.Where(field => string.IsNullOrWhiteSpace(field.Item2)).Select(field => field.Item1).ToArray();

}

public sealed partial class MatchZyNadesPlugin
{
    private sealed record PendingReview(string Session, string Command, string Action, long Expires);
    private sealed record ActivePhoto(string Session, string Command, long Expires, ReviewPhotoPresentation Presentation, MenuSession? Panel, bool Focused);
    private sealed record ActiveVideo(string Session, MenuSession? Panel, bool Focused, NadeLineup Lineup);
    private readonly Dictionary<ulong, PendingReview> _reviewPending = [];
    private readonly Dictionary<ulong, ActivePhoto> _reviewPhotos = [];
    private readonly Dictionary<ulong, ActiveVideo> _reviewVideos = [];
    private readonly Dictionary<ulong, string> _reviewRequests = [];
    private string ReviewDirectory => Path.Combine(Path.GetDirectoryName(_libraryPath)!, "savednades.review");
    private bool HandleReviewAction(CCSPlayerController player, MenuRequest request, string? commandId = null)
    {
        if (request.Action is not (TrainingAction.ReviewPhoto or TrainingAction.ReviewVideoStart or TrainingAction.ReviewVideoStop or TrainingAction.ReviewHelp or TrainingAction.ReviewApprove or TrainingAction.ReviewReject or TrainingAction.ReviewTeleportEffect)) return false;
        if (!CanWriteNades(player) || !TrainingEnabled) { Tell(player, "Der Medien-Review ist nur für Plattform-Admins im Training verfügbar."); return true; }
        var selected = request.Lineup;
        var lineup = ReadLibrary(player)?.FirstOrDefault(n => n.Owner == selected?.Owner && n.Map == selected.Map && n.Name == selected.Name);
        if (lineup == null || lineup.Official) { Tell(player, "Die Aufnahme ist nicht mehr verfügbar oder bereits offiziell."); return true; }
        if (request.Action == TrainingAction.ReviewTeleportEffect) {
            if (!Alive(player)) { Tell(player, "Bitte zuerst spawnen."); return true; }
            if (_reviewPhotos.ContainsKey(player.SteamID)) { Tell(player, "Das vorige Foto wird noch aufgenommen."); return true; }
            // A freshly measured landing point is usable before the website has synced it.
            var captures = ReviewCaptureFiles.Read<NadeCapture[]>(Path.Combine(Path.GetDirectoryName(_libraryPath)!, "savednades.captures.json"));
            var target = ReviewEffectTarget.Resolve(lineup, captures);
            if (target is not { } point) {
                Tell(player, "Für dieses Lineup fehlt der Zielpunkt. Zuerst Lineup laden und die Granate werfen, dann Zum Ziel teleportieren wählen.");
                return true;
            }
            ReleaseControl(player.Slot);
            var pawn = player.PlayerPawn.Value!;
            pawn.MoveType = pawn.ActualMoveType = MoveType_t.MOVETYPE_NOCLIP;
            Utilities.SetStateChanged(pawn, "CBaseEntity", "m_MoveType");
            pawn.Teleport(new Vector(point.X, point.Y, point.Z), null, new Vector(0, 0, 0));
            Tell(player, "Zum Ziel teleportiert. Noclip ist eingeschaltet: Herausfliegen und den Bildausschnitt wählen. KP_0 öffnet die Panel-Steuerung.");
            return true;
        }
        if (request.Action is TrainingAction.ReviewApprove or TrainingAction.ReviewReject) {
            if (selected?.Revision != lineup.Revision) { Tell(player, "Das Lineup wurde geändert. Bitte den Review erneut öffnen und prüfen."); return true; }
            if (request.Action == TrainingAction.ReviewApprove) {
                var missing = ReviewMenu.MissingDetails(lineup);
                if (missing.Length > 0 || !ReviewCaptureFiles.Slots.All((lineup.ReviewMediaSlots ?? []).Contains)) {
                    Tell(player, "Vor der Freigabe alle fünf Medien und Angaben ergänzen" + (missing.Length > 0 ? ": " + string.Join(", ", missing) : "."));
                    return true;
                }
            }
            QueueReviewDecision(player, lineup, request.Action); return true;
        }
        if (request.Action == TrainingAction.ReviewHelp)
        {
            Tell(player, "Playbook-App oder Browser geöffnet lassen und Spielbild verbinden. Die Windows-App übernimmt Fensterausschnitt, HUD, Waffe und Fadenkreuz automatisch. Im Browser der Vorbereitung auf der Website folgen.");
            Tell(player, "Die Vorderansicht wird automatisch eingestellt. Windows-App: F8 stoppt das Video. Browser: einmal bind F8 css_training_review_stop einrichten.");
            return true;
        }
        var action = request.Action == TrainingAction.ReviewPhoto ? "photo" : request.Action == TrainingAction.ReviewVideoStart ? "video-start" : "video-stop";
        ReviewPhotoPresentation? presentation = null;
        ReviewCrouchHold? crouch = null;
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
                !session.FollowPanel && (session.Owner != lineup.Owner || session.Map != lineup.Map || session.Name != lineup.Name))
                throw new InvalidOperationException("Öffne Server → Reviews und verbinde das Spielbild.");
            if (action == "photo" && session.Recording) throw new InvalidOperationException("Bitte zuerst das laufende Video stoppen.");
            if (action == "photo" && request.Setting == "front")
                crouch = new(new ReviewPawnCrouchState(player.PlayerPawn.Value!, (player.Buttons & PlayerButtons.Duck) != 0));
            if (panel != null) Hide(panel);
            if (action == "photo") {
                if (request.Setting == "front") {
                    var wasNoclip = player.PlayerPawn.Value!.MoveType == MoveType_t.MOVETYPE_NOCLIP;
                    LoadLineup(player, lineup);
                    if (wasNoclip) {
                        var pawn = player.PlayerPawn.Value!;
                        pawn.MoveType = pawn.ActualMoveType = MoveType_t.MOVETYPE_NOCLIP;
                        Utilities.SetStateChanged(pawn, "CBaseEntity", "m_MoveType");
                    }
                    var origin = player.PlayerPawn.Value?.AbsOrigin;
                    if (origin == null || Math.Abs(origin.X - lineup.Position.X) > 2 || Math.Abs(origin.Y - lineup.Position.Y) > 2 || Math.Abs(origin.Z - lineup.Position.Z) > 5)
                        throw new InvalidOperationException("Der Startpunkt konnte nicht geladen werden. Bitte das Lineup erneut laden.");
                }
                presentation = new ReviewPhotoPresentation(player.PlayerPawn.Value!, request.Setting, crouch);
            }
            var command = ReviewCaptureFiles.Issue(ReviewDirectory, player.SteamID.ToString(), lineup, action, request.Setting,
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), commandId, presentation == null ? "" : "review-v6", request.Setting == "front" ? presentation?.CameraPitch : null);
            _reviewPending[player.SteamID] = new(command.SessionId, command.Id, action, command.ExpiresAt + 180_000);
            if (presentation != null) {
                _reviewPhotos[player.SteamID] = new(command.SessionId, command.Id, command.ExpiresAt, presentation, panel, focused);
                // Chat stays silent during a photo, including the countdown.
            } else {
                if (action == "video-start") _reviewVideos[player.SteamID] = new(command.SessionId, panel, focused, lineup);
                Tell(player, action == "video-start" ? "Video startet nach einer Sekunde. Warte auf die Bestätigung, dann loslaufen. F8 stoppt mit eingerichtetem Review-Bind." : "Video wird beendet und hochgeladen. Bitte warten.");
            }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            presentation?.Dispose();
            crouch?.Dispose();
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
    private void RestoreReviewVideo(ulong actor, bool reopen)
    {
        if (!_reviewVideos.Remove(actor, out var video)) return;
        var player = Utilities.GetPlayers().FirstOrDefault(p => p.IsValid && p.SteamID == actor);
        if (reopen && player != null) RestoreReviewPanel(player, video.Panel, video.Focused);
    }
    private void CancelReview(CCSPlayerController player)
    {
        if (_reviewPhotos.TryGetValue(player.SteamID, out var photo)) WriteReviewFailure(player.SteamID, photo.Command, "Foto abgebrochen. Bitte erneut aufnehmen.");
        RestoreReviewPhoto(player.SteamID, false);
        RestoreReviewVideo(player.SteamID, false);
        _reviewPending.Remove(player.SteamID);
        _reviewRequests.Remove(player.SteamID);
    }
    private void ReadReviewResults()
    {
        SyncReviewSelections();
        ReadBrowserCaptureRequests();
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
            if (pending.Action == "video-stop" || (pending.Action == "video-start" && result?.Ok != true)) RestoreReviewVideo(actor, true);
            var player = Utilities.GetPlayers().FirstOrDefault(p => p.IsValid && p.SteamID == actor);
            if (player != null) {
                Tell(player, result != null ? MenuRenderer.Plain(result.Message, 180) : "Keine Aufnahmebestätigung erhalten. Bitte Browser-Verbindung und Upload prüfen.");
            }
        }
        foreach (var (actor, video) in _reviewVideos.ToArray()) {
            var folder = Path.Combine(ReviewDirectory, actor.ToString());
            var session = ReviewCaptureFiles.Read<ReviewSession>(Path.Combine(folder, "session.json"));
            var command = ReviewCaptureFiles.Read<ReviewCommand>(Path.Combine(folder, "command.json"));
            var captured = ReviewCaptureFiles.Read<ReviewCaptured>(Path.Combine(folder, "captured.json"));
            var player = Utilities.GetPlayers().FirstOrDefault(p => p.IsValid && p.SteamID == actor);
            var finished = (command?.Action is "video-start" or "video-stop") && command.SessionId == video.Session && captured?.SessionId == video.Session && captured.CommandId == command.Id;
            if (finished || session?.Id != video.Session || session.ExpiresAt <= now || !TrainingEnabled || !Alive(player) || !CanWriteNades(player!))
                RestoreReviewVideo(actor, true);
        }
    }
    private void SyncReviewSelections()
    {
        if (!TrainingEnabled) return;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        foreach (var panel in _menus.Values) {
            var player = panel.Player;
            var page = panel.Menu.Current;
            if (!player.IsValid || !CanWriteNades(player) || page.ReviewLineup is not { } lineup) continue;
            var folder = Path.Combine(ReviewDirectory, player.SteamID.ToString());
            var session = ReviewCaptureFiles.Read<ReviewSession>(Path.Combine(folder, "session.json"));
            if (session == null || session.Actor != player.SteamID.ToString() || session.ExpiresAt <= now) continue;
            var previous = ReviewCaptureFiles.Read<ReviewSelection>(Path.Combine(folder, "selection.json"));
            if (previous?.SessionId == session.Id && previous.Owner == lineup.Owner && previous.Map == lineup.Map && previous.Name == lineup.Name && previous.Step == page.ReviewStep) continue;
            try {
                var selection = new ReviewSelection(Guid.NewGuid().ToString("N"), session.Id, session.Actor, lineup.Owner, lineup.Map, lineup.Name, page.ReviewStep);
                var path = Path.Combine(folder, "selection.json");
                File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(selection, ReviewCaptureFiles.Json));
                File.Move(path + ".tmp", path, true);
            } catch (Exception error) when (error is IOException or UnauthorizedAccessException) {
                Logger.LogWarning(error, "Could not sync review selection for {SteamId}", player.SteamID);
            }
        }
    }
    private void ReadBrowserCaptureRequests()
    {
        if (!TrainingEnabled) return;
        foreach (var player in Utilities.GetPlayers().Where(p => p.IsValid && CanWriteNades(p))) {
            var folder = Path.Combine(ReviewDirectory, player.SteamID.ToString());
            var request = ReviewCaptureFiles.Read<ReviewPhotoRequest>(Path.Combine(folder, "request.json"));
            if (request == null || request.ExpiresAt <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() ||
                _reviewRequests.GetValueOrDefault(player.SteamID) == request.Id || !ReviewCaptureFiles.ValidRequest(request)) continue;
            _reviewRequests[player.SteamID] = request.Id;
            var session = ReviewCaptureFiles.Read<ReviewSession>(Path.Combine(folder, "session.json"));
            if (session?.Id != request.SessionId || session.Actor != player.SteamID.ToString()) continue;
            var previous = ReviewCaptureFiles.Read<ReviewCommand>(Path.Combine(folder, "command.json"));
            if (previous?.Id == request.Id) continue;
            var lineup = ReadLibrary(player, quiet: true)?.FirstOrDefault(n => n.Owner == (session.FollowPanel ? request.Owner : session.Owner) && n.Map == (session.FollowPanel ? request.Map : session.Map) && n.Name == (session.FollowPanel ? request.Name : session.Name));
            if (lineup == null || lineup.Official) { WriteReviewFailure(player.SteamID, request.Id, "Dieses Lineup ist nicht mehr für Aufnahmen verfügbar.", requestOnly: true); continue; }
            if (request.Action != "video-stop" && !Alive(player)) { WriteReviewFailure(player.SteamID, request.Id, "Bitte zuerst spawnen.", requestOnly: true); continue; }
            var action = request.Action == "video-start" ? TrainingAction.ReviewVideoStart : request.Action == "video-stop" ? TrainingAction.ReviewVideoStop : TrainingAction.ReviewPhoto;
            HandleReviewAction(player, new(action, lineup, Setting: request.Slot), request.Id);
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
        var reference = _reviewVideos.GetValueOrDefault(player.SteamID)?.Lineup;
        var lineup = session == null ? null : ReadLibrary(player, quiet: true)?.FirstOrDefault(n => n.Owner == (reference?.Owner ?? session.Owner) && n.Map == (reference?.Map ?? session.Map) && n.Name == (reference?.Name ?? session.Name));
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

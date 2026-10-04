using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using System.Text.Json;

namespace Playbook;

public sealed partial class PlaybookPlugin
{
    private sealed record EditRequest(ulong SteamId, NadeLineup Lineup, string Field, float Expires);
    private readonly Dictionary<int, EditRequest> _edits = [];
    private readonly Dictionary<string, ulong> _pendingLineupRequests = [];
    private readonly HashSet<string> _submittedLineupRequests = [];
    private bool HandleLineupAction(CCSPlayerController player, MenuRequest request)
    {
        if (request.Action is not (TrainingAction.EditName or TrainingAction.EditDescription or TrainingAction.EditField or TrainingAction.RequestReview or TrainingAction.DeleteLineup)) return false;
        var selected = request.Lineup;
        var lineup = ReadLibrary(player)?.FirstOrDefault(n => n.Owner == selected?.Owner && n.Map == selected.Map && n.Name == selected.Name);
        if (lineup == null || lineup.Owner != player.SteamID.ToString() || lineup.Official)
        { Tell(player, "Du darfst nur deine eigenen, noch nicht offiziellen Aufnahmen bearbeiten oder löschen."); return true; }
        if (request.Action is TrainingAction.EditName or TrainingAction.EditDescription or TrainingAction.EditField)
        {
            if (_draftNameRequests.ContainsKey(player.Slot)) { Tell(player, "Zuerst die laufende Aufnahme speichern oder verwerfen."); return true; }
            var field = request.Action == TrainingAction.EditName ? "displayName" : request.Action == TrainingAction.EditDescription ? "desc" : request.Setting;
            if (!LineupEditFields.Allowed(field)) { Tell(player, "Dieses Feld kann nicht bearbeitet werden."); return true; }
            _edits[player.Slot] = new(player.SteamID, lineup, field, Server.CurrentTime + 120);
            ReleaseControl(player.Slot);
            Tell(player, LineupEditFields.Prompt(field));
        }
        else QueueLineupRequest(player, lineup, request.Action == TrainingAction.DeleteLineup ? "delete" : "review", "");
        return true;
    }
    private bool TryEditFromChat(CCSPlayerController? player, string text)
    {
        if (player is not { IsValid: true } || !_edits.TryGetValue(player.Slot, out var edit)) return false;
        if (!CanWriteNades(player) || !TrainingEnabled || edit.SteamId != player.SteamID || edit.Expires < Server.CurrentTime || edit.Lineup.Map != Server.MapName)
        { _edits.Remove(player.Slot); return false; }
        text = text.Trim().Trim('"').Trim();
        if (text.Equals("abbrechen", StringComparison.OrdinalIgnoreCase) || text.Equals(".cancel", StringComparison.OrdinalIgnoreCase))
        { _edits.Remove(player.Slot); Tell(player, "Bearbeitung abgebrochen."); return true; }
        // Commands must never accidentally become descriptions, nor block .exitprac.
        if (text.StartsWith('.') || text.StartsWith('!')) return false;
        if (!LineupEditFields.TryParse(edit.Field, text, out var value))
        { Tell(player, "Ungültige Eingabe. " + LineupEditFields.Prompt(edit.Field)); return true; }
        if (QueueLineupRequest(player, edit.Lineup, edit.Field, value)) _edits.Remove(player.Slot);
        return true;
    }
    private bool QueueLineupRequest(CCSPlayerController player, NadeLineup selected, string action, object value)
    {
        var identity = JsonSerializer.Serialize(new { selected.Owner, selected.Map, selected.Name, selected.Revision, action, value });
        var id = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(identity)))[..32].ToLowerInvariant();
        if (_submittedLineupRequests.Contains(id)) return true;
        var current = ReadLibrary(player)?.FirstOrDefault(n => n.Owner == selected.Owner && n.Map == selected.Map && n.Name == selected.Name);
        if (action == "review" && current?.ReviewStatus == "pending" && current.Owner == player.SteamID.ToString()) return true;
        if (!CanWriteNades(player) || !TrainingEnabled || current == null || current.Owner != player.SteamID.ToString() || current.Official || current.Revision != selected.Revision)
        { Tell(player, "Die Aufnahme wurde inzwischen geändert oder freigegeben. Bitte erneut öffnen."); return false; }
        if (string.IsNullOrEmpty(current.Revision)) { Tell(player, "Die Aufnahme wird noch synchronisiert. Bitte kurz warten."); return false; }
        try
        {
            var directory = Path.Combine(Path.GetDirectoryName(_libraryPath)!, "savednades.requests");
            Directory.CreateDirectory(directory);
            var path = Path.Combine(directory, id + ".json");
            File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(new {
                id, actor = player.SteamID.ToString(), owner = current.Owner, map = current.Map, name = current.Name,
                revision = current.Revision, action, value
            }));
            File.Move(path + ".tmp", path);
            _submittedLineupRequests.Add(id);
            _pendingLineupRequests[id] = player.SteamID;
            Tell(player, "Änderung zur Verarbeitung gesendet. Die Bibliothek aktualisiert sich automatisch; bei zwischenzeitlicher Admin-Änderung bitte erneut öffnen.");
            return true;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        { Tell(player, "Änderung konnte nicht gespeichert werden. Bitte erneut versuchen."); return false; }
    }

    private void ReadLineupResults()
    {
        LineupResults.Read(_pendingLineupRequests,
            Path.Combine(Path.GetDirectoryName(_libraryPath)!, "savednades.requests", "results"),
            (steamId, message) =>
            {
                var player = Utilities.GetPlayers().FirstOrDefault(p => p.IsValid && p.SteamID == steamId);
                if (player != null) Tell(player, message);
            });
    }
}

public static class LineupResults
{
    public static void Read(Dictionary<string, ulong> pending, string directory, Action<ulong, string> notify)
    {
        foreach (var (id, steamId) in pending.ToArray())
        {
            var path = Path.Combine(directory, id + ".json");
            var receipt = Path.Combine(Path.GetDirectoryName(directory)!, "processed", id + ".json");
            // The dashboard can stop after committing the receipt but before publishing results.
            var resultPath = File.Exists(path) ? path : receipt;
            if (!File.Exists(resultPath)) continue;
            try
            {
                using var result = JsonDocument.Parse(File.ReadAllText(resultPath));
                var message = result.RootElement.GetProperty("message").GetString() ?? "Anfrage verarbeitet.";
                // Delivery must not depend on permission to delete dashboard-owned files.
                pending.Remove(id);
                notify(steamId, message);
                if (resultPath == path) File.Delete(path); // Permanent receipts must survive delivery.
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException) { }
        }
    }
}

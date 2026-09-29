using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using System.Text.Json;

namespace MatchZyNades;

public sealed partial class MatchZyNadesPlugin
{
    private sealed record EditRequest(ulong SteamId, NadeLineup Lineup, string Field, float Expires);
    private readonly Dictionary<int, EditRequest> _edits = [];
    private readonly Dictionary<string, ulong> _pendingLineupRequests = [];
    private bool HandleLineupAction(CCSPlayerController player, MenuRequest request)
    {
        if (request.Action is not (TrainingAction.EditName or TrainingAction.EditDescription or TrainingAction.RequestReview or TrainingAction.DeleteLineup)) return false;
        var selected = request.Lineup;
        var lineup = ReadLibrary(player)?.FirstOrDefault(n => n.Owner == selected?.Owner && n.Map == selected.Map && n.Name == selected.Name);
        if (lineup == null || lineup.Owner != player.SteamID.ToString() || lineup.Official)
        { Tell(player, "Du darfst nur deine eigenen, noch nicht offiziellen Aufnahmen bearbeiten oder löschen."); return true; }
        if (request.Action is TrainingAction.EditName or TrainingAction.EditDescription)
        {
            if (_draftNameRequests.ContainsKey(player.Slot)) { Tell(player, "Zuerst die laufende Aufnahme speichern oder verwerfen."); return true; }
            _edits[player.Slot] = new(player.SteamID, lineup, request.Action == TrainingAction.EditName ? "displayName" : "desc", Server.CurrentTime + 120);
            ReleaseControl(player.Slot);
            Tell(player, request.Action == TrainingAction.EditName ? "Neuen Namen im Chat eingeben (max. 120 Zeichen). abbrechen beendet die Eingabe." : "Beschreibung im Chat eingeben (max. 300 Zeichen). abbrechen beendet die Eingabe.");
        }
        else QueueLineupRequest(player, lineup, request.Action == TrainingAction.DeleteLineup ? "delete" : "review", "");
        return true;
    }
    private bool TryEditFromChat(CCSPlayerController? player, string text)
    {
        if (player is not { IsValid: true } || !_edits.TryGetValue(player.Slot, out var edit)) return false;
        if (!TrainingEnabled || edit.SteamId != player.SteamID || edit.Expires < Server.CurrentTime || edit.Lineup.Map != Server.MapName)
        { _edits.Remove(player.Slot); return false; }
        text = text.Trim().Trim('"').Trim();
        if (text.Equals("abbrechen", StringComparison.OrdinalIgnoreCase) || text.Equals(".cancel", StringComparison.OrdinalIgnoreCase))
        { _edits.Remove(player.Slot); Tell(player, "Bearbeitung abgebrochen."); return true; }
        // Commands must never accidentally become descriptions, nor block .exitprac.
        if (text.StartsWith('.') || text.StartsWith('!')) return false;
        var max = edit.Field == "displayName" ? 120 : 300;
        if (string.IsNullOrWhiteSpace(text) || text.Length > max || text.Any(char.IsControl))
        { Tell(player, $"Bitte 1 bis {max} Zeichen ohne Steuerzeichen eingeben."); return true; }
        if (QueueLineupRequest(player, edit.Lineup, edit.Field, text)) _edits.Remove(player.Slot);
        return true;
    }
    private bool QueueLineupRequest(CCSPlayerController player, NadeLineup selected, string action, string value)
    {
        var current = ReadLibrary(player)?.FirstOrDefault(n => n.Owner == selected.Owner && n.Map == selected.Map && n.Name == selected.Name);
        if (!TrainingEnabled || current == null || current.Owner != player.SteamID.ToString() || current.Official || current.Revision != selected.Revision)
        { Tell(player, "Die Aufnahme wurde inzwischen geändert oder freigegeben. Bitte erneut öffnen."); return false; }
        if (string.IsNullOrEmpty(current.Revision)) { Tell(player, "Die Aufnahme wird noch synchronisiert. Bitte kurz warten."); return false; }
        try
        {
            var id = Guid.NewGuid().ToString("N");
            var directory = Path.Combine(Path.GetDirectoryName(_libraryPath)!, "savednades.requests");
            Directory.CreateDirectory(directory);
            var path = Path.Combine(directory, id + ".json");
            File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(new {
                id, actor = player.SteamID.ToString(), owner = current.Owner, map = current.Map, name = current.Name,
                revision = current.Revision, action, value
            }));
            File.Move(path + ".tmp", path);
            _pendingLineupRequests[id] = player.SteamID;
            Tell(player, "Änderung zur Verarbeitung gesendet. Die Bibliothek aktualisiert sich automatisch; bei zwischenzeitlicher Admin-Änderung bitte erneut öffnen.");
            return true;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        { Tell(player, "Änderung konnte nicht gespeichert werden. Bitte erneut versuchen."); return false; }
    }

    private void ReadLineupResults()
    {
        foreach (var (id, steamId) in _pendingLineupRequests.ToArray())
        {
            var path = Path.Combine(Path.GetDirectoryName(_libraryPath)!, "savednades.requests", "results", id + ".json");
            if (!File.Exists(path)) continue;
            try
            {
                using var result = JsonDocument.Parse(File.ReadAllText(path));
                var message = result.RootElement.GetProperty("message").GetString() ?? "Anfrage verarbeitet.";
                var player = Utilities.GetPlayers().FirstOrDefault(p => p.IsValid && p.SteamID == steamId);
                if (player != null) Tell(player, message);
                File.Delete(path);
                _pendingLineupRequests.Remove(id);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException) { }
        }
    }
}

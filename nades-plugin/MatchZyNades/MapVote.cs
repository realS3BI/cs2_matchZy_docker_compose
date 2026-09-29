using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Timers;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace MatchZyNades;

public sealed class MajorityVote(IEnumerable<ulong> players)
{
    private readonly HashSet<ulong> _eligible = players.Where(id => id != 0).ToHashSet();
    private readonly Dictionary<ulong, bool> _votes = [];
    public int Required => _eligible.Count / 2 + 1;
    public int Yes => _votes.Values.Count(v => v);
    public int No => _votes.Values.Count(v => !v);
    public bool Passed => Yes >= Required;
    public bool Cast(ulong player, bool yes)
    {
        if (!_eligible.Contains(player) || _votes.ContainsKey(player)) return false;
        _votes[player] = yes;
        return true;
    }
}

public sealed partial class MatchZyNadesPlugin
{
    private sealed record MapChoice(string Key, string Title, string Command);
    private sealed record ActiveMapVote(MapChoice Map, MajorityVote Ballot, float EndsAt);
    private ActiveMapVote? _mapVote;
    private float _nextMapVote;
    private IReadOnlyList<MapChoice> MapChoices()
    {
        var maps = new List<MapChoice>();
        var directory = Path.Combine(Server.GameDirectory, "csgo", "maps");
        if (Directory.Exists(directory))
            foreach (var file in Directory.EnumerateFiles(directory, "*.vpk"))
            {
                var name = Path.GetFileNameWithoutExtension(file);
                if (Regex.IsMatch(name, "^(de|cs|ar)_[a-z0-9_]+$") && name != Server.MapName)
                    maps.Add(new(name, name, "changelevel " + name));
            }
        try
        {
            using var settings = JsonDocument.Parse(File.ReadAllText("/config-runtime/settings.json"));
            var root = settings.RootElement;
            if (root.TryGetProperty("workshopMapsEnabled", out var enabled) && enabled.ValueKind == JsonValueKind.True)
            {
                using var catalog = JsonDocument.Parse(root.GetProperty("workshopMapCatalog").GetString() ?? "[]");
                var ids = Regex.Matches(root.GetProperty("workshopMaps").GetString() ?? "", "[0-9]+").Select(m => m.Value).ToHashSet();
                foreach (var entry in catalog.RootElement.EnumerateArray())
                {
                    var id = entry.GetProperty("workshopId").GetString() ?? "";
                    if (!Regex.IsMatch(id, "^[1-9][0-9]{0,19}$") || !ids.Contains(id)) continue;
                    var title = entry.GetProperty("title").GetString() ?? id;
                    maps.Add(new("workshop:" + id, title, "host_workshop_map " + id));
                }
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException or InvalidOperationException or KeyNotFoundException) { }
        return maps.DistinctBy(m => m.Key).OrderBy(m => m.Title).ToArray();
    }
    private MenuPage MapMenu()
    {
        if (_mapVote is { } vote)
            return new("Map-Abstimmung", $"{vote.Map.Title}: {vote.Ballot.Yes} Ja, {vote.Ballot.No} Nein. Benötigt: {vote.Ballot.Required} Ja. Noch {Math.Max(0, (int)(vote.EndsAt - Server.CurrentTime))} Sekunden.", [
                new("Ja, Map wechseln", $"{vote.Map.Title}: {vote.Ballot.Yes}/{vote.Ballot.Required} Ja, {vote.Ballot.No} Nein. Noch {Math.Max(0, (int)(vote.EndsAt - Server.CurrentTime))} Sekunden. Für den Wechsel stimmen.", Request: new(TrainingAction.VoteYes)),
                new("Nein, hier bleiben", $"{vote.Map.Title}: {vote.Ballot.Yes}/{vote.Ballot.Required} Ja, {vote.Ballot.No} Nein. Gegen den Wechsel stimmen. Enthaltungen sind keine Ja-Stimmen.", Request: new(TrainingAction.VoteNo))], Key: "maps");
        return new("Map wechseln", "Map wählen und Abstimmung starten. Der Vorschlag zählt als deine Ja-Stimme. Alle menschlichen Spieler inklusive Zuschauer dürfen abstimmen.",
            MapChoices().Select(map => new MenuItem(map.Title, "Startet eine serverweite Abstimmung für diese Map. 30 Sekunden, mehr als die Hälfte aller beim Start verbundenen Spieler muss Ja stimmen.", Request: new(TrainingAction.StartMapVote, Value: map.Key))).ToArray(), Key: "maps");
    }
    private bool HandleMapAction(CCSPlayerController player, MenuRequest request)
    {
        if (request.Action is TrainingAction.VoteYes or TrainingAction.VoteNo)
        { CastMapVote(player, request.Action == TrainingAction.VoteYes); return true; }
        if (request.Action != TrainingAction.StartMapVote) return false;
        if (_mapVote != null) { Tell(player, "Es läuft bereits eine Map-Abstimmung. Unter Map wechseln abstimmen."); return true; }
        if (Server.CurrentTime < _nextMapVote) { Tell(player, "Bitte warte, bevor du die nächste Map-Abstimmung startest."); return true; }
        var map = MapChoices().FirstOrDefault(m => m.Key == request.Value);
        if (map == null) { Tell(player, "Diese Map ist nicht mehr verfügbar."); return true; }
        var voters = Utilities.GetPlayers().Where(p => p.IsValid && !p.IsBot && !p.IsHLTV &&
            p.Connected == PlayerConnectedState.Connected).Select(p => p.SteamID);
        var vote = new ActiveMapVote(map, new(voters), Server.CurrentTime + 30);
        _mapVote = vote;
        _nextMapVote = Server.CurrentTime + 60;
        Server.PrintToChatAll($" [Training] Mapwechsel zu {MenuRenderer.Plain(map.Title, 60)}? .mapja / .mapnein oder im Panel unter Map wechseln. {vote.Ballot.Required} Ja-Stimmen nötig, 30 Sekunden.");
        AddTimer(30, () => { if (_mapVote == vote) { Server.PrintToChatAll(" [Training] Mapwechsel abgelehnt: keine Mehrheit."); CancelMapVote(); } }, TimerFlags.STOP_ON_MAPCHANGE);
        CastMapVote(player, true);
        return true;
    }
    private void CastMapVote(CCSPlayerController player, bool yes)
    {
        if (!TrainingEnabled || _mapVote is not { } vote || Server.CurrentTime >= vote.EndsAt) return;
        if (!vote.Ballot.Cast(player.SteamID, yes)) { Tell(player, "Du hast bereits abgestimmt oder warst beim Start der Abstimmung noch nicht verbunden."); return; }
        Server.PrintToChatAll($" [Training] Abstimmung: {vote.Ballot.Yes}/{vote.Ballot.Required} Ja, {vote.Ballot.No} Nein.");
        if (!vote.Ballot.Passed) return;
        _mapVote = null;
        Server.PrintToChatAll($" [Training] Mehrheit erreicht. Wechsel zu {MenuRenderer.Plain(vote.Map.Title, 60)}.");
        Server.NextFrame(() => {
            if (TrainingEnabled && MapChoices().Any(m => m.Key == vote.Map.Key && m.Command == vote.Map.Command))
                Server.ExecuteCommand(vote.Map.Command);
        });
    }
    private void CancelMapVote() => _mapVote = null;
    private bool TryMapVoteFromChat(CCSPlayerController? player, string text)
    {
        text = text.Trim().Trim('"').ToLowerInvariant();
        if (player is not { IsValid: true, IsBot: false } || text is not (".mapja" or ".mapnein")) return false;
        CastMapVote(player, text == ".mapja");
        return true;
    }
    [ConsoleCommand("css_training_vote", "Vote on the current practice map change: yes/no")]
    public void OnTrainingVote(CCSPlayerController? player, CommandInfo command)
    {
        if (player is not { IsValid: true, IsBot: false } || command.ArgCount != 2) return;
        var choice = command.GetArg(1).ToLowerInvariant();
        if (choice is "yes" or "no") CastMapVote(player, choice == "yes");
    }
}

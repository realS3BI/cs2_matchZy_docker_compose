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
    private sealed record ActiveMapVote(TrainingMap Map, MajorityVote Ballot, float EndsAt);
    private ActiveMapVote? _mapVote;
    private float _nextMapVote;
    private IReadOnlyList<TrainingMap> MapChoices()
    {
        var directory = Path.Combine(Server.GameDirectory, "csgo", "maps");
        var names = Directory.Exists(directory) ? Directory.EnumerateFiles(directory, "*.vpk").Select(Path.GetFileNameWithoutExtension).OfType<string>() : [];
        string ReadOptional(string path) { try { return File.ReadAllText(path); } catch (IOException) { return ""; } catch (UnauthorizedAccessException) { return ""; } }
        return TrainingMaps.Build(names, ReadOptional("/config-runtime/map-catalog.json"), ReadOptional("/config-runtime/settings.json"));
    }
    private void WriteMapInventory()
    {
        var path = Path.Combine(Path.GetDirectoryName(_libraryPath)!, "savednades.maps.json");
        var json = JsonSerializer.Serialize(MapChoices());
        if (File.Exists(path) && File.ReadAllText(path) == json) return;
        File.WriteAllText(path + ".tmp", json);
        File.Move(path + ".tmp", path, true);
    }
    private MenuPage MapMenu()
    {
        if (_mapVote is { } vote)
            return new("Map-Abstimmung", $"{vote.Map.Title}: {vote.Ballot.Yes} Ja, {vote.Ballot.No} Nein. Benötigt: {vote.Ballot.Required} Ja. Noch {Math.Max(0, (int)(vote.EndsAt - Server.CurrentTime))} Sekunden.", [
                new("Ja, Map wechseln", $"{vote.Map.Title}: {vote.Ballot.Yes}/{vote.Ballot.Required} Ja, {vote.Ballot.No} Nein. Noch {Math.Max(0, (int)(vote.EndsAt - Server.CurrentTime))} Sekunden. Für den Wechsel stimmen.", Request: new(TrainingAction.VoteYes)),
                new("Nein, hier bleiben", $"{vote.Map.Title}: {vote.Ballot.Yes}/{vote.Ballot.Required} Ja, {vote.Ballot.No} Nein. Gegen den Wechsel stimmen. Enthaltungen sind keine Ja-Stimmen.", Request: new(TrainingAction.VoteNo))], Key: "maps");
        var choices = MapChoices();
        return new("Map wechseln", "Map wählen und eine Abstimmung starten. Jeder Spieler stimmt ausdrücklich mit Ja oder Nein ab.",
            new[] { ("active", "Active Duty"), ("reserve", "Reserve & Community"), ("other", "Others"), ("unavailable", "Nicht verfügbar") }
            .Select(group => new MenuItem(group.Item2,
                group.Item1 == "unavailable" ? "Hier fehlen die Map-Dateien. Eine passende Workshop-Map kann im Dashboard hinterlegt werden." : "Maps dieser Kategorie anzeigen und einen Wechsel zur Abstimmung vorschlagen.",
                Page: new MenuPage(group.Item2, "Mehr als die Hälfte aller beim Start verbundenen menschlichen Spieler muss Ja stimmen.",
                    choices.Where(m => m.Category == group.Item1).Select(map => new MenuItem(map.Title,
                        !map.Available ? "Auf dem Server nicht installiert. Im Dashboard bei Bedarf eine Workshop-Version hinterlegen." : map.MapName == Server.MapName ? "Diese Map läuft bereits." : "Startet eine Ja/Nein-Abstimmung für diese Map. Du stimmst anschließend selbst ab; nach 30 Sekunden endet die Abstimmung.",
                        Request: new(TrainingAction.StartMapVote, Value: map.Key), Enabled: map.Available && map.MapName != Server.MapName)).ToArray(), Key: "maps:" + group.Item1))).ToArray(), Key: "maps");
    }
    private bool HandleMapAction(CCSPlayerController player, MenuRequest request)
    {
        if (request.Action is TrainingAction.VoteYes or TrainingAction.VoteNo)
        { CastMapVote(player, request.Action == TrainingAction.VoteYes); return true; }
        if (request.Action != TrainingAction.StartMapVote) return false;
        if (_mapVote != null) { Tell(player, "Es läuft bereits eine Map-Abstimmung. Unter Map wechseln abstimmen."); return true; }
        if (Server.CurrentTime < _nextMapVote) { Tell(player, "Bitte warte, bevor du die nächste Map-Abstimmung startest."); return true; }
        var map = MapChoices().FirstOrDefault(m => m.Key == request.Value);
        if (map == null || !map.Available || map.MapName == Server.MapName) { Tell(player, "Diese Map ist nicht mehr verfügbar."); return true; }
        var voters = Utilities.GetPlayers().Where(p => p.IsValid && !p.IsBot && !p.IsHLTV &&
            p.Connected == PlayerConnectedState.Connected).Select(p => p.SteamID);
        var vote = new ActiveMapVote(map, new(voters), Server.CurrentTime + 30);
        _mapVote = vote;
        _nextMapVote = Server.CurrentTime + 60;
        Server.PrintToChatAll($" [Training] Mapwechsel zu {MenuRenderer.Plain(map.Title, 60)}? Chat: .y = Ja, .n = Nein. Alternativ im Panel unter Map wechseln. {vote.Ballot.Required} Ja-Stimmen nötig, 30 Sekunden.");
        AddTimer(30, () => { if (_mapVote == vote) { Server.PrintToChatAll(" [Training] Mapwechsel abgelehnt: keine Mehrheit."); CancelMapVote(); } }, TimerFlags.STOP_ON_MAPCHANGE);
        foreach (var voter in Utilities.GetPlayers().Where(p => p.IsValid && !p.IsBot && !p.IsHLTV))
        {
            if (!Alive(voter)) continue; // Spectators can vote via chat or console.
            if (!_menus.ContainsKey(voter.Slot)) Open(voter, focus: false);
            if (_menus.TryGetValue(voter.Slot, out var panel))
            {
                panel.Visible = true;
                panel.Menu.Enter(MapMenu());
                panel.NextDraw = 0;
            }
        }
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
            if (TrainingEnabled && MapChoices().Any(m => m.Available && m.Key == vote.Map.Key && m.Command == vote.Map.Command))
                Server.ExecuteCommand(vote.Map.Command);
        });
    }
    private void CancelMapVote() => _mapVote = null;
    private bool TryMapVoteFromChat(CCSPlayerController? player, string text)
    {
        text = text.Trim().Trim('"').ToLowerInvariant();
        if (player is not { IsValid: true, IsBot: false } || text is not (".y" or ".n" or ".mapja" or ".mapnein")) return false;
        CastMapVote(player, text is ".y" or ".mapja");
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

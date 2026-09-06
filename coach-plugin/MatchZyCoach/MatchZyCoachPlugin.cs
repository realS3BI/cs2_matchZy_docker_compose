using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using Microsoft.Extensions.Logging;

namespace MatchZyCoach;

[MinimumApiVersion(373)]
public sealed class MatchZyCoachPlugin : BasePlugin
{
    private const long ShotHitWindowMs = 300;
    private const long BurstGapMs = 350;
    private const long TradeWindowMs = 5000;
    private const float MovingShotSpeed = 50f;
    private readonly Dictionary<ulong, CoachSession> _sessions = [];
    private readonly List<TradeOpportunity> _tradeOpportunities = [];
    private CoachResultWriter? _writer;
    private bool _roundHasKill;

    public override string ModuleName => "MatchZy Coach";
    public override string ModuleVersion => "1.0.0";
    public override string ModuleAuthor => "MatchZy Control";
    public override string ModuleDescription => "Turns reliable server events into focused CS2 training feedback.";

    public override void Load(bool hotReload)
    {
        _writer = new CoachResultWriter(Path.Combine(ModuleDirectory, "data", "outbox"));
        RegisterListener<Listeners.OnMapEnd>(() => EndAllSessions("map_change"));
        Logger.LogInformation("MatchZy Coach loaded. Players can use !coach start mechanics|utility|decisions|match");
    }

    public override void Unload(bool hotReload) => EndAllSessions("plugin_unload");

    [ConsoleCommand("css_coach", "Start, stop or inspect a personal coaching session")]
    public void OnCoachCommand(CCSPlayerController? player, CommandInfo command)
    {
        if (!Eligible(player))
        {
            command.ReplyToCommand("[Coach] This command must be used by a connected human player.");
            return;
        }

        var action = command.ArgCount > 1 ? command.GetArg(1).Trim().ToLowerInvariant() : "status";
        switch (action)
        {
            case "start":
                StartSession(player!, command.ArgCount > 2 ? command.GetArg(2) : "match", command);
                break;
            case "stop":
            case "finish":
                StopSession(player!, "player_finished", command);
                break;
            case "cancel":
                CancelSession(player!, command);
                break;
            case "status":
                PrintStatus(player!, command);
                break;
            case "note":
                AddNote(player!, command);
                break;
            default:
                command.ReplyToCommand("[Coach] Use !coach start mechanics|utility|decisions|match, !coach note <text>, !coach status, !coach stop or !coach cancel.");
                break;
        }
    }

    [GameEventHandler]
    public HookResult OnRoundStart(EventRoundStart @event, GameEventInfo info)
    {
        _roundHasKill = false;
        _tradeOpportunities.Clear();
        foreach (var session in _sessions.Values)
        {
            session.Rounds++;
            session.FirstDamageAtMs.Clear();
            session.FinishBurst();
        }
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult OnWeaponFire(EventWeaponFire @event, GameEventInfo info)
    {
        var player = @event.Userid;
        if (!Eligible(player) || !_sessions.TryGetValue(player!.SteamID, out var session) || !IsFirearm(@event.Weapon))
            return HookResult.Continue;

        var now = NowMs();
        if (session.CurrentBurst > 0 && (now - session.LastShotAtMs > BurstGapMs || session.LastWeapon != @event.Weapon)) session.FinishBurst();
        session.CurrentBurst++;
        session.Shots++;
        session.LastShotAtMs = now;
        session.LastShotHit = false;
        session.LastWeapon = @event.Weapon;

        var pawn = player.PlayerPawn.Value;
        if (pawn is { IsValid: true })
        {
            var velocity = pawn.AbsVelocity;
            var horizontalSpeed = MathF.Sqrt(velocity.X * velocity.X + velocity.Y * velocity.Y);
            if (horizontalSpeed > MovingShotSpeed) session.ShotsWhileMoving++;
        }
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult OnPlayerHurt(EventPlayerHurt @event, GameEventInfo info)
    {
        var attacker = @event.Attacker;
        var victim = @event.Userid;
        if (!Opponents(attacker, victim) || !_sessions.TryGetValue(attacker!.SteamID, out var session))
            return HookResult.Continue;

        var now = NowMs();
        session.Damage += Math.Max(0, @event.DmgHealth);
        if (IsUtility(@event.Weapon)) session.UtilityDamage += Math.Max(0, @event.DmgHealth);
        if (IsFirearm(@event.Weapon) && !session.LastShotHit && now - session.LastShotAtMs <= ShotHitWindowMs)
        {
            session.ShotsHit++;
            session.LastShotHit = true;
        }
        session.FirstDamageAtMs.TryAdd((int)victim!.Index, now);
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult OnPlayerDeath(EventPlayerDeath @event, GameEventInfo info)
    {
        var attacker = @event.Attacker;
        var victim = @event.Userid;
        var now = NowMs();
        PruneTradeOpportunities(now);

        var opposingKill = attacker is { IsValid: true } && victim is { IsValid: true } && attacker != victim && attacker.TeamNum != victim.TeamNum;
        if (opposingKill)
        {
            if (Eligible(attacker) && _sessions.TryGetValue(attacker!.SteamID, out var attackerSession))
            {
                attackerSession.Kills++;
                if (IsFirearm(@event.Weapon))
                {
                    attackerSession.FirearmKills++;
                    if (@event.Headshot) attackerSession.Headshots++;
                }
                if (attackerSession.FirstDamageAtMs.Remove((int)victim!.Index, out var firstDamage))
                {
                    var ttk = now - firstDamage;
                    if (ttk is >= 0 and <= 10000) attackerSession.TimeToKillSamplesMs.Add((int)ttk);
                }
                var trades = _tradeOpportunities.Where(item => item.KillerSteamId == victim.SteamID && item.Team == attacker.TeamNum).ToList();
                if (trades.Count > 0)
                {
                    attackerSession.TradeKills++;
                    foreach (var trade in trades)
                        if (_sessions.TryGetValue(trade.DeadSteamId, out var deadSession)) deadSession.DeathsTraded++;
                    _tradeOpportunities.RemoveAll(item => trades.Contains(item));
                }
            }

            if (Eligible(victim) && _sessions.TryGetValue(victim!.SteamID, out var victimSession)) victimSession.Deaths++;
            if (!_roundHasKill)
            {
                if (Eligible(attacker) && _sessions.TryGetValue(attacker!.SteamID, out var opener)) opener.OpeningKills++;
                if (Eligible(victim) && _sessions.TryGetValue(victim!.SteamID, out var opened)) opened.OpeningDeaths++;
                _roundHasKill = true;
            }
            if (Eligible(attacker) && Eligible(victim)) _tradeOpportunities.Add(new(victim!.SteamID, attacker!.SteamID, victim.TeamNum, now));
        }

        if (victim is not null)
            foreach (var session in _sessions.Values) session.FirstDamageAtMs.Remove((int)victim.Index);
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult OnGrenadeThrown(EventGrenadeThrown @event, GameEventInfo info)
    {
        var player = @event.Userid;
        if (Eligible(player) && _sessions.TryGetValue(player!.SteamID, out var session)) session.GrenadesThrown++;
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult OnPlayerBlind(EventPlayerBlind @event, GameEventInfo info)
    {
        var attacker = @event.Attacker;
        var victim = @event.Userid;
        if (!Eligible(attacker) || victim is null || !victim.IsValid || attacker == victim || !_sessions.TryGetValue(attacker!.SteamID, out var session))
            return HookResult.Continue;

        if (attacker.TeamNum == victim.TeamNum)
        {
            session.TeammatesFlashed++;
            session.TeamFlashSeconds += Math.Max(0, @event.BlindDuration);
        }
        else
        {
            session.EnemiesFlashed++;
            session.EnemyFlashSeconds += Math.Max(0, @event.BlindDuration);
        }
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult OnPlayerDisconnect(EventPlayerDisconnect @event, GameEventInfo info)
    {
        var steamId = @event.Xuid;
        if (steamId > 0) EndSession(steamId, "disconnect");
        return HookResult.Continue;
    }

    private void StartSession(CCSPlayerController player, string requestedFocus, CommandInfo command)
    {
        if (_sessions.ContainsKey(player.SteamID))
        {
            command.ReplyToCommand("[Coach] A session is already running. Use !coach status or !coach stop.");
            return;
        }
        if (!Enum.TryParse<CoachFocus>(requestedFocus, true, out var focus))
        {
            command.ReplyToCommand("[Coach] Focus must be mechanics, utility, decisions or match.");
            return;
        }

        _sessions[player.SteamID] = new CoachSession
        {
            Id = Guid.NewGuid().ToString("N"),
            SteamId = player.SteamID,
            PlayerName = player.PlayerName,
            Focus = focus,
            Map = Server.MapName,
            StartedAt = DateTimeOffset.UtcNow
        };
        command.ReplyToCommand($"[Coach] {focus} session started. Play normally, then use !coach stop for your report.");
    }

    private void StopSession(CCSPlayerController player, string reason, CommandInfo command)
    {
        var result = EndSession(player.SteamID, reason);
        if (result is null)
        {
            command.ReplyToCommand("[Coach] No session is running. Start one with !coach start mechanics|utility|decisions|match.");
            return;
        }
        command.ReplyToCommand($"[Coach] Saved: {result.Kills}K/{result.Deaths}D, {result.ShotAccuracy * 100:0}% measured accuracy, {result.MovingShotRate * 100:0}% moving shots.");
        foreach (var item in result.Feedback) command.ReplyToCommand($"[Coach] {item.Title}: {item.Detail}");
    }

    private void CancelSession(CCSPlayerController player, CommandInfo command)
    {
        if (_sessions.Remove(player.SteamID)) command.ReplyToCommand("[Coach] Session discarded.");
        else command.ReplyToCommand("[Coach] No session is running.");
    }

    private void PrintStatus(CCSPlayerController player, CommandInfo command)
    {
        if (!_sessions.TryGetValue(player.SteamID, out var session))
        {
            command.ReplyToCommand("[Coach] Start with !coach start mechanics|utility|decisions|match.");
            return;
        }
        var elapsed = DateTimeOffset.UtcNow - session.StartedAt;
        command.ReplyToCommand($"[Coach] {session.Focus}, {elapsed.TotalMinutes:0} min, {session.Shots} shots, {session.Kills}K/{session.Deaths}D, {session.Damage} damage.");
    }

    private void AddNote(CCSPlayerController player, CommandInfo command)
    {
        if (!_sessions.TryGetValue(player.SteamID, out var session))
        {
            command.ReplyToCommand("[Coach] Start a session before adding a note.");
            return;
        }
        var text = string.Join(" ", Enumerable.Range(2, Math.Max(0, command.ArgCount - 2)).Select(command.GetArg)).Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            command.ReplyToCommand("[Coach] Use !coach note <what happened>.");
            return;
        }
        if (session.Notes.Count >= 8)
        {
            command.ReplyToCommand("[Coach] This session already has eight notes.");
            return;
        }
        session.Notes.Add(text[..Math.Min(text.Length, 240)]);
        command.ReplyToCommand($"[Coach] Note {session.Notes.Count} saved.");
    }

    private CoachSessionResult? EndSession(ulong steamId, string reason)
    {
        if (!_sessions.Remove(steamId, out var session)) return null;
        var result = CoachAnalyzer.Complete(session, DateTimeOffset.UtcNow, reason);
        try { _writer?.Write(result); }
        catch (Exception error) { Logger.LogError(error, "Could not write coach result {SessionId}", result.Id); }
        return result;
    }

    private void EndAllSessions(string reason)
    {
        foreach (var steamId in _sessions.Keys.ToArray()) EndSession(steamId, reason);
    }

    private void PruneTradeOpportunities(long now) => _tradeOpportunities.RemoveAll(item => now - item.CreatedAtMs > TradeWindowMs);
    private static long NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    private static bool Eligible(CCSPlayerController? player) => player is { IsValid: true, IsBot: false } && player.SteamID > 0;
    private static bool Opponents(CCSPlayerController? attacker, CCSPlayerController? victim) => Eligible(attacker) && victim is { IsValid: true } && attacker != victim && attacker!.TeamNum != victim.TeamNum;
    private static bool IsUtility(string weapon) => weapon is "hegrenade" or "inferno" or "molotov" or "incgrenade";
    private static bool IsFirearm(string weapon) => !string.IsNullOrWhiteSpace(weapon) && !IsUtility(weapon) && weapon is not "flashbang" and not "smokegrenade" and not "decoy" and not "knife" and not "knife_t" and not "taser" and not "c4";

    private sealed record TradeOpportunity(ulong DeadSteamId, ulong KillerSteamId, byte Team, long CreatedAtMs);
}

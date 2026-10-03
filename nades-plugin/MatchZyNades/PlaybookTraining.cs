using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Cvars;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;

namespace MatchZyNades;

// Only registered in Nades mode. MatchZy owns its commands in the Scrim mode.
public sealed partial class MatchZyNadesPlugin
{
    private readonly string _serverMode = Environment.GetEnvironmentVariable("PLAYBOOK_SERVER_MODE") ?? "matchzy";
    private bool _practiceReady;
    private int _practiceGeneration;
    private bool StandaloneTraining => _serverMode == "nades";
    private sealed record PracticePosition(Coordinates Position, Coordinates Angles);
    private readonly Dictionary<ulong, PracticePosition> _positions = [];
    private readonly Dictionary<ulong, PracticePosition> _throwPositions = [];
    private readonly HashSet<ulong> _noFlash = [];
    private readonly HashSet<ulong> _god = [];
    private readonly Dictionary<string, string> _practiceDefaults = [];

    private void RegisterStandaloneTraining(bool hotReload)
    {
        if (!StandaloneTraining) return;
        // Map/game configs and the engine quota manager can overwrite training
        // settings after startup. Keep team rules and the tracked bot count fixed.
        AddTimer(1f, EnforceTrainingBots, TimerFlags.REPEAT);
        foreach (var name in PlaybookCommands.TrainingCommands)
            AddCommand(name, "Playbook-Training", (player, command) => RunTrainingCommand(player, name, command.ArgString));
        AddCommandListener("noclip", (player, _) =>
        {
            if (player == null) return HookResult.Continue;
            RunTrainingCommand(player, "css_noclip", "");
            return HookResult.Stop;
        }, HookMode.Pre);
        RegisterListener<Listeners.OnMapStart>(_ => SchedulePractice());
        RegisterListener<Listeners.OnMapEnd>(() => { _practiceGeneration++; _practiceReady = false; ResetTraining(); });
        RegisterEventHandler<EventPlayerConnectFull>((_, _) =>
        {
            // Reapply before the connecting client opens its team selection.
            if (TrainingEnabled) ApplyPracticeSettings();
            return HookResult.Continue;
        }, HookMode.Pre);
        RegisterEventHandler<EventRoundPrestart>((_, _) =>
        {
            // round_start is too late to prevent the engine's team intro.
            if (TrainingEnabled) ApplyPracticeSettings();
            return HookResult.Continue;
        }, HookMode.Pre);
        RegisterEventHandler<EventPlayerSpawn>((e, _) =>
        {
            if (e.Userid is { IsValid: true } player)
                Server.NextFrame(() =>
                {
                    if (!TrainingEnabled) return;
                    ApplyPlayerTraining(player);
                });
            return HookResult.Continue;
        });
        RegisterEventHandler<EventRoundStart>((_, _) =>
        {
            if (TrainingEnabled)
            {
                ApplyPracticeSettings();
            }
            return HookResult.Continue;
        });
        RegisterEventHandler<EventPlayerBlind>((e, _) =>
        {
            if (TrainingEnabled && e.Userid is { IsValid: true } player && _noFlash.Contains(player.SteamID) &&
                player.PlayerPawn.Value is { IsValid: true } pawn)
            {
                pawn.FlashDuration = 0;
                pawn.FlashMaxAlpha = 0;
            }
            return HookResult.Continue;
        }, HookMode.Pre);
        RegisterEventHandler<EventGrenadeThrown>((e, _) =>
        {
            if (TrainingEnabled && Alive(e.Userid)) _throwPositions[e.Userid!.SteamID] = PositionOf(e.Userid);
            return HookResult.Continue;
        });
        // Also covers hot reload and plugin loads after OnMapStart.
        if (hotReload || !string.IsNullOrEmpty(Server.MapName)) SchedulePractice(restartRound: !hotReload);
    }

    private void SchedulePractice(bool restartRound = true)
    {
        var generation = ++_practiceGeneration;
        _practiceReady = false;
        // World updates also run while the empty server is hibernating.
        Server.NextWorldUpdate(() =>
        {
            if (generation != _practiceGeneration) return;
            ApplyPracticeSettings();
            Server.ExecuteCommand("bot_kick");
            EndPracticeWarmup();
            // Hibernation is disabled above, so this completes without waiting
            // for the first player. A plugin reload keeps the running round.
            if (restartRound) Server.ExecuteCommand("mp_restartgame 1");
            _practiceReady = true;
            // Map configs may run after OnMapStart. Reapply once they have settled.
            AddTimer(1f, () =>
            {
                if (generation != _practiceGeneration || !TrainingEnabled) return;
                ApplyPracticeSettings();
                EndPracticeWarmup();
                foreach (var player in Utilities.GetPlayers().Where(p => !p.IsBot)) ApplyPlayerTraining(player);
            }, TimerFlags.STOP_ON_MAPCHANGE);
        });
    }

    private void ApplyPracticeSettings()
    {
        foreach (var (name, value) in PlaybookCommands.PracticeSettings)
        {
            if (ConVar.Find(name) is not { } variable) continue;
            _practiceDefaults.TryAdd(name, variable.StringValue);
            variable.StringValue = name == "bot_quota"
                ? (TrainingBotCount() + (_addingTrainingBot ? 1 : 0)).ToString()
                : value.Trim('"');
        }
    }

    private static void EndPracticeWarmup()
    {
        var rules = Utilities.FindAllEntitiesByDesignerName<CCSGameRulesProxy>("cs_gamerules").FirstOrDefault()?.GameRules;
        if (rules?.WarmupPeriod == true) Server.ExecuteCommand("mp_warmup_end");
    }

    private static PracticePosition PositionOf(CCSPlayerController player)
    {
        var pawn = player.PlayerPawn.Value!;
        var p = pawn.AbsOrigin!;
        var a = pawn.EyeAngles;
        return new(new(p.X, p.Y, p.Z), new(a.X, a.Y, a.Z));
    }

    private void RestorePosition(CCSPlayerController player, PracticePosition? position)
    {
        if (position == null) { Tell(player, "Noch keine passende Position gespeichert."); return; }
        ReleaseControl(player.Slot);
        var pawn = player.PlayerPawn.Value!;
        pawn.MoveType = pawn.ActualMoveType = MoveType_t.MOVETYPE_WALK;
        Utilities.SetStateChanged(pawn, "CBaseEntity", "m_MoveType");
        var p = position.Position;
        var a = position.Angles;
        pawn.Teleport(new Vector(p.X, p.Y, p.Z + 1), new QAngle(a.X, a.Y, a.Z), new Vector(0, 0, 0));
        PlayerBodyRotation.Repair(pawn);
        Tell(player, "Position geladen.");
    }

    private void ApplyPlayerTraining(CCSPlayerController player)
    {
        if (!TrainingEnabled || player is not { IsValid: true } || player.PlayerPawn.Value is not { IsValid: true } pawn) return;
        if (player.IsBot) { RestoreTrainingBot(player); return; }
        pawn.TakesDamage = !_god.Contains(player.SteamID);
        pawn.FlashMaxAlpha = _noFlash.Contains(player.SteamID) ? 0 : 255;
    }

    private TrainingToggles TrainingState(CCSPlayerController player) => StandaloneTraining
        ? new(ConVar.Find("sv_grenade_trajectory_prac_pipreview")?.GetPrimitiveValue<bool>() == true,
            ConVar.Find("sv_showimpacts")?.GetPrimitiveValue<int>() > 0,
            _noFlash.Contains(player.SteamID), _god.Contains(player.SteamID))
        : MatchZyState.Toggles(player);

    private void RunTrainingCommand(CCSPlayerController? player, string command, string arguments)
    {
        if (!StandaloneTraining || !CanControl(player)) return;
        if (!TrainingEnabled) { Tell(player, "Training wird noch gestartet."); return; }
        if (command == "css_help")
        {
            Tell(player, ".nades · .loadnade <Name> · .rethrow / .rt · .last · .savepos · .loadpos · .noclip · .bot · .crouchbot / .cbot · .nobots · .clear · .traj · .impacts · .noflash · .god");
            return;
        }
        if (command is "css_listnades" or "css_lin")
        {
            var names = (ReadLibrary(player) ?? []).Where(n => n.Name.Contains(arguments.Trim(), StringComparison.OrdinalIgnoreCase)).Take(12);
            Tell(player, string.Join(" · ", names.Select(n => n.Name)) + " | Alle Lineups: .nades");
            return;
        }
        if (!Alive(player)) { Tell(player, "Bitte zuerst einem Team beitreten und spawnen."); return; }
        ReleaseControl(player.Slot);
        switch (command)
        {
            case "css_rethrow": case "css_rt": RethrowGrenade(player); return;
            case "css_bot": AddTrainingBot(player, false); return;
            case "css_cbot": case "css_crouchbot": AddTrainingBot(player, true); return;
            case "css_nobots": RemoveTrainingBots(); Tell(player, "Alle Trainingsbots entfernt."); return;
            case "css_loadnade": case "css_ln":
                var matches = (ReadLibrary(player) ?? []).Where(n => n.Name == arguments.Trim().Trim('"')).ToArray();
                var own = matches.FirstOrDefault(n => n.Owner == player.SteamID.ToString());
                if (own != null || matches.Length == 1) LoadLineup(player, own ?? matches[0]);
                else Tell(player, matches.Length == 0 ? "Lineup nicht gefunden. Mit .nades auswählen." : "Mehrere Lineups mit diesem Namen. Mit .nades eindeutig auswählen.");
                return;
            case "css_savepos": _positions[player.SteamID] = PositionOf(player); Tell(player, "Position gespeichert."); return;
            case "css_loadpos": RestorePosition(player, _positions.GetValueOrDefault(player.SteamID)); return;
            case "css_last": RestorePosition(player, _throwPositions.GetValueOrDefault(player.SteamID)); return;
            case "css_noclip":
                var pawn = player.PlayerPawn.Value!;
                pawn.MoveType = pawn.ActualMoveType = pawn.MoveType == MoveType_t.MOVETYPE_NOCLIP ? MoveType_t.MOVETYPE_WALK : MoveType_t.MOVETYPE_NOCLIP;
                Utilities.SetStateChanged(pawn, "CBaseEntity", "m_MoveType");
                Tell(player, pawn.MoveType == MoveType_t.MOVETYPE_NOCLIP ? "Noclip eingeschaltet." : "Noclip ausgeschaltet."); return;
            case "css_noflash": case "css_noblind":
                if (!_noFlash.Add(player.SteamID)) _noFlash.Remove(player.SteamID);
                ApplyPlayerTraining(player); Tell(player, _noFlash.Contains(player.SteamID) ? "Flashschutz eingeschaltet." : "Flashschutz ausgeschaltet."); return;
            case "css_god":
                if (!_god.Add(player.SteamID)) _god.Remove(player.SteamID);
                ApplyPlayerTraining(player); Tell(player, _god.Contains(player.SteamID) ? "God Mode eingeschaltet." : "God Mode ausgeschaltet."); return;
            case "css_traj":
                var trajectory = ConVar.Find("sv_grenade_trajectory_prac_pipreview");
                if (trajectory != null) trajectory.SetValue(!trajectory.GetPrimitiveValue<bool>());
                Tell(player, "Flugbahnvorschau umgeschaltet."); return;
            case "css_impacts":
                var impacts = ConVar.Find("sv_showimpacts");
                if (impacts != null) impacts.SetValue(impacts.GetPrimitiveValue<int>() == 0 ? 1 : 0);
                Tell(player, "Einschläge umgeschaltet."); return;
            case "css_clear":
                foreach (var name in new[] { "smokegrenade_projectile", "hegrenade_projectile", "flashbang_projectile", "molotov_projectile", "decoy_projectile", "inferno" })
                    foreach (var entity in Utilities.FindAllEntitiesByDesignerName<CBaseEntity>(name).ToArray())
                        if (entity.IsValid) entity.Remove();
                Tell(player, "Aktive Granaten und Feuer entfernt."); return;
        }
    }

    private void ForgetTraining(ulong steamId)
    {
        _positions.Remove(steamId); _throwPositions.Remove(steamId); _rethrows.Forget(steamId); _noFlash.Remove(steamId); _god.Remove(steamId);
    }

    private void ResetTraining()
    {
        _positions.Clear(); _throwPositions.Clear(); _rethrows.Clear(); _noFlash.Clear(); _god.Clear();
        ResetTrainingBots();
    }

    private void StopStandaloneTraining()
    {
        if (!StandaloneTraining) return;
        _practiceGeneration++;
        RemoveTrainingBots();
        ResetTraining();
        foreach (var player in Utilities.GetPlayers())
        {
            ApplyPlayerTraining(player);
            if (player.PlayerPawn.Value is { IsValid: true, MoveType: MoveType_t.MOVETYPE_NOCLIP } pawn)
            {
                pawn.MoveType = pawn.ActualMoveType = MoveType_t.MOVETYPE_WALK;
                Utilities.SetStateChanged(pawn, "CBaseEntity", "m_MoveType");
            }
        }
        _practiceReady = false;
        foreach (var (name, value) in _practiceDefaults)
            if (ConVar.Find(name) is { } variable) variable.StringValue = value;
        _practiceDefaults.Clear();
    }
}

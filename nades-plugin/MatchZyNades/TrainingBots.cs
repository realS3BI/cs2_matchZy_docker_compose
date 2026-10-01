using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Entities.Constants;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;

namespace MatchZyNades;

public sealed partial class MatchZyNadesPlugin
{
    private sealed record TrainingBotPlacement(PracticePosition Position, bool Crouch);
    private readonly Dictionary<uint, TrainingBotPlacement> _trainingBots = [];
    private readonly HashSet<uint> _botCollisionPending = [];
    private bool _addingTrainingBot;
    private int _botGeneration;

    private void AddTrainingBot(CCSPlayerController player, bool crouch)
    {
        if (player.TeamNum is not (2 or 3)) return;
        if (_addingTrainingBot)
        {
            Tell(player, "Ein Bot wird gerade hinzugefügt. Bitte kurz warten und erneut versuchen.");
            return;
        }
        var position = PositionOf(player);
        var pawn = player.PlayerPawn.Value!;
        if (pawn.MovementServices is { } services)
            crouch |= new CCSPlayer_MovementServices(services.Handle).DuckAmount >= 0.9f;
        var placement = new TrainingBotPlacement(position, crouch);
        var existing = Utilities.GetPlayers().Where(p => p.IsValid && p.IsBot).Select(p => p.EntityHandle.Raw).ToHashSet();
        var team = player.TeamNum == 3 ? 2 : 3;
        var generation = _botGeneration;
        var steamId = player.SteamID;
        _addingTrainingBot = true;
        // bot_add is asynchronous. Match by controller handle, including its serial,
        // so an occupied or reused player slot can never steal another bot's position.
        Server.ExecuteCommand(team == 2 ? "bot_add_t" : "bot_add_ct");
        WaitForTrainingBot(player, steamId, placement, existing, team, generation, 50);
    }

    private void WaitForTrainingBot(CCSPlayerController owner, ulong steamId, TrainingBotPlacement placement,
        HashSet<uint> existing, int team, int generation, int attempts)
    {
        AddTimer(0.1f, () =>
        {
            if (generation != _botGeneration || !TrainingEnabled) return;
            var candidates = Utilities.GetPlayers().Where(p => p.IsValid && p.IsBot && !p.IsHLTV &&
                p.TeamNum == team && !existing.Contains(p.EntityHandle.Raw)).ToArray();
            if (!CanControl(owner) || owner.SteamID != steamId)
            {
                foreach (var candidate in candidates) KickTrainingBot(candidate);
                if (candidates.Length == 0 && attempts > 1)
                {
                    WaitForTrainingBot(owner, steamId, placement, existing, team, generation, attempts - 1);
                    return;
                }
                _addingTrainingBot = false;
                return;
            }
            var bot = candidates.FirstOrDefault(Alive);
            if (bot != null)
            {
                _trainingBots[bot.EntityHandle.Raw] = placement;
                RestoreTrainingBot(bot);
                foreach (var extra in candidates.Where(p => p.EntityHandle.Raw != bot.EntityHandle.Raw)) KickTrainingBot(extra);
                _addingTrainingBot = false;
                Tell(owner, placement.Crouch ? "Duckenden Trainingsbot platziert." : "Stehenden Trainingsbot platziert.");
                return;
            }
            if (attempts > 1)
            {
                WaitForTrainingBot(owner, steamId, placement, existing, team, generation, attempts - 1);
                return;
            }
            foreach (var candidate in candidates) KickTrainingBot(candidate);
            _addingTrainingBot = false;
            Tell(owner, "Bot konnte nicht gespawnt werden. Möglicherweise ist der Server oder das Team voll. Mit .nobots Bots entfernen.");
        }, TimerFlags.STOP_ON_MAPCHANGE);
    }

    private static void KickTrainingBot(CCSPlayerController bot)
    {
        if (bot.IsValid && bot.IsBot && bot.UserId is { } id) Server.ExecuteCommand($"kickid {id}");
    }

    private void RestoreTrainingBot(CCSPlayerController bot)
    {
        if (!Alive(bot) || !_trainingBots.TryGetValue(bot.EntityHandle.Raw, out var placement)) return;
        var pawn = bot.PlayerPawn.Value!;
        var p = placement.Position.Position;
        var a = placement.Position.Angles;
        pawn.TakesDamage = true;
        pawn.Teleport(new Vector(p.X, p.Y, p.Z + 1), new QAngle(a.X, a.Y, a.Z), new Vector(0, 0, 0));
        PlayerBodyRotation.Repair(pawn);
        SetTrainingBotCrouch(pawn, placement.Crouch);
        var generation = _botGeneration;
        AllowLeavingTrainingBot(pawn, generation);
        // The bot AI initializes after player_spawn and can overwrite its duck state.
        AddTimer(0.2f, () =>
        {
            if (generation == _botGeneration && TrainingEnabled && pawn.IsValid &&
                bot.PlayerPawn.Value?.Handle == pawn.Handle && Alive(bot))
                SetTrainingBotCrouch(pawn, placement.Crouch);
        }, TimerFlags.STOP_ON_MAPCHANGE);
    }

    private static void SetTrainingBotCrouch(CCSPlayerPawn pawn, bool crouch)
    {
        if (pawn.Bot is { } ai) ai.IsCrouching = crouch;
        if (pawn.MovementServices is not { } services) return;
        var movement = new CCSPlayer_MovementServices(services.Handle);
        movement.DuckAmount = crouch ? 1 : 0;
        if (crouch) pawn.Flags |= (uint)PlayerFlags.FL_DUCKING;
        else pawn.Flags &= ~(uint)PlayerFlags.FL_DUCKING;
    }

    private void RemoveTrainingBots()
    {
        ResetTrainingBots();
        Server.ExecuteCommand("bot_kick; bot_quota 0");
    }

    private void AllowLeavingTrainingBot(CCSPlayerPawn pawn, int generation)
    {
        var handle = pawn.EntityHandle.Raw;
        if (!_botCollisionPending.Add(handle)) return;
        var group = pawn.Collision.CollisionGroup;
        var attributeGroup = pawn.Collision.CollisionAttribute.CollisionGroup;
        pawn.Collision.CollisionGroup = (byte)CollisionGroup.COLLISION_GROUP_DEBRIS;
        pawn.Collision.CollisionAttribute.CollisionGroup = (byte)CollisionGroup.COLLISION_GROUP_DEBRIS;
        void RestoreWhenClear()
        {
            if (generation != _botGeneration) return;
            if (!TrainingEnabled || !pawn.IsValid)
            {
                _botCollisionPending.Remove(handle);
                return;
            }
            var origin = pawn.AbsOrigin;
            var overlapping = origin != null && Utilities.GetPlayers().Any(p => p.IsValid && !p.IsBot && Alive(p) &&
                p.PlayerPawn.Value?.AbsOrigin is { } other && Math.Abs(origin.X - other.X) < 40 &&
                Math.Abs(origin.Y - other.Y) < 40 && Math.Abs(origin.Z - other.Z) < 80);
            if (overlapping)
            {
                AddTimer(0.1f, RestoreWhenClear, TimerFlags.STOP_ON_MAPCHANGE);
                return;
            }
            pawn.Collision.CollisionGroup = group;
            pawn.Collision.CollisionAttribute.CollisionGroup = attributeGroup;
            _botCollisionPending.Remove(handle);
        }
        AddTimer(0.1f, RestoreWhenClear, TimerFlags.STOP_ON_MAPCHANGE);
    }

    private void ResetTrainingBots()
    {
        _botGeneration++;
        _addingTrainingBot = false;
        _trainingBots.Clear();
        _botCollisionPending.Clear();
    }
}

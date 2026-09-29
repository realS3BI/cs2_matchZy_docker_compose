using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Commands;
using Microsoft.Extensions.Logging;

namespace MatchZyNades;

public sealed partial class MatchZyNadesPlugin
{
    private readonly NadeCaptureTracker _capture = new();

    private void RegisterCapture()
    {
        foreach (var command in new[] { "css_savenade", "css_sn", "css_loadnade", "css_ln" })
            AddCommandListener(command, (player, info) =>
            {
                if (info.ArgCount > 1) ArmAfterCommand(player, info.GetArg(1));
                return HookResult.Continue;
            }, HookMode.Post);
        RegisterListener<Listeners.OnEntitySpawned>(CaptureProjectile);
        RegisterEventHandler<EventGrenadeThrown>((e, _) =>
        {
            var player = e.Userid;
            if (player == null || !TrainingEnabled) return HookResult.Continue;
            var kind = ProjectileKind(e.Weapon.Replace("weapon_", "") + "_projectile");
            _capture.Thrown(player.Slot, player.SteamID, kind, Server.CurrentTime);
            return HookResult.Continue;
        });
        RegisterEventHandler<EventSmokegrenadeDetonate>((e, _) => CompleteCapture(e.Entityid, e.Userid, NadeKind.Smoke, new(e.X, e.Y, e.Z)));
        RegisterEventHandler<EventFlashbangDetonate>((e, _) => CompleteCapture(e.Entityid, e.Userid, NadeKind.Flash, new(e.X, e.Y, e.Z)));
        RegisterEventHandler<EventHegrenadeDetonate>((e, _) => CompleteCapture(e.Entityid, e.Userid, NadeKind.HE, new(e.X, e.Y, e.Z)));
        RegisterEventHandler<EventDecoyStarted>((e, _) => CompleteCapture(e.Entityid, e.Userid, NadeKind.Decoy, new(e.X, e.Y, e.Z)));
        RegisterEventHandler<EventRoundStart>((_, _) => { ResetCapture(); return HookResult.Continue; });
        RegisterEventHandler<EventPlayerDeath>((e, _) => { if (e.Userid is { } p) ClearCapture(p.Slot); return HookResult.Continue; });
    }

    private static NadeKind ProjectileKind(string name) => name switch
    {
        "smokegrenade_projectile" => NadeKind.Smoke,
        "flashbang_projectile" => NadeKind.Flash,
        "hegrenade_projectile" => NadeKind.HE,
        "decoy_projectile" => NadeKind.Decoy,
        _ => NadeKind.Other
    };

    private void ArmCapture(CCSPlayerController player, NadeLineup lineup)
    {
        if (!TrainingEnabled || lineup.Kind is NadeKind.Fire or NadeKind.Other) { _capture.Forget(player.Slot); return; }
        _capture.Arm(player.Slot, player.SteamID, lineup, Server.CurrentTime);
        Tell(player, "Der naechste Wurf erfasst das Ziel automatisch (gleicher Typ, innerhalb 2 Minuten). Danach Dashboard aktualisieren.");
    }

    private void ArmAfterCommand(CCSPlayerController? player, string name)
    {
        if (!Alive(player) || !TrainingEnabled) return;
        var steamId = player!.SteamID;
        var map = Server.MapName;
        Server.NextFrame(() =>
        {
            if (!Alive(player) || player.SteamID != steamId || !TrainingEnabled || Server.MapName != map) return;
            var candidates = ReadLibrary(player, quiet: true)?.Where(n => n.Name == name).ToArray() ?? [];
            // Resolve private/global name collisions by the actual position after MatchZy's command.
            var pawn = player.PlayerPawn.Value!;
            var pos = pawn.AbsOrigin;
            if (pos == null) return;
            candidates = candidates.Where(n => Math.Abs(n.Position.X - pos.X) < 2 && Math.Abs(n.Position.Y - pos.Y) < 2 &&
                Math.Abs(n.Position.Z - pos.Z) <= 8 && Math.Abs(n.Angles.X - pawn.EyeAngles.X) < 1 &&
                Math.Abs(n.Angles.Y - pawn.EyeAngles.Y) < 1).ToArray();
            if (candidates.Length == 1) ArmCapture(player, candidates[0]);
            else if (candidates.Length > 1) Tell(player, "Name mehrfach vorhanden. Bitte das genaue Lineup im .nades-Menue laden.");
        });
    }

    private void CaptureProjectile(CEntityInstance entity)
    {
        var kind = ProjectileKind(entity.DesignerName);
        if (!TrainingEnabled || kind == NadeKind.Other) return;
        // The thrower is assigned after spawn; grenade_thrown identifies a real player throw.
        Server.NextFrame(() =>
        {
            if (!TrainingEnabled || !entity.IsValid) return;
            var projectile = new CBaseCSGrenadeProjectile(entity.Handle);
            var player = projectile.Thrower.Value?.Controller.Value?.As<CCSPlayerController>();
            if (player is { IsValid: true, IsBot: false }) _capture.Projectile((int)entity.Index, player.Slot, player.SteamID, kind, Server.CurrentTime);
        });
    }

    private HookResult CompleteCapture(int entityId, CCSPlayerController? player, NadeKind kind, Coordinates target)
    {
        if (!TrainingEnabled || player is not { IsValid: true } ||
            !float.IsFinite(target.X) || !float.IsFinite(target.Y) || !float.IsFinite(target.Z)) return HookResult.Continue;
        var lineup = _capture.Complete(entityId, player.Slot, player.SteamID, kind, Server.MapName, Server.CurrentTime);
        if (lineup == null) return HookResult.Continue;
        try
        {
            NadeCaptureFile.Write(Path.Combine(Path.GetDirectoryName(_libraryPath)!, "savednades.captures.json"),
                NadeCaptureFile.Create(lineup, target));
            Tell(player, $"Ziel fuer {MenuRenderer.Plain(lineup.Title, 90)} erfasst. Dashboard aktualisieren.");
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Text.Json.JsonException)
        {
            Logger.LogWarning(error, "Could not persist grenade target");
            Tell(player, "Ziel konnte nicht gespeichert werden. Bitte erneut laden und werfen.");
        }
        return HookResult.Continue;
    }

    private void ClearCapture(int slot) => _capture.Forget(slot);
    private void ResetCapture() => _capture.Clear();
}

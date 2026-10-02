using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Utils;

namespace MatchZyNades;

public sealed partial class MatchZyNadesPlugin
{
    private readonly GrenadeRethrowHistory _rethrows = new();

    private void RememberGrenade(CCSPlayerController player, CBaseCSGrenadeProjectile projectile)
    {
        if (projectile.AbsRotation is not { } angles) return;
        var position = projectile.InitialPosition;
        var velocity = projectile.InitialVelocity;
        // Some CS2 builds leave InitialVelocity empty, while AbsVelocity is already initialized.
        if (velocity.X == 0 && velocity.Y == 0 && velocity.Z == 0) velocity = projectile.AbsVelocity;
        var spin = projectile.AngVelocity;
        _rethrows.Remember(player.SteamID, new(projectile.DesignerName,
            new(position.X, position.Y, position.Z), new(angles.X, angles.Y, angles.Z),
            new(velocity.X, velocity.Y, velocity.Z), new(spin.X, spin.Y, spin.Z), projectile.ItemIndex,
            projectile.DesignerName == "molotov_projectile" && new CMolotovProjectile(projectile.Handle).IsIncGrenade),
            projectile.Globalname);
    }

    private void RethrowGrenade(CCSPlayerController player)
    {
        if (_rethrows.Last(player.SteamID) is not { } grenade)
        { Tell(player, "Noch kein Wurf gespeichert. Wirf zuerst eine Granate."); return; }

        // MatchZy's entity API fallback, without a dependency on its native factory signatures:
        // https://github.com/shobhit-pathak/MatchZy/blob/dev/GrenadeThrownData.cs
        var projectile = Utilities.CreateEntityByName<CBaseCSGrenadeProjectile>(grenade.DesignerName);
        if (projectile == null)
        { Tell(player, "Granate konnte nicht erneut geworfen werden."); return; }
        projectile.Globalname = GrenadeRethrowHistory.Marker;
        projectile.ItemIndex = grenade.ItemIndex;
        projectile.TeamNum = player.TeamNum;
        if (grenade.DesignerName == "molotov_projectile")
            new CMolotovProjectile(projectile.Handle).IsIncGrenade = grenade.Incendiary;
        projectile.DispatchSpawn();

        var p = grenade.Position;
        var v = grenade.Velocity;
        var a = grenade.Angles;
        var spin = grenade.AngularVelocity;
        projectile.InitialPosition.X = p.X;
        projectile.InitialPosition.Y = p.Y;
        projectile.InitialPosition.Z = p.Z;
        projectile.InitialVelocity.X = v.X;
        projectile.InitialVelocity.Y = v.Y;
        projectile.InitialVelocity.Z = v.Z;
        projectile.AngVelocity.X = spin.X;
        projectile.AngVelocity.Y = spin.Y;
        projectile.AngVelocity.Z = spin.Z;
        projectile.Teleport(new Vector(p.X, p.Y, p.Z), new QAngle(a.X, a.Y, a.Z), new Vector(v.X, v.Y, v.Z));
        // Leave Thrower unset. Synthetic detonation events must not complete a real throw's
        // capture or flight measurement, especially molotov events without an entity id.
        Tell(player, "Letzte Granate erneut geworfen.");
    }
}

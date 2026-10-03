using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Memory.DynamicFunctions;
using CounterStrikeSharp.API.Modules.Utils;

namespace MatchZyNades;

// ABI/signatures verified against MatchZy's GrenadeProjectiles.cs and gamedata/matchzy.json.
// https://github.com/shobhit-pathak/MatchZy
public sealed class GrenadeProjectileFactory
{
    private readonly Dictionary<string, BaseMemoryFunction> _functions = [];

    private T Resolve<T>(string key, Func<string, T> create) where T : BaseMemoryFunction
    {
        if (_functions.TryGetValue(key, out var cached)) return (T)cached;
        var function = create(GameData.GetSignature(key));
        if (function.Handle == IntPtr.Zero)
            throw new InvalidOperationException($"Engine-Funktion {key} nicht gefunden. playbook-nades.json und CS2-Build prüfen.");
        _functions[key] = function;
        return function;
    }

    public CBaseCSGrenadeProjectile? Create(GrenadeRethrow grenade, int team)
    {
        var p = grenade.Position;
        var a = grenade.Angles;
        var v = grenade.Velocity;
        var s = grenade.AngularVelocity;
        var position = new Vector(p.X, p.Y, p.Z);
        var angles = new QAngle(a.X, a.Y, a.Z);
        var velocity = new Vector(v.X, v.Y, v.Z);
        var spin = new Vector(s.X, s.Y, s.Z);
        switch (grenade.DesignerName)
        {
            case "smokegrenade_projectile":
                return Resolve("PlaybookSmoke_Create", sig => new MemoryFunctionWithReturn<IntPtr, IntPtr, IntPtr, IntPtr, IntPtr, int, int, CSmokeGrenadeProjectile>(sig))
                    .Invoke(position.Handle, angles.Handle, velocity.Handle, spin.Handle, IntPtr.Zero, grenade.ItemIndex, team);
            case "hegrenade_projectile":
                return Resolve("PlaybookHE_Create", sig => new MemoryFunctionWithReturn<IntPtr, IntPtr, IntPtr, IntPtr, IntPtr, int, CHEGrenadeProjectile>(sig))
                    .Invoke(position.Handle, angles.Handle, velocity.Handle, spin.Handle, IntPtr.Zero, grenade.ItemIndex);
            case "molotov_projectile":
                return Resolve("PlaybookMolotov_Create", sig => new MemoryFunctionWithReturn<IntPtr, IntPtr, IntPtr, IntPtr, IntPtr, int, CMolotovProjectile>(sig))
                    .Invoke(position.Handle, angles.Handle, velocity.Handle, spin.Handle, IntPtr.Zero, grenade.ItemIndex);
            case "decoy_projectile":
                return Resolve("PlaybookDecoy_Create", sig => new MemoryFunctionWithReturn<IntPtr, IntPtr, IntPtr, IntPtr, IntPtr, int, CDecoyProjectile>(sig))
                    .Invoke(position.Handle, angles.Handle, velocity.Handle, spin.Handle, IntPtr.Zero, grenade.ItemIndex);
            case "flashbang_projectile":
                var flash = Utilities.CreateEntityByName<CFlashbangProjectile>(grenade.DesignerName);
                if (flash is { IsValid: true }) flash.DispatchSpawn();
                return flash;
            default:
                throw new InvalidOperationException($"Nicht unterstütztes Wiederholungsprojektil: {grenade.DesignerName}");
        }
    }
}

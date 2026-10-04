namespace Playbook;

// Value copies survive removal of the original projectile.
public sealed record GrenadeRethrow(string DesignerName, Coordinates Position, Coordinates Angles,
    Coordinates Velocity, Coordinates AngularVelocity, ushort ItemIndex, bool Incendiary = false);

public sealed class GrenadeRethrowHistory
{
    public const string Marker = "playbook_rethrow";
    private readonly Dictionary<ulong, GrenadeRethrow> _last = [];

    public void Remember(ulong steamId, GrenadeRethrow grenade, string globalName = "")
    {
        TryRemember(steamId, grenade, out _, globalName);
    }

    public bool TryRemember(ulong steamId, GrenadeRethrow grenade, out string reason, string globalName = "")
    {
        reason = globalName == Marker ? "synthetischer Wiederholungswurf" :
            !Finite(grenade.Position) ? "ungültige Position" :
            !Finite(grenade.Angles) ? "ungültige Winkel" :
            !Finite(grenade.Velocity) ? "ungültige Geschwindigkeit" :
            !Finite(grenade.AngularVelocity) ? "ungültige Drehgeschwindigkeit" :
            grenade.Velocity is { X: 0, Y: 0, Z: 0 } ? "Geschwindigkeit ist null" : "";
        if (reason.Length > 0) return false;
        _last[steamId] = grenade;
        return true;
    }

    private static bool Finite(Coordinates value) => float.IsFinite(value.X) && float.IsFinite(value.Y) && float.IsFinite(value.Z);
    public GrenadeRethrow? Last(ulong steamId) => _last.GetValueOrDefault(steamId);
    public void Forget(ulong steamId) => _last.Remove(steamId);
    public void Clear() => _last.Clear();
}

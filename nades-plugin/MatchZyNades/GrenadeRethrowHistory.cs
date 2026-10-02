namespace MatchZyNades;

// Value copies survive removal of the original projectile.
public sealed record GrenadeRethrow(string DesignerName, Coordinates Position, Coordinates Angles,
    Coordinates Velocity, Coordinates AngularVelocity, ushort ItemIndex, bool Incendiary = false);

public sealed class GrenadeRethrowHistory
{
    public const string Marker = "playbook_rethrow";
    private readonly Dictionary<ulong, GrenadeRethrow> _last = [];

    public void Remember(ulong steamId, GrenadeRethrow grenade, string globalName = "")
    {
        if (globalName == Marker || !Finite(grenade.Position) || !Finite(grenade.Angles) ||
            !Finite(grenade.Velocity) || !Finite(grenade.AngularVelocity) ||
            grenade.Velocity is { X: 0, Y: 0, Z: 0 }) return;
        _last[steamId] = grenade;
    }

    private static bool Finite(Coordinates value) => float.IsFinite(value.X) && float.IsFinite(value.Y) && float.IsFinite(value.Z);
    public GrenadeRethrow? Last(ulong steamId) => _last.GetValueOrDefault(steamId);
    public void Forget(ulong steamId) => _last.Remove(steamId);
    public void Clear() => _last.Clear();
}

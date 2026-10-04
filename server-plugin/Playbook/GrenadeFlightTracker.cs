namespace Playbook;

// Simulation time, not wall time. Each real throw can complete only once.
public sealed class GrenadeFlightTracker
{
    private sealed record Flight(int Slot, ulong SteamId, NadeKind Kind, float ThrownAt, int? EntityId = null);
    private sealed record Spawn(int Slot, ulong SteamId, NadeKind Kind, float Time);
    private readonly List<Flight> _flights = [];
    private readonly Dictionary<int, Spawn> _spawns = [];

    public void Thrown(int slot, ulong steamId, NadeKind kind, float now)
    {
        Prune(now);
        if (kind == NadeKind.Other) return;
        var spawn = _spawns.Where(p => p.Value.Slot == slot && p.Value.SteamId == steamId && p.Value.Kind == kind &&
            Math.Abs(now - p.Value.Time) <= 0.5f).ToArray();
        var entity = spawn.Length == 1 ? (int?)spawn[0].Key : null;
        if (entity.HasValue) _spawns.Remove(entity.Value);
        _flights.Add(new(slot, steamId, kind, now, entity));
        if (_flights.Count > 256) _flights.RemoveAt(0);
    }

    public void Projectile(int entityId, int slot, ulong steamId, NadeKind kind, float now)
    {
        Prune(now);
        _flights.RemoveAll(f => f.EntityId == entityId);
        _spawns.Remove(entityId);
        var candidates = _flights.Where(f => f.EntityId == null && f.Slot == slot && f.SteamId == steamId &&
            f.Kind == kind && now - f.ThrownAt is >= 0 and <= 0.5f).ToArray();
        if (candidates.Length == 1)
        {
            var index = _flights.IndexOf(candidates[0]);
            _flights[index] = candidates[0] with { EntityId = entityId };
        }
        else _spawns[entityId] = new(slot, steamId, kind, now);
    }

    public float? Complete(int? entityId, int slot, ulong steamId, NadeKind kind, float now)
    {
        Prune(now);
        var candidates = _flights.Where(f => f.Slot == slot && f.SteamId == steamId && f.Kind == kind &&
            (entityId == null || f.EntityId == entityId)).ToArray();
        // An event may arrive without an entity association. Never guess between simultaneous throws.
        if (candidates.Length == 0 && entityId != null)
            candidates = _flights.Where(f => f.Slot == slot && f.SteamId == steamId && f.Kind == kind && f.EntityId == null).ToArray();
        if (candidates.Length != 1) return null;
        var flight = candidates[0];
        _flights.Remove(flight);
        var seconds = now - flight.ThrownAt;
        return float.IsFinite(seconds) && seconds >= 0 ? seconds : null;
    }

    private void Prune(float now)
    {
        _flights.RemoveAll(f => now - f.ThrownAt > 180);
        foreach (var key in _spawns.Where(p => now - p.Value.Time > 0.5f).Select(p => p.Key).ToArray()) _spawns.Remove(key);
    }
    public void Forget(int slot)
    {
        _flights.RemoveAll(f => f.Slot == slot);
        foreach (var key in _spawns.Where(p => p.Value.Slot == slot).Select(p => p.Key).ToArray()) _spawns.Remove(key);
    }
    public void Clear() { _flights.Clear(); _spawns.Clear(); }
}

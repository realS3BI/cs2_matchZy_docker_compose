namespace MatchZyNades;

// Pure state machine: one armed throw per player, but multiple identified projectiles in flight.
public sealed class NadeCaptureTracker
{
    private sealed record Flight(NadeLineup Lineup, int Slot, ulong SteamId, float Expires);
    private readonly Dictionary<int, Flight> _armed = [];
    private readonly Dictionary<int, Flight> _pending = [];
    private readonly Dictionary<int, Flight> _flights = [];
    // Source can report grenade_thrown and OnEntitySpawned in either order. Keep a
    // thrower/type association as well, since detonation events already carry userid.
    private readonly List<Flight> _detonations = [];

    public void Arm(int slot, ulong steamId, NadeLineup lineup, float now)
    {
        _pending.Remove(slot);
        _armed[slot] = new(lineup, slot, steamId, now + 120);
    }

    public NadeKind? ArmedKind(int slot, ulong steamId, float now)
    {
        if (!_armed.TryGetValue(slot, out var flight)) return null;
        if (flight.SteamId != steamId || flight.Expires < now) { _armed.Remove(slot); return null; }
        return flight.Lineup.Kind;
    }

    public bool Thrown(int slot, ulong steamId, NadeKind kind, float now)
    {
        _pending.Remove(slot);
        if (!_armed.TryGetValue(slot, out var flight) || flight.SteamId != steamId || flight.Expires < now || flight.Lineup.Kind != kind)
            return false;
        _armed.Remove(slot);
        _pending[slot] = flight with { Expires = now + 0.5f };
        _detonations.RemoveAll(p => p.Expires < now);
        _detonations.Add(flight with { Expires = now + 180 });
        if (_detonations.Count > 256) _detonations.RemoveAt(0);
        return true;
    }

    public void Projectile(int entityId, int slot, ulong steamId, NadeKind kind, float now)
    {
        // Never inherit an old association when Source reuses an entity index.
        _flights.Remove(entityId);
        foreach (var key in _flights.Where(p => p.Value.Expires < now).Select(p => p.Key).ToArray()) _flights.Remove(key);
        if (!_pending.TryGetValue(slot, out var flight) || flight.Expires < now || flight.SteamId != steamId || flight.Lineup.Kind != kind) return;
        _pending.Remove(slot);
        _flights[entityId] = flight with { Expires = now + 30 };
    }

    public NadeLineup? Complete(int entityId, int slot, ulong steamId, NadeKind kind, string map, float now)
    {
        if (!_flights.Remove(entityId, out var flight) || flight.Slot != slot || flight.SteamId != steamId ||
            flight.Lineup.Kind != kind || flight.Lineup.Map != map || flight.Expires < now) return null;
        RemoveDetonation(flight);
        return flight.Lineup;
    }

    public NadeLineup? CompleteByThrower(int slot, ulong steamId, NadeKind kind, string map, float now)
    {
        var index = _detonations.FindIndex(f => f.Slot == slot && f.SteamId == steamId &&
            f.Lineup.Kind == kind && f.Lineup.Map == map && f.Expires >= now);
        if (index < 0)
        {
            _detonations.RemoveAll(f => f.Expires < now);
            return null;
        }
        var flight = _detonations[index];
        _detonations.RemoveAt(index);
        // Once userid/type has confirmed a detonation, its entity entry is no longer needed.
        foreach (var entity in _flights.Where(p => p.Value.Slot == slot && p.Value.SteamId == steamId &&
            p.Value.Lineup.Name == flight.Lineup.Name && p.Value.Lineup.Owner == flight.Lineup.Owner).Select(p => p.Key).ToArray())
            _flights.Remove(entity);
        return flight.Lineup;
    }

    private void RemoveDetonation(Flight flight)
    {
        var index = _detonations.FindIndex(p => p.Slot == flight.Slot && p.SteamId == flight.SteamId &&
            p.Lineup.Owner == flight.Lineup.Owner && p.Lineup.Map == flight.Lineup.Map &&
            p.Lineup.Name == flight.Lineup.Name && p.Lineup.Kind == flight.Lineup.Kind);
        if (index >= 0) _detonations.RemoveAt(index);
    }

    public void Forget(int slot)
    {
        _armed.Remove(slot);
        _pending.Remove(slot);
        _detonations.RemoveAll(p => p.Slot == slot);
        foreach (var key in _flights.Where(p => p.Value.Slot == slot).Select(p => p.Key).ToArray()) _flights.Remove(key);
    }

    public void Clear() { _armed.Clear(); _pending.Clear(); _flights.Clear(); _detonations.Clear(); }
}

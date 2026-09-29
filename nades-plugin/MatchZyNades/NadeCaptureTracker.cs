namespace MatchZyNades;

// Pure state machine: one armed throw per player, but multiple identified projectiles in flight.
public sealed class NadeCaptureTracker
{
    private sealed record Flight(NadeLineup Lineup, int Slot, ulong SteamId, float Expires);
    private readonly Dictionary<int, Flight> _armed = [];
    private readonly Dictionary<int, Flight> _pending = [];
    private readonly Dictionary<int, Flight> _flights = [];

    public void Arm(int slot, ulong steamId, NadeLineup lineup, float now)
    {
        _pending.Remove(slot);
        _armed[slot] = new(lineup, slot, steamId, now + 120);
    }

    public void Thrown(int slot, ulong steamId, NadeKind kind, float now)
    {
        _pending.Remove(slot);
        if (_armed.Remove(slot, out var flight) && flight.SteamId == steamId && flight.Expires >= now && flight.Lineup.Kind == kind)
            _pending[slot] = flight with { Expires = now + 0.5f };
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
        return flight.Lineup;
    }

    public void Forget(int slot)
    {
        _armed.Remove(slot);
        _pending.Remove(slot);
        foreach (var key in _flights.Where(p => p.Value.Slot == slot).Select(p => p.Key).ToArray()) _flights.Remove(key);
    }

    public void Clear() { _armed.Clear(); _pending.Clear(); _flights.Clear(); }
}

namespace MatchZyNades;

public enum FireEffectOrigin { Unknown, Real, Synthetic, Ambiguous }
public readonly record struct FireEffectRoute(FireEffectOrigin Origin, long? Attempt = null);

// Molotov detonation events have a user id but no projectile id. Keep ambiguous
// batches ambiguous until every event has arrived; never guess a capture's target.
public sealed class FireEffectOrigins
{
    private sealed record Flight(float Started, long? Attempt);
    private sealed class Batch
    {
        public List<Flight> Pending { get; } = [];
        public bool Real { get; set; }
        public bool Ambiguous { get; set; }
    }
    private readonly Dictionary<ulong, Batch> _batches = [];

    public void Begin(ulong steamId, float now, long? attempt = null)
    {
        Prune(now);
        if (!_batches.TryGetValue(steamId, out var batch)) _batches[steamId] = batch = new();
        batch.Pending.Add(new(now, attempt));
        batch.Real |= attempt == null;
        batch.Ambiguous |= batch.Pending.Count > 1;
    }

    public FireEffectRoute Complete(ulong steamId, float now)
    {
        Prune(now);
        if (!_batches.TryGetValue(steamId, out var batch)) return new(FireEffectOrigin.Unknown);
        var flight = batch.Pending[0];
        var route = batch.Ambiguous
            ? new FireEffectRoute(batch.Real ? FireEffectOrigin.Ambiguous : FireEffectOrigin.Synthetic)
            : new FireEffectRoute(flight.Attempt == null ? FireEffectOrigin.Real : FireEffectOrigin.Synthetic, flight.Attempt);
        batch.Pending.RemoveAt(0);
        if (batch.Pending.Count == 0) _batches.Remove(steamId);
        return route;
    }

    private void Prune(float now)
    {
        foreach (var (steamId, batch) in _batches.ToArray())
        {
            batch.Pending.RemoveAll(f => now < f.Started || now - f.Started > 30);
            if (batch.Pending.Count == 0) _batches.Remove(steamId);
        }
    }
    public void Forget(ulong steamId) => _batches.Remove(steamId);
    public void Clear() => _batches.Clear();
}

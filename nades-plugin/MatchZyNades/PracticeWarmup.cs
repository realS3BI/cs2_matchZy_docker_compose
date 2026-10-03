namespace MatchZyNades;

// Ending warmup is asynchronous. Request each transition once instead of
// submitting it again on every maintenance tick or connecting player.
public sealed class PracticeWarmup
{
    private bool _endRequested;

    public void Update(bool active, Action endWarmup)
    {
        if (!active) { Reset(); return; }
        if (_endRequested) return;
        _endRequested = true;
        endWarmup();
    }

    public void Reset() => _endRequested = false;
}

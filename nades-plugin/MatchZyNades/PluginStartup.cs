namespace MatchZyNades;

// The queued callback belongs to one plugin load, even if it is unloaded or
// reloaded before the server reaches its first world update.
public sealed class PluginStartup
{
    private int _generation;

    public void Schedule(Action<Action> nextWorldUpdate, Action initialize)
    {
        var generation = ++_generation;
        nextWorldUpdate(() =>
        {
            if (generation != _generation) return;
            initialize();
        });
    }

    public void Cancel() => _generation++;
}

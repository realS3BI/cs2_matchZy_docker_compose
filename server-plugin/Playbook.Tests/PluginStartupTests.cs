using System.Reflection;
using CounterStrikeSharp.API;
using Playbook;
using Xunit;

namespace Playbook.Tests;

public sealed class PluginStartupTests
{
    [Fact]
    public void InitializationRunsFromCounterStrikeSharpWorldUpdateWithoutAGameTick()
    {
        var startup = new PluginStartup();
        var initialized = false;
        startup.Schedule(Server.NextWorldUpdate, () => initialized = true);

        Assert.False(initialized);
        // Drive CSS's actual managed queue, without loading a native CS2 server.
        var worldUpdate = typeof(Server).GetMethod("OnWorldUpdate", BindingFlags.NonPublic | BindingFlags.Static);
        Assert.NotNull(worldUpdate);
        worldUpdate.Invoke(null, null);

        Assert.True(initialized);
    }

    [Fact]
    public void ColdStartWaitsUntilGlobalVariablesAreAvailable()
    {
        var startup = new PluginStartup();
        var worldUpdates = new Queue<Action>();
        var globalsReady = false;
        var initialized = false;

        startup.Schedule(worldUpdates.Enqueue, () =>
        {
            if (!globalsReady) throw new InvalidOperationException("Global Variables not initialized yet.");
            initialized = true;
        });

        Assert.False(initialized);
        Assert.Single(worldUpdates);
        globalsReady = true;
        worldUpdates.Dequeue()();
        Assert.True(initialized);
        Assert.Empty(worldUpdates);
    }

    [Fact]
    public void UnloadBeforeFirstWorldUpdateCancelsInitialization()
    {
        var startup = new PluginStartup();
        var worldUpdates = new Queue<Action>();
        var initialized = false;
        startup.Schedule(worldUpdates.Enqueue, () => initialized = true);
        startup.Cancel();

        while (worldUpdates.TryDequeue(out var callback)) callback();

        Assert.False(initialized);
    }

    [Fact]
    public void ReloadOnlyInitializesTheLatestLoad()
    {
        var startup = new PluginStartup();
        var worldUpdates = new Queue<Action>();
        var loads = new List<string>();
        startup.Schedule(worldUpdates.Enqueue, () => loads.Add("old"));
        startup.Cancel();
        startup.Schedule(worldUpdates.Enqueue, () => loads.Add("new"));

        while (worldUpdates.TryDequeue(out var callback)) callback();

        Assert.Equal(["new"], loads);
    }
}

using System.Collections;
using System.Reflection;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Cvars;

namespace Playbook;

public sealed record TrainingToggles(bool Trajectory = false, bool Impacts = false, bool NoFlash = false, bool God = false);

// MatchZy has no public capability for this state. Read the loaded instance's
// public fields; never infer Practice from sv_cheats or from a requested command.
// If the integration changes, fail closed instead of enabling tools in a match.
public static class MatchZyState
{
    public static object? LoadedInstance()
    {
        try
        {
            var app = Application.Instance;
            if (app == null) return null;
            var manager = typeof(Application).GetField("_pluginManager", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(app);
            var contexts = manager?.GetType().GetMethod("GetLoadedPlugins")?.Invoke(manager, null) as IEnumerable;
            if (contexts == null) return null;
            foreach (var context in contexts)
            {
                var type = context.GetType();
                if (type.GetProperty("State")?.GetValue(context)?.ToString() != "Loaded") continue;
                var plugin = type.GetProperty("Plugin")?.GetValue(context);
                if (plugin?.GetType().FullName == "MatchZy.MatchZy") return plugin;
            }
            return null;
        }
        catch (Exception error) when (error is TargetException or TargetInvocationException or InvalidOperationException or ArgumentException)
        { return null; }
    }

    public static bool IsPractice(object? plugin) => plugin != null &&
        Read(plugin, "isPractice") is true && Read(plugin, "matchStarted") is false;
    public static string? ChatPrefix() => LoadedInstance() is { } plugin ? Read(plugin, "chatPrefix") as string : null;
    private static object? Read(object plugin, string name) => plugin.GetType().GetField(name)?.GetValue(plugin);
    public static TrainingToggles Toggles(CCSPlayerController player)
    {
        var plugin = LoadedInstance();
        var noFlash = plugin == null ? null : Read(plugin, "noFlashList") as IList;
        return new(
            ConVar.Find("sv_grenade_trajectory_prac_pipreview")?.GetPrimitiveValue<bool>() == true,
            ConVar.Find("sv_showimpacts")?.GetPrimitiveValue<int>() > 0,
            player.UserId.HasValue && noFlash?.Contains(player.UserId.Value) == true,
            player.PlayerPawn.Value?.Health > 100);
    }
}

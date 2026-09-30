using CounterStrikeSharp.API.Core;

namespace MatchZyNades;

public sealed partial class MatchZyNadesPlugin
{
    private void ToggleFavorite(CCSPlayerController player, NadeLineup? selected)
    {
        if (selected == null || !_menus.TryGetValue(player.Slot, out var session)) return;
        var library = ReadLibrary(player);
        if (library == null) return;
        var lineup = library.FirstOrDefault(n => NadeReference.From(n) == NadeReference.From(selected));
        if (lineup == null) { Tell(player, "Dieses Lineup ist nicht mehr verfügbar."); return; }
        try
        {
            var settings = session.Settings.ToggleFavorite(lineup);
            _settingsStore.Save(player.SteamID, settings);
            session.Settings = settings;
            session.Menu.Refresh(TrainingMenu.Create(library, session.Menu.Map, TrainingEnabled,
                _last.GetValueOrDefault(player.Slot), settings: settings, spawns: ReadCompetitiveSpawns()).Current);
            session.Library = library;
            Tell(player, settings.IsFavorite(lineup) ? "In deinen Favoriten gespeichert." : "Aus deinen Favoriten entfernt.");
        }
        catch (Exception error) when (error is IOException or InvalidDataException or UnauthorizedAccessException)
        { Tell(player, "Favoriten nicht gespeichert: " + error.Message); }
    }
}

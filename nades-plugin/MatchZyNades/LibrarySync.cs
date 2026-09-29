namespace MatchZyNades;

public sealed partial class MatchZyNadesPlugin
{
    private void SyncOpenLibraries()
    {
        foreach (var session in _menus.Values)
        {
            if (!Alive(session.Player) || session.Menu.ContainsPage("settings")) continue;
            var library = ReadLibrary(session.Player, quiet: true);
            // A partially written file must not erase the last usable menu. Retry next time.
            if (library == null || session.Library != null && session.Library.SequenceEqual(library)) continue;
            session.Library = library;
            if (_last.TryGetValue(session.Player.Slot, out var last))
            {
                var current = library.FirstOrDefault(n => n.Owner == last.Owner && n.Map == last.Map && n.Name == last.Name);
                if (current == null) _last.Remove(session.Player.Slot);
                else _last[session.Player.Slot] = current;
            }
            var fresh = TrainingMenu.Create(library, session.Menu.Map, TrainingEnabled,
                _last.GetValueOrDefault(session.Player.Slot), settings: session.Settings, spawns: ReadCompetitiveSpawns());
            session.Menu.Refresh(fresh.Current);
            session.DetailPage = 0;
            session.NextDraw = 0;
        }
    }
}

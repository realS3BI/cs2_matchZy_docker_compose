namespace Playbook;

public sealed partial class PlaybookPlugin
{
    private void SyncOpenLibraries()
    {
        ReadLineupResults();
        foreach (var session in _menus.Values)
        {
            if (!TrainingEnabled || !Alive(session.Player) || session.Menu.ContainsPage("settings")) continue;
            var library = ReadLibrary(session.Player, quiet: true);
            // A partially written file must not erase the last usable menu. Retry next time.
            if (library == null) continue;
            session.Library = library;
            if (_last.TryGetValue(session.Player.Slot, out var last))
            {
                var current = library.FirstOrDefault(n => n.Owner == last.Owner && n.Map == last.Map && n.Name == last.Name);
                if (current == null) _last.Remove(session.Player.Slot);
                else _last[session.Player.Slot] = current;
            }
            var fresh = BuildMenu(session.Player);
            session.Menu.Refresh(fresh.Current);
            session.NextDraw = 0;
        }
    }
}

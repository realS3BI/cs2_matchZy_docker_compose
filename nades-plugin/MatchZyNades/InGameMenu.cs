namespace MatchZyNades;

public enum TrainingAction
{
    Close, Back, StartPractice, LoadLineup, RepeatLineup, CheckPosition,
    Rethrow, LastThrow, ClearGrenades, SavePosition, LoadPosition, Noclip,
    Bot, CrouchBot, RemoveBots, Trajectory, Impacts, NoFlash, God,
    BestSpawn, WorstSpawn, StartCapture, SaveCapture, CancelCapture, RefreshLibrary, PanelSize, GiveGrenade,
    Settings, BindKey, ToggleGameButtons, ExportBindings
}

public sealed record MenuRequest(TrainingAction Action, NadeLineup? Lineup = null, NadeKind Kind = NadeKind.Other,
    string Setting = "", string Value = "");
public sealed record MenuItem(string Label, string Hint = "", MenuPage? Page = null,
    MenuRequest? Request = null, bool Enabled = true);
public sealed record MenuPage(string Title, string Description, IReadOnlyList<MenuItem> Items);

// No game API: navigation, rendering and the action gateway have separate responsibilities.
public sealed class InGameMenu(MenuPage root, string map)
{
    public const int PageSize = 5;
    private readonly Stack<(MenuPage Page, int Index)> _history = new();
    public string Map { get; } = map;
    public MenuPage Current { get; private set; } = root;
    public int Index { get; private set; }
    public int Cursor => Index % PageSize;
    public int Page => Index / PageSize;
    public int PageCount => Math.Max(1, (Current.Items.Count + PageSize - 1) / PageSize);
    public bool IsRoot => _history.Count == 0;
    public string Notice { get; set; } = "";
    public IEnumerable<MenuItem> Visible => Current.Items.Skip(Page * PageSize).Take(PageSize);
    public MenuItem? Selected => Current.Items.ElementAtOrDefault(Index);

    public void Enter(MenuPage page)
    {
        _history.Push((Current, Index));
        Current = page;
        Index = 0;
        Notice = "";
    }

    public void Move(int direction)
    {
        Notice = "";
        Index = Math.Clamp(Index + direction, 0, Math.Max(0, Current.Items.Count - 1));
    }
    public void ChangePage(int direction)
    {
        Notice = "";
        Index = Math.Clamp(Page + direction, 0, PageCount - 1) * PageSize;
    }

    public MenuRequest? Select(int key)
    {
        if (key is < 1 or > PageSize) return null;
        var item = Visible.ElementAtOrDefault(key - 1);
        if (item == null) return null;
        Index = Page * PageSize + key - 1;
        Notice = "";
        if (!item.Enabled) { Notice = item.Hint; return null; }
        if (item.Page is { } page)
        {
            Enter(page);
            return null;
        }
        return item.Request;
    }

    // False means the user is leaving the root. Child pages restore the exact selection.
    public bool Back()
    {
        Notice = "";
        if (!_history.TryPop(out var previous)) return false;
        Current = previous.Page;
        Index = previous.Index;
        return true;
    }
}

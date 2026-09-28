using CounterStrikeSharp.API;

namespace MatchZyNades;

public enum MenuInputAction { None, Up, Down, PreviousPage, NextPage, Select, Back }

public sealed class MenuInput(PlayerButtons initial)
{
    private PlayerButtons _previous = initial;
    // Buttons already held when opening must first be released without selecting anything.
    private PlayerButtons _armed;

    public MenuInputAction Read(PlayerButtons current)
    {
        _armed |= current & ~_previous;
        var released = _previous & ~current & _armed;
        _armed &= current;
        _previous = current;
        // Back wins if two actions are released together. Attacks never select a menu row.
        if ((released & PlayerButtons.Inspect) != 0) return MenuInputAction.Back;
        if ((released & PlayerButtons.Use) != 0) return MenuInputAction.Select;
        if ((released & PlayerButtons.Forward) != 0) return MenuInputAction.Up;
        if ((released & PlayerButtons.Back) != 0) return MenuInputAction.Down;
        if ((released & PlayerButtons.Moveleft) != 0) return MenuInputAction.PreviousPage;
        if ((released & PlayerButtons.Moveright) != 0) return MenuInputAction.NextPage;
        return MenuInputAction.None;
    }
}

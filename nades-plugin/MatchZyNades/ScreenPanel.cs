using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Extensions;

namespace MatchZyNades;

// Client-rendered HUD. No camera transforms, world text, or per-tick teleports.
// A fresh private entity per session avoids stale slot text state in CSS 374.
internal sealed class ScreenPanel(CCSPlayerController player) : IDisposable
{
    public const string Layout = "panorama/layout/custom_game/matchzy_training.xml";
    private CCSCustomHudLayout? _entity;
    private readonly Dictionary<string, string> _texts = [];
    private readonly Dictionary<string, bool> _classes = [];
    private bool _capturing;
    public bool Owns(CCSCustomHudLayout layout) => _entity is { IsValid: true } && _entity.Handle == layout.Handle;

    public void Draw(InGameMenu menu, bool focused, bool practice, int detailPage, PlayerPanelSettings settings)
    {
        if (_entity is not { IsValid: true })
        {
            _texts.Clear(); _classes.Clear(); _capturing = false;
            _entity = Utilities.CreateEntityByName<CCSCustomHudLayout>("custom_hud_layout")
                ?? throw new InvalidOperationException("custom_hud_layout unavailable.");
            _entity.StrLayout = Layout;
            _entity.DispatchSpawn();
        }
        Text("training_map", menu.Map);
        Text("training_title", menu.Current.Title);
        Text("training_state", focused ? "BEDIENUNG AKTIV" : "SPIELEN");
        Text("training_page", $"{(practice ? "Training bereit" : "Training inaktiv")}  /  {menu.Page + 1} von {menu.PageCount}");
        var rows = menu.Visible.ToArray();
        for (var i = 0; i < InGameMenu.PageSize; i++)
        {
            Text($"row_{i}_text", i < rows.Length ? rows[i].Label : "");
            Class($"row_{i}", "empty", i >= rows.Length);
            Class($"row_{i}", "selected", i == menu.Cursor && i < rows.Length);
            Class($"row_{i}", "disabled", i < rows.Length && !rows[i].Enabled);
        }
        var detail = menu.Notice.Length > 0 ? menu.Notice : menu.Selected?.Hint;
        if (string.IsNullOrWhiteSpace(detail)) detail = menu.Current.Description;
        var pages = PanelText.DetailPages(detail ?? "");
        var page = Math.Clamp(detailPage, 0, pages.Count - 1);
        Text("training_detail", pages[page]);
        Text("training_detail_page", pages.Count > 1 ? $"Beschreibung {page + 1}/{pages.Count}  |  {settings.Keys["details"]}" : "");
        Text("training_keys", $"{settings.Keys["focus"]}  Bedienen / Spielen    {settings.Keys["visible"]}  Anzeigen / Verstecken");
        Class("training_panel", "compact", settings.Compact);
        Class("training_panel", "editing", focused);
        Class("training_panel", "shown", true);
        Capture(focused);
    }
    private void Text(string id, string value)
    {
        if (_texts.GetValueOrDefault(id) == value) return;
        _entity!.SetDialogVariableStringForPlayer(player, id, "text", value);
        _texts[id] = value;
    }
    private void Class(string id, string name, bool value)
    {
        var key = id + ":" + name;
        if (_classes.TryGetValue(key, out var old) && old == value) return;
        _entity!.SetHasClassForPlayer(player, id, name, value);
        _classes[key] = value;
    }
    public void Capture(bool enabled)
    {
        if (_entity is not { IsValid: true } || !player.IsValid || _capturing == enabled) return;
        _entity.SetInputCaptureEnabled(player, enabled);
        _capturing = enabled;
    }
    public void ExcludeFrom(CCheckTransmitInfo info)
    {
        if (_entity is { IsValid: true }) info.TransmitEntities.Remove(_entity);
    }
    public void Dispose()
    {
        Capture(false);
        if (_entity is { IsValid: true }) _entity.Remove();
        _entity = null;
        _texts.Clear(); _classes.Clear();
    }
}

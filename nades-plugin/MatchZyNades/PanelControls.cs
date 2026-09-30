using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using Microsoft.Extensions.Logging;

namespace MatchZyNades;

public sealed partial class MatchZyNadesPlugin
{
    private PlayerPanelSettings ReadSettings(CCSPlayerController player)
    {
        try { return _settingsStore.Load(player.SteamID); }
        catch (Exception error) when (error is IOException or InvalidDataException or UnauthorizedAccessException or System.Text.Json.JsonException)
        {
            Logger.LogWarning(error, "Could not read panel settings for {SteamId}; keeping file and using defaults", player.SteamID);
            Tell(player, "Deine Einstellungen konnten nicht gelesen werden. Vorläufig gelten die Standardwerte.");
            return new();
        }
    }

    private bool HandleSettingsAction(CCSPlayerController player, MenuRequest request)
    {
        var settings = _menus.TryGetValue(player.Slot, out var session) ? session.Settings : ReadSettings(player);
        switch (request.Action)
        {
            case TrainingAction.Settings:
                if (session != null)
                { session.Menu.Enter(PanelSettingsMenu.Create(settings)); session.NextDraw = 0; }
                return true;
            case TrainingAction.ExportBindings:
                foreach (var line in settings.ConsoleExport().Split('\n')) player.PrintToConsole(line);
                Tell(player, "Die beiden Befehlszeilen stehen in deiner Konsole.");
                return true;
            default: return false;
        }
    }

    [ConsoleCommand("css_training_bind", "Legacy command: custom panel keys have been removed")]
    public void OnBindPanelKey(CCSPlayerController? player, CommandInfo command)
    {
        if (player is not { IsValid: true, IsBot: false } || player.SteamID == 0) return;
        Tell(player, "Freie Tastenzuweisungen wurden entfernt. Feste Belegung: css_training_binds.");
    }

    [ConsoleCommand("css_training_binds", "Print the fixed panel binds for a local CFG")]
    public void OnExportPanelKeys(CCSPlayerController? player, CommandInfo command)
    {
        if (player is { IsValid: true, IsBot: false } && player.SteamID != 0)
            HandleSettingsAction(player, new(TrainingAction.ExportBindings));
    }

    [ConsoleCommand("css_training_key", "Dispatch a fixed panel key")]
    public void OnPanelKey(CCSPlayerController? player, CommandInfo command)
    {
        if (!TrainingEnabled || !Alive(player) || command.ArgCount != 2 || player!.SteamID == 0) return;
        var settings = _menus.TryGetValue(player.Slot, out var session) ? session.Settings : ReadSettings(player);
        if (settings.ActionForKey(command.GetArg(1)) is { } action) RunPanelAction(player, action);
    }

    [ConsoleCommand("css_tk", "Dispatch a fixed panel key by index (0-7)")]
    public void OnShortPanelKey(CCSPlayerController? player, CommandInfo command)
    {
        if (!TrainingEnabled || !Alive(player) || command.ArgCount != 2 || player!.SteamID == 0) return;
        if (PlayerPanelSettings.ActionForIndex(command.GetArg(1)) is { } action) RunPanelAction(player, action);
    }

    private void OnPanelClicked(CCSPlayerController player, CCSCustomHudLayout layout, string buttonId)
    {
        if (!Alive(player) || !_menus.TryGetValue(player.Slot, out var session) ||
            !session.Visible || !session.Focused || !session.Panel.Owns(layout)) return;
        session.LastInput = CounterStrikeSharp.API.Server.CurrentTime;
        if (buttonId.StartsWith("row_", StringComparison.Ordinal) &&
            int.TryParse(buttonId.AsSpan(4), out var row) && row is >= 0 and < InGameMenu.PageSize)
        { Select(player, row + 1); return; }
        var action = buttonId switch
        {
            "training_back" => "back", "training_previous" => "previous", "training_next" => "next",
            "training_home" => "home",
            "training_settings" => "settings", "training_play" => "focus",
            "training_hide" => "visible", _ => ""
        };
        RunPanelAction(player, action);
    }

    private void RunPanelAction(CCSPlayerController player, string action)
    {
        if (!TrainingEnabled) { Close(player.Slot); return; }
        if (action == "focus") { TogglePanelControl(player); return; }
        if (action == "visible") { TogglePanelVisible(player); return; }
        if (action == "settings")
        {
            if (!_menus.ContainsKey(player.Slot)) Open(player);
            if (_menus.TryGetValue(player.Slot, out var panel))
            { panel.Visible = true; SetFocus(panel, true); HandleSettingsAction(player, new(TrainingAction.Settings)); }
            return;
        }
        if (!_menus.TryGetValue(player.Slot, out var session) || !session.Visible || !session.Focused) return;
        session.LastInput = CounterStrikeSharp.API.Server.CurrentTime;
        switch (action)
        {
            case "up": session.Menu.Move(-1); break;
            case "down": session.Menu.Move(1); break;
            case "select": Select(player, session.Menu.Cursor + 1); break;
            case "back": if (!session.Menu.Back()) SetFocus(session, false); break;
            case "previous": session.Menu.ChangePage(-1); break;
            case "next": session.Menu.ChangePage(1); break;
            case "home": session.Menu.Home(); break;
        }
        session.NextDraw = 0;
    }
}

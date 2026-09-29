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
            Tell(player, "Deine Einstellungen konnten nicht gelesen werden. Vorlaeufig gelten die Standardwerte.");
            return new();
        }
    }

    private bool SaveSettings(CCSPlayerController player, PlayerPanelSettings settings)
    {
        try { _settingsStore.Save(player.SteamID, settings); }
        catch (Exception error) when (error is IOException or InvalidDataException or UnauthorizedAccessException)
        { Tell(player, "Einstellungen nicht gespeichert: " + error.Message); return false; }
        if (_menus.TryGetValue(player.Slot, out var session))
        {
            session.Settings = settings;
            session.Input = new(player.Buttons);
            session.Menu = BuildMenu(player);
            session.Menu.Enter(PanelSettingsMenu.Create(settings));
            session.DetailPage = 0;
            session.NextDraw = 0;
        }
        Tell(player, "Deine Einstellungen wurden fuer deine Steam-ID gespeichert.");
        return true;
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
            case TrainingAction.ToggleGameButtons:
                SaveSettings(player, settings with { GameButtons = !settings.GameButtons });
                return true;
            case TrainingAction.BindKey:
                try
                {
                    var changed = settings.Bind(request.Setting, request.Value);
                    if (SaveSettings(player, changed))
                    {
                        var line = changed.BindingLine(request.Setting);
                        player.PrintToConsole(line);
                        Tell(player, "Gespeichert. Einmal in deiner CS2-Konsole setzen: " + line + ". Der Server kann Client-Binds nicht selbst aendern.");
                    }
                }
                catch (InvalidDataException error) { Tell(player, error.Message); }
                return true;
            case TrainingAction.ExportBindings:
                player.PrintToConsole("// MatchZy Training: vorher eigene Binds sichern; in lokale CFG uebernehmen.\n" + settings.Export());
                Tell(player, "Deine Bind-Befehle stehen in der Client-Konsole. Alte, nicht mehr verwendete Binds dort selbst wiederherstellen.");
                return true;
            default: return false;
        }
    }

    [ConsoleCommand("css_training_bind", "Save your panel hotkey: css_training_bind focus K")]
    public void OnBindPanelKey(CCSPlayerController? player, CommandInfo command)
    {
        if (player is not { IsValid: true, IsBot: false } || player.SteamID == 0) return;
        if (command.ArgCount != 3)
        { command.ReplyToCommand("css_training_bind <" + string.Join('|', PlayerPanelSettings.DefaultKeys.Keys) + "> <key>"); return; }
        HandleSettingsAction(player, new(TrainingAction.BindKey, Setting: command.GetArg(1).ToLowerInvariant(), Value: command.GetArg(2)));
    }

    [ConsoleCommand("css_training_binds", "Print your saved panel binds for a local CFG")]
    public void OnExportPanelKeys(CCSPlayerController? player, CommandInfo command)
    {
        if (player is { IsValid: true, IsBot: false } && player.SteamID != 0)
            HandleSettingsAction(player, new(TrainingAction.ExportBindings));
    }

    [ConsoleCommand("css_training_key", "Dispatch a locally bound key using your saved panel settings")]
    public void OnPanelKey(CCSPlayerController? player, CommandInfo command)
    {
        if (!Alive(player) || command.ArgCount != 2 || player!.SteamID == 0) return;
        var settings = _menus.TryGetValue(player.Slot, out var session) ? session.Settings : ReadSettings(player);
        if (settings.ActionForKey(command.GetArg(1)) is { } action) RunPanelAction(player, action);
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
            "training_more" => "details", "training_settings" => "settings", "training_play" => "focus",
            "training_hide" => "visible", _ => ""
        };
        RunPanelAction(player, action);
    }

    private void RunPanelAction(CCSPlayerController player, string action)
    {
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
        if (action != "details") session.DetailPage = 0;
        switch (action)
        {
            case "up": session.Menu.Move(-1); break;
            case "down": session.Menu.Move(1); break;
            case "select": Select(player, session.Menu.Cursor + 1); break;
            case "back": Select(player, 6); break;
            case "previous": Select(player, 7); break;
            case "next": Select(player, 8); break;
            case "details":
                var detail = session.Menu.Notice.Length > 0 ? session.Menu.Notice : session.Menu.Selected?.Hint;
                if (string.IsNullOrWhiteSpace(detail)) detail = session.Menu.Current.Description;
                session.DetailPage = (session.DetailPage + 1) % PanelText.DetailPages(detail ?? "").Count;
                break;
        }
        session.NextDraw = 0;
    }
}

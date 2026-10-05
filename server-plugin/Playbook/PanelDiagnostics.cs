using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Utils;
using Microsoft.Extensions.Logging;

namespace Playbook;

public sealed partial class PlaybookPlugin
{
    private void LogPanelState(CCSPlayerController? player, string reason, MenuSession? session = null)
    {
        if (player is not { IsValid: true })
        {
            Logger.LogInformation("[Playbook-HUD] {Reason}; kein gültiger Spieler", reason);
            return;
        }
        if (session == null) _menus.TryGetValue(player.Slot, out session);
        var pawn = player.PlayerPawn.Value;
        var state = $"Sitzung={session != null}; sichtbar={session?.Visible ?? false}; Fokus={session?.Focused ?? false}; Entity={session?.Panel.EntityIndex?.ToString() ?? "keine"}; Eingabeübernahme={session?.Panel.Capturing ?? false}";
        var movement = pawn is { IsValid: true }
            ? $"Bewegung={pawn.MoveType}/{pawn.ActualMoveType}; eingefroren={(pawn.Flags & (uint)PlayerFlags.FL_FROZEN) != 0}; eigene Sperre={session?.OwnsFreeze ?? false}"
            : "Kein gültiger Pawn";
        var config = $"Training={TrainingEnabled}; Modus={_serverMode}; HUD bereit={Environment.GetEnvironmentVariable("PLAYBOOK_TRAINING_HUD_READY") == "1"}; Berechtigung={CanControl(player)}";
        Logger.LogInformation("[Playbook-HUD] {Reason}; SteamID={SteamId}; Slot={Slot}; Map={Map}; Plugin={Version}; {Config}; {State}; {Movement}; Layout={Layout}; Client-Anzeige unbestätigt",
            reason, player.SteamID, player.Slot, Server.MapName, ModuleVersion, config, state, movement, ScreenPanel.Layout);
        // Separate short lines survive the client console's per-message byte limit.
        player.PrintToConsole($"[Playbook-HUD] {reason}; Slot={player.Slot}; Plugin={ModuleVersion}");
        player.PrintToConsole(FormattableString.Invariant($"[Playbook-HUD] Serverzeit={Server.CurrentTime:0.000}; Team={player.TeamNum}; lebend={player.PawnIsAlive}"));
        player.PrintToConsole($"[Playbook-HUD] {config}");
        player.PrintToConsole($"[Playbook-HUD] {state}");
        player.PrintToConsole($"[Playbook-HUD] {movement}");
    }

    [ConsoleCommand("css_training_debug", "Print panel diagnostics to client console and server log")]
    public void OnPanelDebug(CCSPlayerController? player, CommandInfo command)
    {
        LogPanelState(player, "Status angefordert");
        if (player is not { IsValid: true }) return;
        player.PrintToConsole($"[Playbook-HUD] Layout: {ScreenPanel.Layout}");
        PrintPanelAssetHint(player);
    }

    private static void PrintPanelAssetHint(CCSPlayerController player)
    {
        player.PrintToConsole("[Playbook-HUD] Client-Anzeige unbestätigt. Der Server kann lokale Panorama-Dateien nicht prüfen.");
        player.PrintToConsole("[Playbook-HUD] Bei leerem Panel: lokale HUD-Dateien installieren oder Workshop-Auslieferung prüfen, danach CS2 neu starten.");
        player.PrintToConsole("[Playbook-HUD] Steuerung freigeben: KP_0 erneut drücken oder css_nades close eingeben.");
    }
}

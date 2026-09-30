using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Commands;
using System.Text.Json;

namespace MatchZyNades;

// The web service atomically publishes this file. Never infer platform roles from
// arbitrary CSS flags or MatchZy's everyone-is-admin setting.
public sealed class PlatformRoles(string path)
{
    public string Role(ulong steamId)
    {
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            return document.RootElement.TryGetProperty(steamId.ToString(), out var role) &&
                role.GetString() is "admin" or "match_admin" ? role.GetString()! : "player";
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException or InvalidOperationException)
        { return "player"; }
    }

    public static bool Blocks(string role, string command)
    {
        command = PlaybookCommands.Normalize(command);
        if (role == "player") return command.StartsWith("css_") || command.StartsWith("matchzy_") || command.StartsWith("get5_") || command is "noclip" or "sm_pause" or "sm_unpause" or "reload_admins";
        // MatchZy's save/import commands bypass the panel's content checks.
        return role == "match_admin" && command is "css_savenade" or "css_sn" or "css_importnade" or "css_in" or "css_deletenade" or "css_delnade" or "css_dn" or "css_save_nades_as_global" or "css_globalnades";
    }
}

public sealed partial class MatchZyNadesPlugin
{
    private readonly PlatformRoles _roles = new("/config-runtime/platform-roles.json");
    private string _appliedAdmins = "";
    private bool CanControl([System.Diagnostics.CodeAnalysis.NotNullWhen(true)] CCSPlayerController? player) => player is { IsValid: true, IsBot: false } && _roles.Role(player.SteamID) is "admin" or "match_admin";
    private bool CanWriteNades(CCSPlayerController? player) => player is { IsValid: true, IsBot: false } && _roles.Role(player.SteamID) == "admin";

    private HookResult GuardCommand(CCSPlayerController? player, CommandInfo info)
    {
        if (player is not { IsValid: true }) return HookResult.Continue; // Server RCON remains authorized separately.
        var command = info.GetArg(0);
        if (command is "say" or "say_team") command = info.ArgString;
        if (PlatformRoles.Blocks(_roles.Role(player.SteamID), command))
        { player.PrintToChat(ChatMessage("Deine Rolle erlaubt diesen Befehl nicht.")); return HookResult.Stop; }
        if (!PlaybookCommands.Blocks(_serverMode, TrainingEnabled, command)) return HookResult.Continue;
        player.PrintToChat(ChatMessage("Dieser Befehl ist in diesem Spielmodus nicht verfügbar."));
        return HookResult.Stop;
    }

    private void SyncPermissions()
    {
        try
        {
            var json = File.ReadAllText("/config-runtime/csharp-admins.json");
            if (json != _appliedAdmins)
            {
                using var valid = JsonDocument.Parse(json);
                var path = Path.Combine(Server.GameDirectory, "csgo", "addons", "counterstrikesharp", "configs", "admins.json");
                File.WriteAllText(path + ".tmp", json);
                File.Move(path + ".tmp", path, true);
                Server.ExecuteCommand("css_admins_reload");
                _appliedAdmins = json;
            }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException) { }
        foreach (var session in _menus.Values.ToArray())
            if (!CanControl(session.Player)) { ClearCapture(session.Player.Slot); Close(session.Player.Slot); }
        if (StandaloneTraining)
            foreach (var player in Utilities.GetPlayers())
                if (player is { IsValid: true, IsBot: false } && !CanControl(player))
                {
                    ForgetTraining(player.SteamID);
                    ApplyPlayerTraining(player);
                    if (player.PlayerPawn.Value is { IsValid: true, MoveType: MoveType_t.MOVETYPE_NOCLIP } pawn)
                    {
                        pawn.MoveType = pawn.ActualMoveType = MoveType_t.MOVETYPE_WALK;
                        Utilities.SetStateChanged(pawn, "CBaseEntity", "m_MoveType");
                    }
                }
    }
}

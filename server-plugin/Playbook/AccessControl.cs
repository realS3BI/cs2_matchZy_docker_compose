using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Commands;
using System.Text.Json;

namespace Playbook;

// One atomic snapshot contains command capabilities and CSS flags. Missing or invalid
// data revokes privileges; it never falls back to a stale role file.
public sealed record PermissionSnapshot(string Revision, Dictionary<string, string[]> Users, string CssAdmins)
{
    public static PermissionSnapshot Empty => new("", [], "{}");
    public string[] For(ulong id) => Users.GetValueOrDefault(id.ToString(), []);
}

public sealed class ServerPermissions(string path)
{
    public PermissionSnapshot Read()
    {
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var root = document.RootElement;
            if (root.GetProperty("schemaVersion").GetInt32() != 1 || root.GetProperty("serverId").GetString() != "primary") return PermissionSnapshot.Empty;
            var revision = root.GetProperty("revision").GetString() ?? "";
            if (revision.Length != 64 || !revision.All(Uri.IsHexDigit)) return PermissionSnapshot.Empty;
            var users = new Dictionary<string, string[]>();
            foreach (var user in root.GetProperty("users").EnumerateObject())
            {
                var permissions = user.Value.EnumerateArray().Select(value => value.GetString() ?? "").ToArray();
                if (!ulong.TryParse(user.Name, out _) || permissions.Any(value => value is not ("training.use" or "commands.control" or "lineups.capture"))) return PermissionSnapshot.Empty;
                users.Add(user.Name, permissions);
            }
            var css = root.GetProperty("cssAdmins");
            if (css.ValueKind != JsonValueKind.Object) return PermissionSnapshot.Empty;
            return new(revision, users, css.GetRawText());
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException or InvalidOperationException or KeyNotFoundException or FormatException or ArgumentException)
        { return PermissionSnapshot.Empty; }
    }

    public static bool Blocks(string[] permissions, string command)
    {
        command = PlaybookCommands.Normalize(command);
        if (command is "css_savenade" or "css_sn" or "css_importnade" or "css_in" or "css_deletenade" or "css_delnade" or "css_dn" or "css_save_nades_as_global" or "css_globalnades")
            return !permissions.Contains("lineups.capture") || !permissions.Contains("training.use");
        if (permissions.Contains("training.use") && TrainingCommand(command)) return false;
        return !permissions.Contains("commands.control") && (command.StartsWith("css_") || command.StartsWith("matchzy_") || command.StartsWith("get5_") || command is "noclip" or "sm_pause" or "sm_unpause" or "reload_admins");
    }

    public static bool CanUsePanel(string[] permissions) => permissions.Contains("training.use");

    // No CSS admin flags: these commands are usable by ordinary players in MatchZy practice.
    // Keep the list explicit so new commands do not silently grant server administration.
    private static bool TrainingCommand(string command) => command is
        "css_nades" or "css_nades_select" or "css_nades_last" or
        "css_training" or "css_training_visible" or "css_training_binds" or
        "css_training_key" or "css_tk" or "css_training_vote" or
        "css_y" or "css_n" or "css_mapja" or "css_mapnein" or
        "css_rethrow" or "css_rt" or "css_last" or "css_clear" or "css_savepos" or "css_loadpos" or
        "css_bot" or "css_cbot" or "css_crouchbot" or "css_nobots" or "css_traj" or "css_impacts" or
        "css_noflash" or "css_god" or "css_bestspawn" or "css_worstspawn" or "noclip";
}

public sealed partial class PlaybookPlugin
{
    private readonly ServerPermissions _permissions = new("/config-runtime/permissions.json");
    private string _appliedAdmins = "";
    private bool CanControl([System.Diagnostics.CodeAnalysis.NotNullWhen(true)] CCSPlayerController? player) => player is { IsValid: true, IsBot: false } && ServerPermissions.CanUsePanel(_permissions.Read().For(player.SteamID));
    private bool CanWriteNades(CCSPlayerController? player) => player is { IsValid: true, IsBot: false } && CanControl(player) && _permissions.Read().For(player.SteamID).Contains("lineups.capture");

    private HookResult GuardCommand(CCSPlayerController? player, CommandInfo info)
    {
        if (player is not { IsValid: true }) return HookResult.Continue; // Server RCON remains authorized separately.
        var command = info.GetArg(0);
        if (command is "say" or "say_team") command = info.ArgString;
        if (ServerPermissions.Blocks(_permissions.Read().For(player.SteamID), command))
        { player.PrintToChat(ChatMessage("Deine Rolle erlaubt diesen Befehl nicht.")); return HookResult.Stop; }
        if (!PlaybookCommands.Blocks(_serverMode, TrainingEnabled, command)) return HookResult.Continue;
        player.PrintToChat(ChatMessage("Dieser Befehl ist in diesem Spielmodus nicht verfügbar."));
        return HookResult.Stop;
    }

    private void SyncPermissions()
    {
        try
        {
            var snapshot = _permissions.Read();
            var json = snapshot.CssAdmins;
            if (json != _appliedAdmins)
            {
                using var valid = JsonDocument.Parse(json);
                var path = Path.Combine(Server.GameDirectory, "csgo", "addons", "counterstrikesharp", "configs", "admins.json");
                File.WriteAllText(path + ".tmp", json);
                File.Move(path + ".tmp", path, true);
                Server.ExecuteCommand("css_admins_reload");
                _appliedAdmins = json;
            }
            var acknowledgement = Path.Combine(Server.GameDirectory, "csgo", "cfg", "MatchZy", "permissions-applied.json");
            Directory.CreateDirectory(Path.GetDirectoryName(acknowledgement)!);
            var applied = JsonSerializer.Serialize(new { revision = snapshot.Revision });
            if (!File.Exists(acknowledgement) || File.ReadAllText(acknowledgement) != applied)
            {
                File.WriteAllText(acknowledgement + ".tmp", applied);
                File.Move(acknowledgement + ".tmp", acknowledgement, true);
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

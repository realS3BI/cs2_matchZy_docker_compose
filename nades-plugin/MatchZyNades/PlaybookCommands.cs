namespace MatchZyNades;

// Command names are compatibility data from MatchZy's ConsoleCommand registrations.
// https://github.com/shobhit-pathak/MatchZy (2026-09-30).
public static class PlaybookCommands
{
    public static string Normalize(string raw)
    {
        var command = raw.Trim().Trim('"').Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()?.ToLowerInvariant() ?? "";
        return command.StartsWith('.') || command.StartsWith('!') || command.StartsWith('/') ? "css_" + command[1..] : command;
    }

    public static readonly HashSet<string> TrainingCommands = [
        "css_help", "css_loadnade", "css_ln", "css_listnades", "css_lin", "css_last", "css_savepos", "css_loadpos",
        "css_noclip", "css_clear", "css_traj", "css_impacts", "css_noflash", "css_noblind", "css_god",
        "css_bot", "css_cbot", "css_crouchbot", "css_nobots", "css_rethrow", "css_rt"
    ];
    private static readonly HashSet<string> PracticeCommands = [
        "css_back", "css_bestctspawn", "css_bestspawn", "css_besttspawn", "css_boost",
        "css_bot", "css_break", "css_cbot", "css_clear", "css_crouchboost",
        "css_crouchbot", "css_cts", "css_ctspawn", "css_delay", "css_deletenade",
        "css_delnade", "css_dn", "css_dry", "css_dryrun", "css_fas",
        "css_fastforward", "css_ff", "css_god", "css_hidespawns", "css_impacts",
        "css_importnade", "css_in", "css_last", "css_lastindex", "css_lin",
        "css_listnades", "css_ln", "css_loadnade", "css_loadpos", "css_noblind",
        "css_nobots", "css_noflash", "css_pip", "css_prac", "css_rethrow",
        "css_rethrowdecoy", "css_rethrowflash", "css_rethrowgrenade", "css_rethrowmolotov", "css_rethrownade",
        "css_rethrowsmoke", "css_rt", "css_savenade", "css_savepos", "css_showspawns",
        "css_sn", "css_solid", "css_spawn", "css_spec", "css_tactics",
        "css_throw", "css_throwdecoy", "css_throwflash", "css_throwgrenade", "css_throwidx",
        "css_throwindex", "css_throwmolotov", "css_thrownade", "css_throwsmoke", "css_timer",
        "css_timer2", "css_traj", "css_ts", "css_tspawn", "css_watchme",
        "css_worstctspawn", "css_worstspawn", "css_worsttspawn",
    ];
    private static readonly HashSet<string> MatchZyCommands = [
        "css_asay", "css_back", "css_ban", "css_bestctspawn", "css_bestspawn",
        "css_besttspawn", "css_boost", "css_bot", "css_break", "css_cbot",
        "css_clear", "css_coach", "css_crouchboost", "css_crouchbot", "css_ct",
        "css_cts", "css_ctspawn", "css_delay", "css_deletenade", "css_delnade",
        "css_dn", "css_dry", "css_dryrun", "css_endmatch", "css_exitprac",
        "css_fas", "css_fastforward", "css_ff", "css_force", "css_forceend",
        "css_forcepause", "css_forceready", "css_forcestart", "css_forceunpause", "css_fp",
        "css_fup", "css_globalnades", "css_god", "css_help", "css_hidespawns",
        "css_impacts", "css_importnade", "css_in", "css_last", "css_lastindex",
        "css_lin", "css_listnades", "css_ln", "css_loadnade", "css_loadpos",
        "css_map", "css_match", "css_n", "css_noblind", "css_nobots",
        "css_noflash", "css_notready", "css_pause", "css_pick", "css_pip",
        "css_playout", "css_prac", "css_r", "css_rcon", "css_ready",
        "css_readyrequired", "css_reload_admins", "css_restart", "css_restore", "css_rethrow",
        "css_rethrowdecoy", "css_rethrowflash", "css_rethrowgrenade", "css_rethrowmolotov", "css_rethrownade",
        "css_rethrowsmoke", "css_rk", "css_rmap", "css_roundknife", "css_rr",
        "css_rt", "css_save_nades_as_global", "css_savenade", "css_savepos", "css_settings",
        "css_showspawns", "css_skipveto", "css_sleep", "css_sn", "css_solid",
        "css_spawn", "css_spec", "css_start", "css_stay", "css_stop",
        "css_sv", "css_swap", "css_switch", "css_t", "css_tac",
        "css_tactics", "css_team1", "css_team2", "css_tech", "css_throw",
        "css_throwdecoy", "css_throwflash", "css_throwgrenade", "css_throwidx", "css_throwindex",
        "css_throwmolotov", "css_thrownade", "css_throwsmoke", "css_timer", "css_timer2",
        "css_traj", "css_ts", "css_tspawn", "css_uncoach", "css_unpause",
        "css_unready", "css_ur", "css_watchme", "css_whitelist", "css_wl",
        "css_worstctspawn", "css_worstspawn", "css_worsttspawn", "css_y", "get5_addplayer",
        "get5_allow_force_ready", "get5_demo_upload_header_key", "get5_demo_upload_header_value", "get5_demo_upload_url", "get5_endmatch",
        "get5_listbackups", "get5_loadbackup", "get5_loadbackup_url", "get5_loadmatch_url", "get5_remote_backup_header_key",
        "get5_remote_backup_header_value", "get5_remote_backup_url", "get5_remote_log_header_key", "get5_remote_log_header_value", "get5_remote_log_url",
        "get5_removeplayer", "get5_status", "get5_web_available", "matchzy_addplayer", "matchzy_admin_chat_prefix",
        "matchzy_allow_force_ready", "matchzy_autostart_mode", "matchzy_chat_messages_timer_delay", "matchzy_chat_prefix", "matchzy_demo_name_format",
        "matchzy_demo_path", "matchzy_demo_recording_enabled", "matchzy_demo_upload_header_key", "matchzy_demo_upload_header_value", "matchzy_demo_upload_url",
        "matchzy_kick_when_no_match_loaded", "matchzy_knife_enabled_default", "matchzy_listbackups", "matchzy_loadbackup", "matchzy_loadbackup_url",
        "matchzy_loadmatch", "matchzy_loadmatch_url", "matchzy_max_saved_last_grenades", "matchzy_minimum_ready_required", "matchzy_pause_after_restore",
        "matchzy_playout_enabled_default", "matchzy_remote_backup_header_key", "matchzy_remote_backup_header_value", "matchzy_remote_backup_url", "matchzy_remote_log_header_key",
        "matchzy_remote_log_header_value", "matchzy_remote_log_url", "matchzy_removeplayer", "matchzy_reset_cvars_on_series_end", "matchzy_save_nades_as_global_enabled",
        "matchzy_stop_command_available", "matchzy_use_pause_command_for_tactical_pause", "matchzy_whitelist_enabled_default", "reload_admins", "sm_pause",
        "sm_unpause",
    ];
    private static bool IsPanel(string command) => command is "css_nades" or "css_training" or "css_tk" ||
        command.StartsWith("css_nades_") || command.StartsWith("css_training_");

    public static bool Blocks(string mode, bool practice, string raw)
    {
        var command = Normalize(raw);
        if (IsPanel(command) || command is "css_y" or "css_n") return !practice || mode is not ("nades" or "matchzy");
        if (mode == "nades" && (TrainingCommands.Contains(command) || command == "noclip")) return false;
        if (mode != "matchzy") return MatchZyCommands.Contains(command) || TrainingCommands.Contains(command) ||
            command == "noclip" || command.StartsWith("matchzy_") || command.StartsWith("get5_");
        if (command is "css_prac" or "css_tactics" or "css_match" or "css_exitprac" or "css_help") return false;
        if (PracticeCommands.Contains(command) || command == "noclip") return !practice;
        return practice && CompetitiveCommands.Contains(command);
    }

    private static readonly HashSet<string> CompetitiveCommands = [
        "css_ready", "css_r", "css_unready", "css_ur", "css_notready", "css_forceready", "css_start", "css_force", "css_forcestart",
        "css_pause", "css_unpause", "css_tech", "css_tac", "css_forcepause", "css_fp", "css_forceunpause", "css_fup",
        "sm_pause", "sm_unpause", "css_stay", "css_switch", "css_swap", "css_stop", "css_restore", "css_skipveto", "css_sv",
        "css_roundknife", "css_rk", "css_playout", "css_readyrequired", "css_restart", "css_rr", "css_endmatch", "css_forceend", "get5_endmatch"
    ];

    public static readonly IReadOnlyDictionary<string, string> PracticeSettings = new Dictionary<string, string>
    {
        ["sv_cheats"] = "1", ["sv_infinite_ammo"] = "1", ["sv_grenade_trajectory_prac_pipreview"] = "1",
        ["sv_grenade_trajectory_prac_trailtime"] = "3", ["sv_showimpacts"] = "0",
        ["mp_limitteams"] = "0", ["mp_autoteambalance"] = "0", ["mp_freezetime"] = "0",
        // Join training promptly instead of waiting 15 seconds for team selection.
        ["mp_force_pick_time"] = "1",
        // Teammates can pass through each other while still supporting boosts.
        ["mp_solid_teammates"] = "2", ["mp_solid_enemies"] = "0",
        ["mp_roundtime"] = "60", ["mp_roundtime_defuse"] = "60", ["mp_roundtime_hostage"] = "60",
        ["mp_warmup_online_enabled"] = "0", ["mp_warmup_offline_enabled"] = "0", ["mp_do_warmup_period"] = "0",
        ["mp_warmup_pausetimer"] = "0", ["mp_timelimit"] = "0", ["mp_maxrounds"] = "0",
        ["mp_ignore_round_win_conditions"] = "1", ["mp_respawn_on_death_ct"] = "1", ["mp_respawn_on_death_t"] = "1",
        ["mp_buy_anywhere"] = "1", ["mp_buytime"] = "9999", ["mp_maxmoney"] = "60000", ["mp_startmoney"] = "60000",
        ["ammo_grenade_limit_total"] = "5", ["mp_free_armor"] = "2", ["mp_forcecamera"] = "0", ["bot_quota"] = "0",
        ["buddha"] = "1", ["buddha_ignore_bots"] = "1", ["buddha_reset_hp"] = "100",
        ["bot_quota_mode"] = "normal", ["bot_join_after_player"] = "0", ["bot_stop"] = "1", ["bot_freeze"] = "1", ["bot_zombie"] = "1",
        ["mp_ct_default_primary"] = "weapon_ssg08", ["mp_t_default_primary"] = "weapon_ssg08",
        ["mp_ct_default_secondary"] = "weapon_hkp2000", ["mp_t_default_secondary"] = "weapon_glock",
        ["mp_ct_default_grenades"] = "\"weapon_incgrenade weapon_hegrenade weapon_smokegrenade weapon_flashbang weapon_decoy\"",
        ["mp_t_default_grenades"] = "\"weapon_molotov weapon_hegrenade weapon_smokegrenade weapon_flashbang weapon_decoy\"",
    };
}

using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Cvars;
using CounterStrikeSharp.API.Modules.Menu;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;
using Microsoft.Extensions.Logging;
using System.Globalization;
using System.Text.Json;

namespace MatchZyNades;

[MinimumApiVersion(373)]
public sealed class MatchZyNadesPlugin : BasePlugin
{
    public override string ModuleName => "MatchZy Nades";
    public override string ModuleVersion => "1.1.0";
    public override string ModuleAuthor => "MatchZy Control";
    public override string ModuleDescription => "Map-specific lineup browser and grenade practice menu.";

    private readonly Dictionary<int, MenuSession> _menus = [];
    private readonly Dictionary<int, NadeLineup> _last = [];
    private string _libraryPath = "";
    private ConVar? _cheats;
    private NadeRuntimeStatus? _runtimeStatus;
    private bool _statusWriteFailed;

    private sealed class MenuSession(CCSPlayerController player, InGameMenu menu, bool practice)
    {
        public CCSPlayerController Player { get; } = player;
        public CCSPlayerPawn Pawn { get; } = player.PlayerPawn.Value!;
        public InGameMenu Menu { get; } = menu;
        public bool Practice { get; } = practice;
        public MoveType_t MoveType { get; } = player.PlayerPawn.Value!.MoveType;
        public MoveType_t ActualMoveType { get; } = player.PlayerPawn.Value!.ActualMoveType;
        public float NextAttack { get; } = player.PlayerPawn.Value!.WeaponServices!.As<CCSPlayer_WeaponServices>().NextAttack;
        public MenuInput Input { get; } = new(player.Buttons);
        public float LastInput { get; set; } = Server.CurrentTime;
        public float NextDraw { get; set; }
        public float AttackLock { get; set; }
        public string Html { get; set; } = MenuRenderer.Render(menu, practice);
    }

    public override void Load(bool hotReload)
    {
        _libraryPath = Path.Combine(Server.GameDirectory, "csgo", "cfg", "MatchZy", "savednades.json");
        _cheats = ConVar.Find("sv_cheats");
        AddCommandListener("say", OnSay, HookMode.Pre);
        AddCommandListener("say_team", OnSay, HookMode.Pre);
        RegisterListener<Listeners.OnTick>(OnTick);
        RegisterListener<Listeners.OnMapEnd>(Reset);
        RegisterEventHandler<EventPlayerDisconnect>((e, _) => { Forget(e.Userid); return HookResult.Continue; }, HookMode.Pre);
        RegisterEventHandler<EventPlayerDeath>((e, _) => { if (e.Userid is { } p) Close(p.Slot); return HookResult.Continue; }, HookMode.Pre);
        RegisterEventHandler<EventPlayerSpawn>((e, _) => { if (e.Userid is { } p) Close(p.Slot); return HookResult.Continue; });
        RegisterEventHandler<EventRoundStart>((_, _) => { CloseAll(); return HookResult.Continue; });
        _runtimeStatus = new NadeRuntimeStatus(Path.Combine(ModuleDirectory, "data", "status.json"), ModuleVersion);
        WriteRuntimeStatus(true);
        AddTimer(5f, () => WriteRuntimeStatus(true), TimerFlags.REPEAT);
        Logger.LogInformation("MatchZy Nades {Version} loaded: .nades / !nades / css_nades", ModuleVersion);
    }

    public override void Unload(bool hotReload)
    {
        Reset();
        WriteRuntimeStatus(false);
        Logger.LogInformation("MatchZy Nades unloaded");
    }

    private void WriteRuntimeStatus(bool loaded)
    {
        try
        {
            _runtimeStatus?.Write(loaded, TrainingEnabled, Server.MapName);
            _statusWriteFailed = false;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            if (!_statusWriteFailed) Logger.LogWarning(error, "Could not write MatchZy Nades runtime status");
            _statusWriteFailed = true;
        }
    }

    private HookResult OnSay(CCSPlayerController? player, CommandInfo command)
    {
        var words = command.ArgString.Trim().Trim('"').Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        if (words.Length == 0 || !words[0].Equals(".nades", StringComparison.OrdinalIgnoreCase)) return HookResult.Continue;
        Handle(player, words.Length > 1 ? words[1] : "");
        return HookResult.Stop;
    }

    [ConsoleCommand("css_nades", "Open grenade lineups for this map; last repeats the selected lineup")]
    public void OnNades(CCSPlayerController? player, CommandInfo command) =>
        Handle(player, command.ArgCount > 1 ? command.GetArg(1) : "");

    [ConsoleCommand("css_training", "Toggle the in-game training menu (bind to a key)")]
    public void OnTraining(CCSPlayerController? player, CommandInfo command)
    {
        if (player is { IsValid: true } && _menus.ContainsKey(player.Slot)) Close(player.Slot);
        else Handle(player, "");
    }

    [ConsoleCommand("css_nades_select", "Select menu option 1-9 (optional number key bind)")]
    public void OnSelect(CCSPlayerController? player, CommandInfo command)
    {
        if (player is not { IsValid: true } || !_menus.ContainsKey(player.Slot)) return;
        Handle(player, command.ArgCount > 1 ? command.GetArg(1) : "");
    }

    [ConsoleCommand("css_nades_last", "Return to your last selected lineup")]
    public void OnLast(CCSPlayerController? player, CommandInfo command) => Handle(player, "last");

    private static void Tell(CCSPlayerController player, string message) => player.PrintToChat($" [Nades] {message}");
    private static bool Alive(CCSPlayerController? player) => player is { IsValid: true, IsBot: false, PawnIsAlive: true }
        && player.TeamNum is 2 or 3 && player.PlayerPawn.Value is { IsValid: true, MovementServices: not null, WeaponServices: not null };
    private bool TrainingEnabled => _cheats?.GetPrimitiveValue<bool>() == true;

    private void Handle(CCSPlayerController? player, string action)
    {
        if (player is not { IsValid: true, IsBot: false }) return;
        if (action.Equals("close", StringComparison.OrdinalIgnoreCase) || action == "9") { Close(player.Slot); return; }
        if (!Alive(player)) { Close(player.Slot); Tell(player, "Bitte zuerst einem Team beitreten und spawnen."); return; }
        if (action.Length == 0) { Open(player); return; }
        if (int.TryParse(action, out var key)) { Select(player, key); return; }
        if (!TrainingEnabled) { Tell(player, "Training zuerst ueber die Trainingszentrale starten."); return; }
        if (action.Equals("check", StringComparison.OrdinalIgnoreCase))
        {
            Close(player.Slot);
            CheckPlacement(player);
            return;
        }
        if (action.Equals("last", StringComparison.OrdinalIgnoreCase))
        {
            if (_last.TryGetValue(player.Slot, out var last)) LoadLineup(player, last);
            else Tell(player, "Zuerst mit .nades ein Lineup auswaehlen.");
            return;
        }
        Tell(player, ".nades | .nades 1-9 | .nades last | .nades check | .nades close");
    }

    private IReadOnlyList<NadeLineup>? ReadLibrary(CCSPlayerController player, bool quiet = false)
    {
        try
        {
            return NadeCatalog.Parse(File.ReadAllText(_libraryPath), Server.MapName, player.SteamID.ToString(CultureInfo.InvariantCulture));
        }
        catch (FileNotFoundException) { if (!quiet) Tell(player, "Noch keine Bibliothek. Lineups im Dashboard oder mit .savenade speichern."); }
        catch (DirectoryNotFoundException) { if (!quiet) Tell(player, "Noch keine Bibliothek. Lineups im Dashboard oder mit .savenade speichern."); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException)
        {
            Logger.LogWarning(error, "Could not read saved grenade library");
            if (!quiet) Tell(player, "Bibliothek gerade nicht lesbar. Bitte Menue erneut oeffnen.");
        }
        return null;
    }

    private void Open(CCSPlayerController player)
    {
        Close(player.Slot);
        var library = ReadLibrary(player, quiet: true);
        // Do not let two menus consume the same inputs / compete for the center HUD.
        MenuManager.CloseActiveMenu(player);
        var session = new MenuSession(player, TrainingMenu.Create(library ?? [], Server.MapName, TrainingEnabled,
            _last.GetValueOrDefault(player.Slot), library == null ? "Bibliothek nicht verfuegbar; im Dashboard pruefen." : ""), TrainingEnabled);
        _menus[player.Slot] = session;
        session.Pawn.MoveType = MoveType_t.MOVETYPE_NONE;
        session.Pawn.ActualMoveType = MoveType_t.MOVETYPE_NONE;
        Utilities.SetStateChanged(session.Pawn, "CBaseEntity", "m_MoveType");
        LockAttacks(session);
        player.PrintToCenterHtml(session.Html, 1);
    }

    private void Select(CCSPlayerController player, int key)
    {
        if (!_menus.TryGetValue(player.Slot, out var session)) return;
        session.LastInput = Server.CurrentTime;
        switch (key)
        {
            case 6:
                if (!session.Menu.Back()) { Close(player.Slot); return; }
                break;
            case 7: session.Menu.ChangePage(-1); break;
            case 8: session.Menu.ChangePage(1); break;
            case 9: Close(player.Slot); return;
            default:
                var request = session.Menu.Select(key);
                if (request?.Action == TrainingAction.Back) session.Menu.Back();
                else if (request != null) { ExecuteAction(player, request); return; }
                break;
        }
        session.Html = MenuRenderer.Render(session.Menu, session.Practice);
        session.NextDraw = 0;
    }

    private void ExecuteAction(CCSPlayerController player, MenuRequest request)
    {
        Close(player.Slot);
        if (request.Action == TrainingAction.Close || !Alive(player)) return;
        if (request.Action != TrainingAction.StartPractice && !TrainingEnabled)
        { Tell(player, "Training ist inzwischen beendet. Menue erneut oeffnen."); return; }
        switch (request.Action)
        {
            case TrainingAction.LoadLineup when request.Lineup is { } lineup: LoadLineup(player, lineup); return;
            case TrainingAction.RepeatLineup:
                if (_last.TryGetValue(player.Slot, out var last)) LoadLineup(player, last);
                return;
            case TrainingAction.CheckPosition: CheckPlacement(player); return;
        }
        if (TrainingMenu.Command(request.Action) is { } command)
            player.ExecuteClientCommandFromServer(command);
    }

    private void LoadLineup(CCSPlayerController player, NadeLineup selected)
    {
        Close(player.Slot);
        if (!TrainingEnabled || !Alive(player)) return;
        // Re-read at selection time: a panel sync may have edited, removed or unshared this entry.
        var library = ReadLibrary(player);
        if (library == null) return;
        var lineup = library.FirstOrDefault(n => n.Owner == selected.Owner && n.Name == selected.Name && n.Map == selected.Map);
        if (lineup == null) { Tell(player, "Lineup nicht mehr vorhanden oder auf einer anderen Map. .nades erneut oeffnen."); return; }
        var pawn = player.PlayerPawn.Value!;
        if (NadeCatalog.Equipment(lineup.Kind, player.TeamNum == 3) is { } equipment)
        {
            var hasGrenade = pawn.WeaponServices!.MyWeapons.Any(w => w.Value is { IsValid: true } weapon && weapon.DesignerName == equipment.Weapon);
            if (!hasGrenade && player.GiveNamedItem(equipment.Weapon) == IntPtr.Zero)
            {
                Tell(player, "Granate konnte nicht gegeben werden. Bitte Inventar freimachen und erneut versuchen.");
                return;
            }
            // Same client slot commands used by MatchZy's own .loadnade; no user strings executed.
            player.ExecuteClientCommand(equipment.Slot);
        }
        // Loading is a training action: leave noclip / ladder mode so normal gravity can
        // settle MatchZy's saved Z+4 positions. Closing a menu alone still restores its old mode.
        pawn.MoveType = MoveType_t.MOVETYPE_WALK;
        pawn.ActualMoveType = MoveType_t.MOVETYPE_WALK;
        Utilities.SetStateChanged(pawn, "CBaseEntity", "m_MoveType");
        pawn.Teleport(new Vector(lineup.Position.X, lineup.Position.Y, lineup.Position.Z),
            new QAngle(lineup.Angles.X, lineup.Angles.Y, lineup.Angles.Z), new Vector(0, 0, 0));
        PlayerBodyRotation.Repair(pawn);
        _last[player.Slot] = lineup;
        Tell(player, $"Geladen: {MenuRenderer.Plain(lineup.Name, 90)}. Bereit zum Trainieren.");
        if (!string.IsNullOrWhiteSpace(lineup.Description)) Tell(player, MenuRenderer.Plain(lineup.Description, 180));
        if (lineup.Kind == NadeKind.Other) Tell(player, "Dieses Lineup hat keinen Granatentyp. Passende Granate selbst waehlen.");
    }

    private void CheckPlacement(CCSPlayerController player)
    {
        var pawn = player.PlayerPawn.Value!;
        var position = pawn.AbsOrigin;
        if (position == null) return;
        var scene = pawn.CBodyComponent?.SceneNode;
        if (scene == null) return;
        var eye = pawn.EyeAngles;
        var body = scene.AbsRotation;
        var message = FormattableString.Invariant($"Position {position.X:0.###} {position.Y:0.###} {position.Z:0.###}; Bewegung {pawn.MoveType}/{pawn.ActualMoveType}.");
        var angles = FormattableString.Invariant($"Blick (Pitch/Yaw/Roll): {eye.X:0.###}/{eye.Y:0.###}/{eye.Z:0.###}; Koerper: {body.X:0.###}/{body.Y:0.###}/{body.Z:0.###}.");
        Tell(player, message);
        Tell(player, angles);
        Logger.LogInformation("Nades position check: {Details} {Angles}", message, angles);
    }

    private static void LockAttacks(MenuSession session)
    {
        var services = session.Pawn.WeaponServices!.As<CCSPlayer_WeaponServices>();
        session.AttackLock = Math.Max(services.NextAttack, Server.CurrentTime + 1f);
        services.NextAttack = session.AttackLock;
    }

    private void OnTick()
    {
        // MatchZy's own .loadnade/.last/.loadpos bypass our loader. Repair the same
        // scene-node tilt for living practice players (including practice bots).
        // No changes in live matches or to parented/spectator/dead pawns.
        if (TrainingEnabled)
        {
            foreach (var player in Utilities.GetPlayers())
                if (player is { IsValid: true, PawnIsAlive: true } && player.TeamNum is 2 or 3 &&
                    player.PlayerPawn.Value is { IsValid: true } pawn)
                    PlayerBodyRotation.Repair(pawn);
        }
        foreach (var (slot, session) in _menus.ToArray())
        {
            var player = session.Player;
            if (!Alive(player) || player.PlayerPawn.Value!.Handle != session.Pawn.Handle || TrainingEnabled != session.Practice ||
                session.Menu.Map != Server.MapName || Server.CurrentTime - session.LastInput > 90f ||
                MenuManager.GetActiveMenu(player) != null)
            { Close(slot); continue; }
            LockAttacks(session);
            var input = session.Input.Read(player.Buttons);
            if (input != MenuInputAction.None) session.LastInput = Server.CurrentTime;
            switch (input)
            {
                case MenuInputAction.Back: Select(player, 6); break;
                case MenuInputAction.Select: Select(player, session.Menu.Cursor + 1); break;
                case MenuInputAction.PreviousPage: Select(player, 7); break;
                case MenuInputAction.NextPage: Select(player, 8); break;
                case MenuInputAction.Up: session.Menu.Move(-1); break;
                case MenuInputAction.Down: session.Menu.Move(1); break;
            }
            if (input != MenuInputAction.None)
            {
                session.Html = MenuRenderer.Render(session.Menu, session.Practice);
                session.NextDraw = 0;
            }
            if (_menus.ContainsKey(slot) && Server.CurrentTime >= session.NextDraw)
            {
                player.PrintToCenterHtml(session.Html, 1);
                session.NextDraw = Server.CurrentTime + 0.1f;
            }
        }
    }

    private void Close(int slot)
    {
        if (!_menus.Remove(slot, out var session)) return;
        if (session.Pawn.IsValid)
        {
            // Restore only state still owned by this menu, and only on the original pawn.
            if (session.Pawn.MoveType == MoveType_t.MOVETYPE_NONE)
            {
                session.Pawn.MoveType = session.MoveType;
                session.Pawn.ActualMoveType = session.ActualMoveType;
                Utilities.SetStateChanged(session.Pawn, "CBaseEntity", "m_MoveType");
            }
            if (session.Pawn.WeaponServices is { } services)
            {
                var weapons = services.As<CCSPlayer_WeaponServices>();
                if (weapons.NextAttack == session.AttackLock)
                    weapons.NextAttack = Math.Max(session.NextAttack, Server.CurrentTime + 0.15f);
            }
        }
        if (session.Player.IsValid) session.Player.PrintToCenterHtml(" ", 1);
    }

    private void Forget(CCSPlayerController? player)
    {
        if (player is not { IsValid: true }) return;
        Close(player.Slot);
        _last.Remove(player.Slot);
    }

    private void CloseAll() { foreach (var slot in _menus.Keys.ToArray()) Close(slot); }
    private void Reset() { CloseAll(); _last.Clear(); }
}

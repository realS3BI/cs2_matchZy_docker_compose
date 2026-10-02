using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Commands;
using Microsoft.Extensions.Logging;

namespace MatchZyNades;

public sealed partial class MatchZyNadesPlugin
{
    private readonly NadeCaptureTracker _capture = new();
    private readonly GrenadeFlightTracker _flightTimes = new();
    private sealed record DraftNameRequest(string Owner, NadeKind Kind, string Map,
        Coordinates Start, Coordinates Angles, Coordinates Target, string Technique, string Trace,
        ThrowAttributes Attributes, string Team, float? FlightDuration);
    private readonly Dictionary<int, float> _saveRequests = [];
    private readonly Dictionary<int, List<ThrowSample>> _saveSamples = [];
    private readonly Dictionary<int, DraftNameRequest> _draftNameRequests = [];

    private void RegisterCapture()
    {
        foreach (var command in new[] { "css_savenade", "css_sn", "css_loadnade", "css_ln" })
            AddCommandListener(command, (player, info) =>
            {
                if (info.ArgCount > 1) ArmAfterCommand(player, info.GetArg(1));
                return HookResult.Continue;
            }, HookMode.Post);
        RegisterListener<Listeners.OnEntitySpawned>(CaptureProjectile);
        RegisterEventHandler<EventGrenadeThrown>((e, _) =>
        {
            var player = e.Userid;
            if (player == null || !TrainingEnabled) return HookResult.Continue;
            var kind = ThrownKind(e.Weapon);
            _flightTimes.Thrown(player.Slot, player.SteamID, kind, Server.CurrentTime);
            if (_saveRequests.TryGetValue(player.Slot, out var saveExpires))
            {
                if (saveExpires < Server.CurrentTime) _saveRequests.Remove(player.Slot);
                else if (kind == NadeKind.Other)
                {
                    Tell(player, $"Granatentyp nicht erkannt: {MenuRenderer.Plain(e.Weapon, 60)}. Die Aufnahme bleibt bereit.");
                    Logger.LogWarning("Unbekannte Waffenkennung bei grenade_thrown während der Aufnahme: {Weapon}", e.Weapon);
                    return HookResult.Continue;
                }
                else if (player.PlayerPawn.Value is { IsValid: true } pawn && pawn.AbsOrigin is { } origin)
                {
                    _saveRequests.Remove(player.Slot);
                    var start = new Coordinates(origin.X, origin.Y, origin.Z + 4);
                    var angles = new Coordinates(pawn.EyeAngles.X, pawn.EyeAngles.Y, pawn.EyeAngles.Z);
                    var samples = _saveSamples.GetValueOrDefault(player.Slot) ?? [];
                    AddSample(samples, player, pawn);
                    var trace = ThrowTechnique.Serialize(samples);
                    var owner = player.SteamID.ToString(System.Globalization.CultureInfo.InvariantCulture);
                    _capture.Forget(player.Slot);
                    var draft = new NadeLineup(owner, $"capture_{Guid.NewGuid():N}", Server.MapName,
                        kind, "", start, angles, "", trace, Team: player.TeamNum switch { 3 => "ct", 2 => "t", _ => "" },
                        Attributes: ThrowAttributes.Detect(samples));
                    _capture.Arm(player.Slot, player.SteamID, draft, Server.CurrentTime);
                    _capture.Thrown(player.Slot, player.SteamID, kind, Server.CurrentTime);
                    _saveSamples.Remove(player.Slot);
                    Tell(player, $"Wurf erkannt: {NadeCatalog.Label(kind)}. Warte auf die Explosion.");
                    return HookResult.Continue;
                }
            }
            var expected = _capture.ArmedKind(player.Slot, player.SteamID, Server.CurrentTime);
            var matched = _capture.Thrown(player.Slot, player.SteamID, kind, Server.CurrentTime);
            if (expected.HasValue && !matched)
                Tell(player, $"Erfassung erwartet {NadeCatalog.Label(expected.Value)}, geworfen wurde {NadeCatalog.Label(kind)}. Lineup erneut laden und passende Granate werfen.");
            else if (matched) Tell(player, "Wurf erkannt. Das Ziel wird bei der Explosion gespeichert.");
            return HookResult.Continue;
        });
        RegisterEventHandler<EventSmokegrenadeDetonate>((e, _) => CompleteCapture(e.Entityid, e.Userid, NadeKind.Smoke, new(e.X, e.Y, e.Z)));
        RegisterEventHandler<EventFlashbangDetonate>((e, _) => CompleteCapture(e.Entityid, e.Userid, NadeKind.Flash, new(e.X, e.Y, e.Z)));
        RegisterEventHandler<EventHegrenadeDetonate>((e, _) => CompleteCapture(e.Entityid, e.Userid, NadeKind.HE, new(e.X, e.Y, e.Z)));
        RegisterEventHandler<EventMolotovDetonate>((e, _) => CompleteFireCapture(e.Userid, new(e.X, e.Y, e.Z)));
        RegisterEventHandler<EventDecoyStarted>((e, _) => CompleteCapture(e.Entityid, e.Userid, NadeKind.Decoy, new(e.X, e.Y, e.Z)));
        RegisterNadeFeedback();
        RegisterEventHandler<EventRoundStart>((_, _) => { ResetCapture(); return HookResult.Continue; });
        RegisterEventHandler<EventPlayerDeath>((e, _) => { if (e.Userid is { } p) ClearCapture(p.Slot); return HookResult.Continue; });
    }

    private static NadeKind ProjectileKind(string name) => name switch
    {
        "smokegrenade_projectile" => NadeKind.Smoke,
        "flashbang_projectile" => NadeKind.Flash,
        "hegrenade_projectile" => NadeKind.HE,
        "molotov_projectile" or "incendiary_projectile" => NadeKind.Fire,
        "decoy_projectile" => NadeKind.Decoy,
        _ => NadeKind.Other
    };

    private static NadeKind ThrownKind(string weapon)
    {
        var name = weapon.Trim().ToLowerInvariant();
        if (name.StartsWith("weapon_", StringComparison.Ordinal)) name = name[7..];
        // The incendiary weapon is incgrenade, but uses a molotov projectile.
        return name switch
        {
            "molotov" or "incgrenade" or "incendiary" => NadeKind.Fire,
            _ => ProjectileKind(name + "_projectile")
        };
    }

    private static void AddSample(List<ThrowSample> samples, CCSPlayerController player, CCSPlayerPawn pawn)
    {
        if (pawn.AbsOrigin is not { } origin) return;
        var velocity = pawn.AbsVelocity;
        samples.Add(new(Server.CurrentTime, NadeCaptureFile.Vector(new(origin.X, origin.Y, origin.Z)),
            NadeCaptureFile.Vector(new(velocity.X, velocity.Y, velocity.Z)),
            FormattableString.Invariant($"{pawn.EyeAngles.X:0.##} {pawn.EyeAngles.Y:0.##} {pawn.EyeAngles.Z:0.##}"), player.Buttons.ToString()));
    }

    private void ArmNewLineupCapture(CCSPlayerController player)
    {
        if (!CanWriteNades(player)) return;
        ReleaseControl(player.Slot);
        if (_draftNameRequests.ContainsKey(player.Slot))
        { Tell(player, "Es gibt eine ungespeicherte Aufnahme. Zuerst Aufnahme speichern oder verwerfen wählen."); return; }
        _capture.Forget(player.Slot);
        _draftNameRequests.Remove(player.Slot);
        _saveSamples[player.Slot] = [];
        if (player.PlayerPawn.Value is { IsValid: true } pawn) AddSample(_saveSamples[player.Slot], player, pawn);
        _saveRequests[player.Slot] = Server.CurrentTime + 180;
        Tell(player, "Aufnahme bereit. Wirf genau eine Granate; Position, Blickwinkel und Tastenfolge werden erfasst.");
    }

    private void RecordSaveInputs()
    {
        foreach (var (slot, expires) in _saveRequests.ToArray())
        {
            var player = Utilities.GetPlayers().FirstOrDefault(p => p is { IsValid: true } && p.Slot == slot);
            if (expires < Server.CurrentTime || player is not { IsValid: true, PawnIsAlive: true } || player.PlayerPawn.Value is not { IsValid: true } pawn)
            {
                _saveRequests.Remove(slot);
                _saveSamples.Remove(slot);
                if (player is { IsValid: true }) Tell(player, "Aufnahme abgelaufen. Im Panel erneut starten.");
                continue;
            }
            if (!_saveSamples.TryGetValue(slot, out var samples)) _saveSamples[slot] = samples = [];
            if (samples.Count == 0 || Server.CurrentTime - samples[^1].Time >= 0.02f) AddSample(samples, player, pawn);
            samples.RemoveAll(sample => Server.CurrentTime - sample.Time > 8f);
            if (samples.Count > 512) samples.RemoveRange(0, samples.Count - 512);
        }
    }

    private bool TrySaveNameFromChat(CCSPlayerController? player, string rawText)
    {
        if (!CanWriteNades(player)) return false;
        if (!TrainingEnabled || player is not { IsValid: true } || !_draftNameRequests.TryGetValue(player.Slot, out var request)) return false;
        var displayName = rawText.Trim().Trim('"').Trim();
        if (displayName.Equals("cancel", StringComparison.OrdinalIgnoreCase) || displayName.Equals("abbrechen", StringComparison.OrdinalIgnoreCase) ||
            displayName.Equals(".cancel", StringComparison.OrdinalIgnoreCase))
        {
            _draftNameRequests.Remove(player.Slot);
            Tell(player, "Nade-Aufnahme verworfen.");
            return true;
        }
        if (displayName.StartsWith('.') || displayName.StartsWith('!')) return false;
        displayName = new string(displayName.Where(c => !char.IsControl(c)).Take(120).ToArray()).Trim();
        var name = System.Text.RegularExpressions.Regex.Replace(displayName.ToLowerInvariant(), "[^a-z0-9_-]+", "-").Trim('-', '_');
        if (displayName.Length == 0 || name.Length == 0)
        {
            Tell(player, "Bitte einen Namen mit mindestens einem Buchstaben oder einer Zahl eingeben (oder 'abbrechen').");
            return true;
        }
        name = name[..Math.Min(name.Length, 64)];
        var used = new HashSet<string>((ReadLibrary(player, quiet: true) ?? []).Where(n => n.Owner == request.Owner && n.Map == request.Map)
            .Select(n => n.Name), StringComparer.OrdinalIgnoreCase);
        var baseName = name;
        for (var suffix = 2; used.Contains(name); suffix++) name = $"{baseName[..Math.Min(baseName.Length, 58)]}-{suffix}";
        try
        {
            NadeCaptureFile.Write(Path.Combine(Path.GetDirectoryName(_libraryPath)!, "savednades.captures.json"),
                NadeCaptureFile.CreateNew(request.Owner, name, displayName, request.Map, request.Kind,
                    request.Start, request.Angles, request.Target, request.Technique, request.Trace, request.Attributes, request.Team, request.FlightDuration));
            _draftNameRequests.Remove(player.Slot);
            Tell(player, $"{MenuRenderer.Plain(displayName, 100)} gespeichert. Dashboard und Ingame-Bibliothek übernehmen das Lineup automatisch.");
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Text.Json.JsonException)
        {
            Logger.LogWarning(error, "Could not persist newly captured nade");
            Tell(player, "Lineup konnte nicht gespeichert werden. Aufnahme bleibt erhalten; Speichern erneut versuchen.");
        }
        return true;
    }

    private void SavePanelCapture(CCSPlayerController player)
    {
        if (!_draftNameRequests.TryGetValue(player.Slot, out var request))
        {
            Tell(player, "Noch keine fertige Aufnahme. Aufnahme starten, werfen und Explosion abwarten.");
            return;
        }
        if (request.Map != Server.MapName)
        { ClearCapture(player.Slot); Tell(player, "Die Aufnahme gehört zu einer anderen Map. Bitte erneut aufnehmen."); return; }
        // A unique suffix also prevents collisions with captures awaiting dashboard sync.
        var name = $"{NadeCatalog.Label(request.Kind)} {request.Map} {DateTime.UtcNow:yyyyMMdd-HHmmss} {Guid.NewGuid().ToString("N")[..6]}";
        TrySaveNameFromChat(player, name);
    }

    private void ArmCapture(CCSPlayerController player, NadeLineup lineup)
    {
        if (!CanWriteNades(player) || !TrainingEnabled || lineup.Owner != player.SteamID.ToString(System.Globalization.CultureInfo.InvariantCulture) || lineup.Official || lineup.Kind == NadeKind.Other) { _capture.Forget(player.Slot); return; }
        _capture.Arm(player.Slot, player.SteamID, lineup, Server.CurrentTime);
        Tell(player, "Der nächste Wurf erfasst das Ziel automatisch (gleicher Typ, innerhalb 2 Minuten). Danach Dashboard aktualisieren.");
    }

    private void ArmAfterCommand(CCSPlayerController? player, string name)
    {
        if (!CanWriteNades(player) || !Alive(player) || !TrainingEnabled) return;
        var steamId = player!.SteamID;
        var map = Server.MapName;
        Server.NextFrame(() =>
        {
            if (!Alive(player) || player.SteamID != steamId || !TrainingEnabled || Server.MapName != map) return;
            var candidates = ReadLibrary(player, quiet: true)?.Where(n => n.Name == name).ToArray() ?? [];
            // Resolve private/global name collisions by the actual position after MatchZy's command.
            var pawn = player.PlayerPawn.Value!;
            var pos = pawn.AbsOrigin;
            if (pos == null) return;
            candidates = candidates.Where(n => Math.Abs(n.Position.X - pos.X) < 2 && Math.Abs(n.Position.Y - pos.Y) < 2 &&
                Math.Abs(n.Position.Z - pos.Z) <= 8 && Math.Abs(n.Angles.X - pawn.EyeAngles.X) < 1 &&
                Math.Abs(n.Angles.Y - pawn.EyeAngles.Y) < 1).ToArray();
            if (candidates.Length == 1) ArmCapture(player, candidates[0]);
            else if (candidates.Length > 1) Tell(player, "Name mehrfach vorhanden. Bitte das genaue Lineup im .nades-Menü laden.");
        });
    }

    private void CaptureProjectile(CEntityInstance entity)
    {
        var kind = ProjectileKind(entity.DesignerName);
        if (!TrainingEnabled || kind == NadeKind.Other) return;
        // The thrower is assigned after spawn; grenade_thrown identifies a real player throw.
        Server.NextFrame(() =>
        {
            if (!TrainingEnabled || !entity.IsValid) return;
            var projectile = new CBaseCSGrenadeProjectile(entity.Handle);
            if (projectile.Globalname == GrenadeRethrowHistory.Marker) return;
            var player = projectile.Thrower.Value?.Controller.Value?.As<CCSPlayerController>();
            if (player is { IsValid: true, IsBot: false }) {
                if (StandaloneTraining) RememberGrenade(player, projectile);
                _capture.Projectile((int)entity.Index, player.Slot, player.SteamID, kind, Server.CurrentTime);
                _flightTimes.Projectile((int)entity.Index, player.Slot, player.SteamID, kind, Server.CurrentTime);
            }
        });
    }

    private HookResult CompleteCapture(int entityId, CCSPlayerController? player, NadeKind kind, Coordinates target)
    {
        if (!TrainingEnabled || player is not { IsValid: true } ||
            !float.IsFinite(target.X) || !float.IsFinite(target.Y) || !float.IsFinite(target.Z)) return HookResult.Continue;
        var flightDuration = CompleteFlightTime(entityId, player, kind);
        var lineup = _capture.Complete(entityId, player.Slot, player.SteamID, kind, Server.MapName, Server.CurrentTime)
            ?? _capture.CompleteByThrower(player.Slot, player.SteamID, kind, Server.MapName, Server.CurrentTime);
        if (lineup == null) return HookResult.Continue;
        return CompleteNamedCapture(player, lineup, target, flightDuration);
    }

    private HookResult CompleteNamedCapture(CCSPlayerController player, NadeLineup lineup, Coordinates target, float? flightDuration)
    {
        if (!CanWriteNades(player)) return HookResult.Continue;
        if (!float.IsFinite(target.X) || !float.IsFinite(target.Y) || !float.IsFinite(target.Z)) return HookResult.Continue;
        if (lineup.Name.StartsWith("capture_", StringComparison.Ordinal))
        {
            var samples = System.Text.Json.JsonSerializer.Deserialize<ThrowSample[]>(lineup.ThrowTrace) ?? [];
            var technique = ThrowTechnique.Summarize(samples);
            _draftNameRequests[player.Slot] = new(lineup.Owner, lineup.Kind, lineup.Map,
                lineup.Position, lineup.Angles, target, technique, lineup.ThrowTrace,
                lineup.Attributes ?? ThrowAttributes.Detect(samples), lineup.Team, flightDuration);
            var duration = flightDuration is { } seconds ? FormattableString.Invariant($" Flugzeit: {seconds:0.00} s.") : " Flugzeit konnte nicht eindeutig gemessen werden.";
            Tell(player, $"Ziel erfasst: {technique}.{duration} Panelbedienung aktivieren und unter Neue Nade aufnehmen die Aufnahme speichern oder verwerfen. Optional einen eigenen Namen im Chat eingeben.");
            return HookResult.Continue;
        }
        try
        {
            NadeCaptureFile.Write(Path.Combine(Path.GetDirectoryName(_libraryPath)!, "savednades.captures.json"),
                NadeCaptureFile.Create(lineup, target, flightDuration));
            Tell(player, $"Ziel für {MenuRenderer.Plain(lineup.Title, 90)} erfasst. Dashboard aktualisieren.");
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Text.Json.JsonException)
        {
            Logger.LogWarning(error, "Could not persist grenade target");
            Tell(player, "Ziel konnte nicht gespeichert werden. Bitte erneut laden und werfen.");
        }
        return HookResult.Continue;
    }

    private HookResult CompleteFireCapture(CCSPlayerController? player, Coordinates target)
    {
        if (!TrainingEnabled || player is not { IsValid: true }) return HookResult.Continue;
        var flightDuration = CompleteFlightTime(null, player, NadeKind.Fire);
        // Molotov detonation does not expose a projectile entity id in the CS# event.
        var lineup = _capture.CompleteByThrower(player.Slot, player.SteamID, NadeKind.Fire, Server.MapName, Server.CurrentTime);
        return lineup == null ? HookResult.Continue : CompleteNamedCapture(player, lineup, target, flightDuration);
    }

    private void ClearCapture(int slot)
    {
        _capture.Forget(slot);
        _saveRequests.Remove(slot);
        _saveSamples.Remove(slot);
        _draftNameRequests.Remove(slot);
    }
    private void ResetCapture()
    {
        _capture.Clear();
        _flightTimes.Clear();
        _saveRequests.Clear();
        _saveSamples.Clear();
        _draftNameRequests.Clear();
    }
}

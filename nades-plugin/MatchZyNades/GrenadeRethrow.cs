using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Utils;
using CounterStrikeSharp.API.Modules.Timers;
using Microsoft.Extensions.Logging;

namespace MatchZyNades;

public sealed partial class MatchZyNadesPlugin
{
    private readonly GrenadeRethrowHistory _rethrows = new();
    private readonly GrenadeProjectileFactory _projectileFactory = new();
    private readonly FireEffectOrigins _fireEffectOrigins = new();
    // Capture protection outlives the bounded diagnostic observations. Clear on index reuse.
    private readonly Dictionary<int, uint> _syntheticProjectiles = [];
    private long _rethrowSequence;
    private sealed class RethrowObservation(long id, ulong steamId, CBaseCSGrenadeProjectile entity, float started)
    {
        public long Id { get; } = id;
        public ulong SteamId { get; } = steamId;
        public CBaseCSGrenadeProjectile Entity { get; } = entity;
        public uint Handle { get; } = entity.EntityHandle.Raw;
        public string Type { get; } = entity.DesignerName;
        public float Started { get; } = started;
        public bool MissingLogged { get; set; }
        public bool EffectLogged { get; set; }
        public bool DeletedLogged { get; set; }
    }
    private readonly Dictionary<int, RethrowObservation> _rethrowObservations = [];

    private static string RethrowCoordinates(float x, float y, float z) =>
        FormattableString.Invariant($"({x:0.###}, {y:0.###}, {z:0.###})");
    private static string RethrowCoordinates(Coordinates value) => RethrowCoordinates(value.X, value.Y, value.Z);

    private void RememberGrenade(CCSPlayerController player, CBaseCSGrenadeProjectile projectile)
    {
        if (projectile.AbsRotation is not { } angles)
        {
            Logger.LogWarning("[Rethrow] Wurf nicht gespeichert: SteamID={SteamId}, Entity={Entity}, Typ={Type}, Grund=keine Winkel",
                player.SteamID, projectile.Index, projectile.DesignerName);
            return;
        }
        var position = projectile.InitialPosition;
        var velocity = projectile.InitialVelocity;
        // Some CS2 builds leave InitialVelocity empty, while AbsVelocity is already initialized.
        var fallback = velocity.X == 0 && velocity.Y == 0 && velocity.Z == 0;
        if (fallback) velocity = projectile.AbsVelocity;
        var spin = projectile.AngVelocity;
        var grenade = new GrenadeRethrow(projectile.DesignerName,
            new(position.X, position.Y, position.Z), new(angles.X, angles.Y, angles.Z),
            new(velocity.X, velocity.Y, velocity.Z), new(spin.X, spin.Y, spin.Z), projectile.ItemIndex,
            projectile.DesignerName == "molotov_projectile" && new CMolotovProjectile(projectile.Handle).IsIncGrenade);
        var saved = _rethrows.TryRemember(player.SteamID, grenade, out var reason, projectile.Globalname);
        Logger.Log(saved ? LogLevel.Information : LogLevel.Warning,
            "[Rethrow] Wurf speichern: SteamID={SteamId}, Entity={Entity}, Typ={Type}, Gespeichert={Saved}, Grund={Reason}, Position={Position}, Winkel={Angles}, Geschwindigkeit={Velocity}, Drehung={Spin}, ItemIndex={ItemIndex}, Incendiary={Incendiary}, AbsVelocityFallback={Fallback}",
            player.SteamID, projectile.Index, grenade.DesignerName, saved, reason,
            RethrowCoordinates(grenade.Position), RethrowCoordinates(grenade.Angles), RethrowCoordinates(grenade.Velocity),
            RethrowCoordinates(grenade.AngularVelocity), grenade.ItemIndex, grenade.Incendiary, fallback);
    }

    private void RethrowGrenade(CCSPlayerController player)
    {
        var id = ++_rethrowSequence;
        Logger.LogInformation("[Rethrow] Versuch={Attempt}: angefordert, SteamID={SteamId}, Modus={Mode}, Map={Map}, Training={Training}, Team={Team}, Spielerposition={Position}",
            id, player.SteamID, _serverMode, Server.MapName, TrainingEnabled, player.TeamNum,
            player.PlayerPawn.Value?.AbsOrigin is { } origin ? RethrowCoordinates(origin.X, origin.Y, origin.Z) : "nicht verfügbar");
        if (_rethrows.Last(player.SteamID) is not { } grenade)
        {
            Logger.LogWarning("[Rethrow] Versuch={Attempt}: abgebrochen, kein gespeicherter Wurf", id);
            Tell(player, "Noch kein Wurf gespeichert. Wirf zuerst eine Granate."); return;
        }

        Logger.LogInformation("[Rethrow] Versuch={Attempt}: gespeicherte Daten, Typ={Type}, Position={Position}, Winkel={Angles}, Geschwindigkeit={Velocity}, Drehung={Spin}, ItemIndex={ItemIndex}, Incendiary={Incendiary}",
            id, grenade.DesignerName, RethrowCoordinates(grenade.Position), RethrowCoordinates(grenade.Angles),
            RethrowCoordinates(grenade.Velocity), RethrowCoordinates(grenade.AngularVelocity), grenade.ItemIndex, grenade.Incendiary);

        CBaseCSGrenadeProjectile? projectile = null;
        var phase = "Engine-Projektil-Erzeugung";
        try
        {

            if (player.PlayerPawn.Value is not { IsValid: true })
                throw new InvalidOperationException("Kein gültiger Spieler-Pawn für den Wiederholungswurf.");
            projectile = _projectileFactory.Create(grenade, player.TeamNum);
            if (projectile is not { IsValid: true })
            {
                Logger.LogWarning("[Rethrow] Versuch={Attempt}: {Phase} lieferte kein gültiges Projektil", id, phase);
                Tell(player, "Granate konnte nicht erzeugt werden. Details im Serverlog."); return;
            }
            // Bound diagnostics even when many rethrows are requested in quick succession.
            if (_rethrowObservations.Count >= 64)
            {
                var oldest = _rethrowObservations.MinBy(pair => pair.Value.Id);
                _rethrowObservations.Remove(oldest.Key);
                Logger.LogInformation("[Rethrow] Versuch={Attempt}: Beobachtung wegen Limit von 64 Versuchen beendet", oldest.Value.Id);
            }
            var observation = new RethrowObservation(id, player.SteamID, projectile, Server.CurrentTime);
            _syntheticProjectiles[(int)projectile.Index] = projectile.EntityHandle.Raw;
            _rethrowObservations[(int)projectile.Index] = observation;
            LogRethrowState(observation, "durch Engine erzeugt und gespawnt");
            phase = "Werfer und Eigenschaften nach Spawn";
            projectile.Globalname = GrenadeRethrowHistory.Marker;
            projectile.ItemIndex = grenade.ItemIndex;
            projectile.TeamNum = player.TeamNum;
            projectile.OwnerEntity.Raw = player.PlayerPawn.Raw;
            projectile.Thrower.Raw = player.PlayerPawn.Raw;
            projectile.OriginalThrower.Raw = player.PlayerPawn.Raw;
            if (grenade.DesignerName == "molotov_projectile")
                new CMolotovProjectile(projectile.Handle).IsIncGrenade = grenade.Incendiary;
            phase = "Wurfdaten und Teleport";
            Logger.LogInformation("[Rethrow] Versuch={Attempt}: Engine-Pfad={Path}, Owner={Owner}, Thrower={Thrower}, OriginalThrower={OriginalThrower}",
                id, grenade.DesignerName == "flashbang_projectile" ? "Flashbang-Spawn" : "native Granaten-Factory",
                projectile.OwnerEntity.Raw, projectile.Thrower.Raw, projectile.OriginalThrower.Raw);

            var p = grenade.Position;
            var v = grenade.Velocity;
            var a = grenade.Angles;
            var spin = grenade.AngularVelocity;
            projectile.InitialPosition.X = p.X;
            projectile.InitialPosition.Y = p.Y;
            projectile.InitialPosition.Z = p.Z;
            projectile.InitialVelocity.X = v.X;
            projectile.InitialVelocity.Y = v.Y;
            projectile.InitialVelocity.Z = v.Z;
            projectile.AngVelocity.X = spin.X;
            projectile.AngVelocity.Y = spin.Y;
            projectile.AngVelocity.Z = spin.Z;
            projectile.Teleport(new Vector(p.X, p.Y, p.Z), new QAngle(a.X, a.Y, a.Z), new Vector(v.X, v.Y, v.Z));
            if (grenade.DesignerName == "molotov_projectile")
                _fireEffectOrigins.Begin(player.SteamID, Server.CurrentTime, id);
            LogRethrowState(observation, "nach Teleport");
            Server.NextFrame(() => ObserveRethrow(observation, "nächster Frame"));
            foreach (var seconds in new[] { 0.25f, 1f, 3f, 10f, 30f })
                AddTimer(seconds, () => ObserveRethrow(observation, $"nach {seconds} s", seconds == 30f), TimerFlags.STOP_ON_MAPCHANGE);
            Tell(player, $"Projektil erzeugt (Versuch {id}); Wirkung noch nicht bestätigt.");
        }
        catch (Exception error)
        {
            Logger.LogError(error, "[Rethrow] Versuch={Attempt}: Fehler bei {Phase}, Typ={Type}, SteamID={SteamId}",
                id, phase, grenade.DesignerName, player.SteamID);
            if (projectile is { IsValid: true })
            {
                _rethrowObservations.Remove((int)projectile.Index);
                projectile.Remove();
            }
            Tell(player, $"Wiederholungswurf fehlgeschlagen (Versuch {id}). Details im Serverlog.");
        }
    }

    private void ObserveRethrow(RethrowObservation observation, string phase, bool final = false)
    {
        if (!_rethrowObservations.Values.Contains(observation)) return;
        LogRethrowState(observation, phase);
        if (!final) return;
        Logger.LogInformation("[Rethrow] Versuch={Attempt}: Beobachtung beendet, ZugeordnetesWirkungsereignis={Effect}. Fehlendes Ereignis beweist keine fehlende Wirkung; Molotov-Ereignisse haben keine Projektil-ID.",
            observation.Id, observation.EffectLogged);
        foreach (var key in _rethrowObservations.Where(pair => ReferenceEquals(pair.Value, observation)).Select(pair => pair.Key).ToArray())
            _rethrowObservations.Remove(key);
    }

    private void LogRethrowState(RethrowObservation observation, string phase)
    {
        // Diagnostics must never interrupt or remove an otherwise valid rethrow.
        try { ReadRethrowState(observation, phase); }
        catch (Exception error)
        { Logger.LogWarning(error, "[Rethrow] Versuch={Attempt}: Zustand bei {Phase} konnte nicht gelesen werden", observation.Id, phase); }
    }

    private void ReadRethrowState(RethrowObservation observation, string phase)
    {
        var entity = observation.Entity;
        var valid = entity.IsValid;
        var currentHandle = valid ? (uint?)entity.EntityHandle.Raw : null;
        if (!valid || currentHandle != observation.Handle)
        {
            if (!observation.MissingLogged)
                Logger.LogInformation("[Rethrow] Versuch={Attempt}: {Phase}, ursprüngliches Projektil nicht mehr erreichbar, EntityGültig={Valid}, GespeicherterHandle={Expected}, AktuellerHandle={Actual}, Löschereignis={Deleted}, Alter={Age}s. Ungültige Entity oder geänderter Handle bestätigt keine Detonation.",
                    observation.Id, phase, valid, observation.Handle, currentHandle, observation.DeletedLogged, Server.CurrentTime - observation.Started);
            observation.MissingLogged = true;
            return;
        }
        var position = entity.AbsOrigin;
        var velocity = entity.AbsVelocity;
        Logger.LogInformation("[Rethrow] Versuch={Attempt}: {Phase}, Entity={Entity}, Handle={Handle}, Alter={Age}s, Typ={Type}, Position={Position}, Geschwindigkeit={Velocity}, InitialPosition={InitialPosition}, InitialVelocity={InitialVelocity}, ItemIndex={ItemIndex}, Team={Team}, Globalname={Globalname}, Thrower={Thrower}, OriginalThrower={OriginalThrower}, Owner={Owner}, Modell={Model}, RenderMode={RenderMode}, CollisionGroup={Collision}, DetonateTime={DetonateTime}",
            observation.Id, phase, entity.Index, observation.Handle, Server.CurrentTime - observation.Started, entity.DesignerName,
            position == null ? "nicht verfügbar" : RethrowCoordinates(position.X, position.Y, position.Z),
            RethrowCoordinates(velocity.X, velocity.Y, velocity.Z),
            RethrowCoordinates(entity.InitialPosition.X, entity.InitialPosition.Y, entity.InitialPosition.Z),
            RethrowCoordinates(entity.InitialVelocity.X, entity.InitialVelocity.Y, entity.InitialVelocity.Z),
            entity.ItemIndex, entity.TeamNum, entity.Globalname, entity.Thrower.Raw, entity.OriginalThrower.Raw, entity.OwnerEntity.Raw,
            entity.CBodyComponent?.SceneNode?.GetSkeletonInstance().ModelState.ModelName, entity.RenderMode,
            entity.Collision.CollisionGroup, entity.DetonateTime);
    }

    private void LogRethrowEffect(int entityId, NadeKind kind, Coordinates target)
    {
        if (!_rethrowObservations.TryGetValue(entityId, out var observation)) return;
        // Do not associate an event with a different entity that reused the same index.
        if (observation.Entity.IsValid && observation.Entity.EntityHandle.Raw != observation.Handle) return;
        observation.EffectLogged = true;
        Logger.LogInformation("[Rethrow] Versuch={Attempt}: Wirkungsereignis, Entity={Entity}, Typ={Type}, Position={Position}, Alter={Age}s",
            observation.Id, entityId, kind, RethrowCoordinates(target), Server.CurrentTime - observation.Started);
    }

    private void LogRethrowDeletion(CEntityInstance entity)
    {
        try
        {
            if (!_rethrowObservations.TryGetValue((int)entity.Index, out var observation)) return;
            if (entity.EntityHandle.Raw != observation.Handle) return;
            observation.DeletedLogged = true;
            Logger.LogInformation("[Rethrow] Versuch={Attempt}: OnEntityDeleted, Entity={Entity}, Handle={Handle}, Typ={Type}, Alter={Age}s. Der Löschgrund wird von diesem Callback nicht geliefert.",
                observation.Id, entity.Index, observation.Handle, observation.Type, Server.CurrentTime - observation.Started);
        }
        catch (Exception error)
        { Logger.LogWarning(error, "[Rethrow] Löschereignis konnte nicht gelesen werden"); }
    }
}
